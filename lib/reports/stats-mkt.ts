// Số MKT tính sẵn theo ngày (anh Vũ 04/11/2026 "ok sửa"): stats_daily_mkt (migration 0050) giữ số đơn và doanh số theo
// (POS, ngày xác nhận giờ VN, Marketer, người bán) cho đơn từ Đã xác nhận trở đi (không Mới, Chờ xác nhận, Hủy, Đã xóa).
// Xu hướng và Điều hành đọc bảng nhỏ này thay vì quét đơn gốc theo first_confirmed_at: số đo D1 04/11 cho thấy câu đó 4–8 giây mỗi lần,
// làm các khối khác của Điều hành chờ quá giờ ("Không tải được"). Lọc người được tính / team Sale làm lúc đọc nên đổi team không cần dựng lại.
import { addDays, vnDayStartUtc } from '@/lib/shared/report-time';
import { diffStatements, run } from '@/lib/reports/stats-write';

type Row = Record<string, string | number | null>;

export const MKT_COLUMNS = ['orders', 'net'] as const;
/** Đơn MKT được tính: đã xác nhận (Đã xác nhận trở đi) và có Marketer; giống điều kiện cũ của Xu hướng / Hiệu quả MKT. */
export const MKT_CONFIRMED =
  "status_code NOT IN (0,17,6,7) AND NULLIF(TRIM(marketer_id),'') IS NOT NULL";
const NET =
  'COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0))';
export const mktSql = `SELECT date(datetime(first_confirmed_at,'+7 hours')) AS day, marketer_id, COALESCE(seller_id,'') AS seller_id,
    COUNT(*) AS orders, COALESCE(SUM(${NET}),0) AS net
  FROM raw_pos_orders WHERE pos_id=? AND first_confirmed_at>=? AND first_confirmed_at<? AND ${MKT_CONFIRMED} GROUP BY 1, 2, 3`;
export const mktExisting = `SELECT id, ${MKT_COLUMNS.join(',')} FROM stats_daily_mkt WHERE pos_id=? AND day>=? AND day<=?`;

const DDL = [
  "CREATE TABLE IF NOT EXISTS `stats_daily_mkt` (`id` text PRIMARY KEY NOT NULL, `pos_id` text NOT NULL, `day` text NOT NULL, `marketer_id` text NOT NULL, `seller_id` text DEFAULT '' NOT NULL, `orders` integer DEFAULT 0 NOT NULL, `net` integer DEFAULT 0 NOT NULL, `updated_at` text NOT NULL)",
  'CREATE INDEX IF NOT EXISTS `idx_stats_daily_mkt_pos_day` ON `stats_daily_mkt` (`pos_id`,`day`)',
];
let schemaReady = false;
/** Tạo bảng nếu chưa có (máy PC chạy bản sao DB không qua migration). Nhớ bằng cờ mỗi isolate. */
export async function ensureMktSchema(db: D1Database) {
  if (schemaReady) return;
  const exists = await db
    .prepare(
      "SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='stats_daily_mkt'",
    )
    .first();
  if (!exists) for (const sql of DDL) await db.prepare(sql).run();
  schemaReady = true;
}

/** Câu ghi stats_daily_mkt cho một khoảng ngày từ kết quả mktSql và dòng đang có. */
export function mktStatements(
  db: D1Database,
  posId: string,
  range: { start: string; end: string },
  rows: Row[],
  existing: Row[],
  now: string,
) {
  const keyOf = (r: Row) => ({
    pos_id: posId,
    day: String(r.day),
    marketer_id: String(r.marketer_id ?? ''),
    seller_id: String(r.seller_id ?? ''),
  });
  return diffStatements(
    db,
    'stats_daily_mkt',
    keyOf,
    MKT_COLUMNS,
    range,
    rows,
    existing,
    now,
  );
}

/** Hai câu đọc cho một khoảng ngày (giờ VN), để gộp vào lô đọc của rebuildStats. */
export function mktReads(
  db: D1Database,
  posId: string,
  range: { start: string; end: string },
) {
  return [
    db
      .prepare(mktSql)
      .bind(
        posId,
        vnDayStartUtc(range.start),
        vnDayStartUtc(addDays(range.end, 1)),
      ),
    db.prepare(mktExisting).bind(posId, range.start, range.end),
  ];
}

/** Điền stats_daily_mkt cho một (POS, tháng) có đơn từ trước khi bảng ra đời (bộ hẹn giờ gọi dần). */
export async function buildMktMonth(
  db: D1Database,
  posId: string,
  month: string,
) {
  await ensureMktSchema(db);
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const range = {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, '0')}`,
  };
  const [rows, existing] = await db.batch(mktReads(db, posId, range));
  return run(
    db,
    mktStatements(
      db,
      posId,
      range,
      rows.results as Row[],
      existing.results as Row[],
      new Date().toISOString(),
    ),
  );
}

/** Khóa app_settings: tháng cũ đã điền xong (giá trị = MKT_EPOCH). Chưa xong thì nơi đọc quét đơn gốc như cũ. */
export const MKT_READY_KEY = 'stats_mkt_ready';
export const MKT_EPOCH = 1;
let ready = { value: false, at: 0 };
/** Nhớ 60 giây mỗi isolate. */
export async function mktStatsReady(db: D1Database) {
  if (Date.now() - ready.at < 60000) return ready.value;
  let value = false;
  try {
    const r = await db
      .prepare('SELECT value FROM app_settings WHERE key=?')
      .bind(MKT_READY_KEY)
      .first<{ value: string }>();
    value = r?.value === String(MKT_EPOCH);
  } catch {
    value = false;
  }
  ready = { value, at: Date.now() };
  return value;
}
/** Chỉ cho test: quên cờ đã nhớ. */
export function resetMktReadyMemo() {
  ready = { value: false, at: 0 };
}
