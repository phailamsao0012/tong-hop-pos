// Đọc / ghi danh sách ngày lễ ở app_settings (anh Vũ 12/11/2026). Tách khỏi route theo luật 2 (route không có câu SQL).
import { env } from 'cloudflare:workers';
import { HOLIDAYS_KEY, parseHolidays, type Holiday } from '@/lib/shared/holidays';

export async function readHolidays(): Promise<{ holidays: Holiday[]; saved: boolean }> {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(HOLIDAYS_KEY).first<{ value: string }>();
  return { holidays: row ? parseHolidays(row.value) : [], saved: !!row };
}

export async function writeHolidays(list: Holiday[]) {
  await env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(HOLIDAYS_KEY, JSON.stringify(list), new Date().toISOString()).run();
}
