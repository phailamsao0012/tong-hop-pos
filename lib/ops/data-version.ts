// "Phiên bản dữ liệu" cho cache báo cáo (worker.ts, cachedReport / warmRecentReports).
// Trước 05/11/2026 phiên bản lấy từ MAX(last_sync_at): lượt đồng bộ 5 phút luôn ghi mốc này kể cả khi Pancake không có gì mới,
// nên khóa cache đổi mỗi 5 phút và mọi báo cáo phải tính lại từ D1 dù số không đổi.
// Nay phiên bản chỉ đổi khi lượt đồng bộ thật sự ghi dữ liệu (đơn, dòng hàng, khách, ghi chú, số liệu ngày, nhân viên, sản phẩm,
// nhật ký đồng bộ): mốc DATA_CHANGED_KEY trong app_settings. Lệnh chỉ để ghi sổ (mốc nước, con trỏ, giờ đồng bộ, hàng chờ) không tính.
// Nghi ngờ thì coi là dữ liệu đổi: tính lại thừa chỉ tốn D1, còn bỏ sót làm số trên web đứng yên.

export const DATA_CHANGED_KEY = 'data_changed_at';

/** Lệnh ghi chỉ để ghi sổ cho đồng bộ, không đổi số trên báo cáo. */
const BOOKKEEPING = [
  /^\s*UPDATE\s+pos_shops\s+SET\b/i,
  /^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE)\s+app_settings\b/i,
  /^\s*DROP\s+INDEX\b/i,
];
const WRITE_SQL = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;

export const isBookkeepingWrite = (sql: string) => BOOKKEEPING.some((re) => re.test(sql));

/** Bọc D1: ghi nhận khi có lệnh ghi dữ liệu (không phải ghi sổ) thật sự đổi dòng. Không đổi câu lệnh hay kết quả. */
export function trackDataWrites(db: D1Database) {
  let changed = false;
  const sqlOf = new WeakMap<D1PreparedStatement, string>();
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const note = (sql: string, rowsWritten: unknown) => {
    if (!changed && Number(rowsWritten) > 0 && !isBookkeepingWrite(sql)) changed = true;
  };
  // first()/raw() không trả số dòng ghi: lệnh ghi (vd. có RETURNING) đi qua đây thì coi là đổi.
  const noteBlind = (sql: string) => { if (!changed && WRITE_SQL.test(sql) && !isBookkeepingWrite(sql)) changed = true; };
  const wrap = (s: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const proxy = new Proxy(s, {
      get(target, key) {
        if (key === 'bind') return (...args: Parameters<D1PreparedStatement['bind']>) => wrap(target.bind(...args), sql);
        if (key === 'run' || key === 'all') return async (...args: unknown[]) => {
          const result = (await Reflect.apply(Reflect.get(target, key), target, args)) as D1Result;
          note(sql, result?.meta?.rows_written);
          return result;
        };
        if (key === 'first' || key === 'raw') return async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(Reflect.get(target, key), target, args);
          noteBlind(sql);
          return result;
        };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    sqlOf.set(proxy, sql);
    originals.set(proxy, s);
    return proxy;
  };
  const tracked = new Proxy(db, {
    get(target, key) {
      if (key === 'prepare') return (sql: string) => wrap(target.prepare(sql), sql);
      if (key === 'batch') return async (batch: D1PreparedStatement[]) => {
        const results = await target.batch(batch.map((s) => originals.get(s) ?? s));
        results.forEach((r, i) => {
          const sql = sqlOf.get(batch[i]);
          // Lệnh không qua bọc (không biết câu SQL): có ghi dòng thì coi là đổi.
          if (sql === undefined) { if (Number(r?.meta?.rows_written) > 0) changed = true; } else note(sql, r?.meta?.rows_written);
        });
        return results;
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db: tracked, changed: () => changed, markChanged: () => { changed = true; } };
}

/** Ghi mốc "dữ liệu đổi". Giá trị chỉ cần khác lần trước (kèm chuỗi ngẫu nhiên phòng hai lượt cùng mili giây). */
export async function markDataChanged(db: D1Database, at = new Date()) {
  const value = `${at.toISOString()}#${crypto.randomUUID().slice(0, 8)}`;
  // Tên khoá viết thẳng trong câu lệnh để nhận ra được lượt ghi mốc (vd. test đếm lượt lưu hàng chờ không tính lượt này).
  const r = await db.prepare(`INSERT INTO app_settings (key,value,updated_at) VALUES ('${DATA_CHANGED_KEY}',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .bind(value, at.toISOString()).run();
  return Number(r.meta?.rows_written ?? 0);
}

/** Phiên bản dữ liệu.
 *  - v: mốc "dữ liệu đổi" (chưa có mốc, vd. lần đầu lên bản: dùng giờ đồng bộ như cũ), số POS đang lỗi, giờ sửa các khoá cấu hình
 *    ảnh hưởng số (settingKeys).
 *  - s: giờ đồng bộ gần nhất, chỉ dùng cho trang trạng thái đồng bộ (/api/sync/pos) để trang đó vẫn mới mỗi lượt. */
export async function readDataVersion(db: D1Database, settingKeys: string[]) {
  const keys = settingKeys.map(() => '?').join(',');
  const row = await db.prepare(
    `SELECT COALESCE((SELECT value FROM app_settings WHERE key=?),MAX(last_sync_at),'')||'|'||COALESCE(SUM(status='error'),0)||'|'||` +
    `COALESCE((SELECT MAX(updated_at) FROM app_settings WHERE key IN (${keys || "''"})),'') AS v,COALESCE(MAX(last_sync_at),'') AS s FROM pos_shops`,
  ).bind(DATA_CHANGED_KEY, ...settingKeys).first<{ v: string; s: string }>();
  return { v: row?.v ?? '', s: row?.s ?? '' };
}
