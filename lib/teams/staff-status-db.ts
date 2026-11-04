// Đọc / ghi trạng thái nhân viên (lib/teams/staff-status.ts) ở app_settings. Tách riêng vì đụng D1; phần thuần nằm ở staff-status.ts để test.
import { env } from 'cloudflare:workers';
import { STAFF_STATUS_KEY, applyStatusChanges, parseStatusJson } from '@/lib/teams/staff-status';

export async function readStaffStatus() {
  return parseStatusJson((await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(STAFF_STATUS_KEY).first<{ value: string }>())?.value);
}
export async function saveStaffStatus(changes: unknown) {
  const people = applyStatusChanges(await readStaffStatus(), changes);
  await env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(STAFF_STATUS_KEY, JSON.stringify(people), new Date().toISOString()).run();
  return people;
}
