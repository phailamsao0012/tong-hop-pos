// Báo cáo 8h đã tính, giữ 3 ngày để Zalo tải ảnh qua /api/zalo/anh/<mã>. Mã ngẫu nhiên 32 ký tự là chìa khoá duy nhất
// (Zalo không gửi kèm đăng nhập); hết 3 ngày thì ảnh không mở được nữa và bị xoá ở lượt dọn 2h sáng.
import type { MorningReport } from '@/lib/zalo/morning-report';

const PREFIX = 'zalo_img:';
const KEEP_MS = 3 * 86400000;
const iso = (ms: number) => new Date(ms).toISOString();

export async function saveMorningImage(
  db: D1Database,
  report: MorningReport,
  now = Date.now(),
) {
  const id = crypto.randomUUID().replace(/-/g, '');
  await db
    .prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)')
    .bind(PREFIX + id, JSON.stringify(report), iso(now))
    .run();
  return id;
}

export async function loadMorningImage(
  db: D1Database,
  id: string,
  now = Date.now(),
): Promise<MorningReport | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  const row = await db
    .prepare('SELECT value,updated_at FROM app_settings WHERE key=?')
    .bind(PREFIX + id)
    .first<{ value: string; updated_at: string }>();
  if (!row || now - Date.parse(row.updated_at) > KEEP_MS) return null;
  try {
    return JSON.parse(row.value) as MorningReport;
  } catch {
    return null;
  }
}

export async function pruneMorningImages(db: D1Database, now = Date.now()) {
  await db
    .prepare(
      "DELETE FROM app_settings WHERE key>='zalo_img:' AND key<'zalo_img;' AND updated_at<?",
    )
    .bind(iso(now - KEEP_MS))
    .run();
}
