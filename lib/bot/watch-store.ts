// Tách khỏi app/api/config/watch/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { WATCH_CHATS_KEY } from '@/lib/bot/watch';
import { parseChats } from '@/lib/bot/watch-core';

/** Chat nhận tin canh gác (chỉ chat riêng). */
export const readChats = async () => parseChats((await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(WATCH_CHATS_KEY).first<{ value: string }>())?.value);
/** Nhật ký sự cố canh gác gần đây (ops_incidents). */
export const incidentLog = () =>
  env.DB.prepare('SELECT key,severity,title,opened_at,notified_at,resolved_at,channel FROM ops_incidents ORDER BY opened_at DESC LIMIT 30')
    .all<{ key: string; severity: string; title: string; opened_at: string; notified_at: string | null; resolved_at: string | null; channel: string | null }>()
    .then((r) => r.results).catch(() => []);
/** Lưu danh sách chat nhận canh gác (đã kiểm hợp lệ). */
export const saveChats = (v: { chats: string[] }) =>
  env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
    .bind(WATCH_CHATS_KEY, JSON.stringify(v.chats), new Date().toISOString()).run();
