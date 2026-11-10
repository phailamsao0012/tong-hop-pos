// Tách khỏi app/api/presets/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

/** Báo cáo tuỳ chỉnh đã lưu của một người, mới sửa trước. */
export const listPresets = (user: { userId: string }) => env.DB.prepare(
    'SELECT id,title,config_json,updated_at FROM report_presets WHERE owner_id=? ORDER BY updated_at DESC',
  )
    .bind(user.userId)
    .all<{
      id: string;
      title: string;
      config_json: string;
      updated_at: string;
    }>();

export const insertPreset = (id: string, user: { userId: string }, title: string, encoded: string, now: string) => env.DB.prepare(
    'INSERT INTO report_presets (id,owner_id,title,config_json,created_at,updated_at) VALUES (?,?,?,?,?,?)',
  )
    .bind(id, user.userId, title, encoded, now, now)
    .run();

export const deletePreset = (id: string, user: { userId: string }) => env.DB.prepare('DELETE FROM report_presets WHERE id=? AND owner_id=?')
    .bind(id, user.userId)
    .run();
