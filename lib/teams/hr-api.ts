// Tra / ghi D1 cho các API web nhân sự gọi (app/api/hr/*). Tách khỏi các route đó (cải tổ B5, 05/11/2026), câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { forgetUserSessions } from '@/lib/auth/auth';
import { parseRole } from '@/lib/auth/access';
import { HANDOFF_TTL_MS } from '@/lib/teams/hr-link';
import type { PosStaffRow } from '@/lib/teams/hr-link';

export const sha256 = async (value: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))));

/** Ứng viên đã pass phỏng vấn / nhận việc, mới cập nhật trước (tối đa 300). */
export const passedCandidates = () => env.DB.prepare(`SELECT id,name,phone,position,team,birth_year,received_on,status,cv_url,hr_employee_id,updated_at FROM recruit_candidates
    WHERE deleted_at IS NULL AND status IN ('passed','trial') AND name<>'' ORDER BY updated_at DESC LIMIT 300`)
    .all<{ id: string; name: string; phone: string | null; position: string | null; team: string | null; birth_year: string | null; received_on: string | null; status: string; cv_url: string | null; hr_employee_id: string | null; updated_at: string }>();
/** Ghi mã hồ sơ web nhân sự đã tạo cho ứng viên (chỉ khi chưa có). */
export const markCandidateCreated = (employeeId: string, id: string) => env.DB.prepare('UPDATE recruit_candidates SET hr_employee_id=? WHERE id=? AND hr_employee_id IS NULL').bind(employeeId, id).run();

/** Tài khoản web chính theo mã (để khoá khi nghỉ việc). */
export const userById = (id: string) => env.DB.prepare('SELECT id,email,name,role,disabled FROM users WHERE id=?').bind(id).first<{ id: string; email: string; name: string; role: string; disabled: number }>();
/** Khoá tài khoản và đăng xuất mọi phiên. */
export const disableUser = async (id: string) => {
  const result = await env.DB.batch([
    env.DB.prepare('UPDATE users SET disabled=1, updated_at=? WHERE id=?').bind(new Date().toISOString(), id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),
  ]);
  forgetUserSessions(id);
  return result;
};

/** Lưu mã chuyển đăng nhập (băm) và dọn mã hết hạn. */
export const saveHandoff = async (code: string, user: { userId: string }, now: number) => env.DB.batch([
  env.DB.prepare('DELETE FROM hr_handoffs WHERE expires_at<?').bind(new Date(now).toISOString()),
  env.DB.prepare('INSERT INTO hr_handoffs (id,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(await sha256(code), user.userId, new Date(now).toISOString(), new Date(now + HANDOFF_TTL_MS).toISOString()),
]);
/** Dùng mã chuyển đăng nhập (một lần): xoá và trả người, hạn. */
export const redeemHandoff = (key: string) => env.DB.prepare('DELETE FROM hr_handoffs WHERE id=? RETURNING user_id,expires_at').bind(key).first<{ user_id: string; expires_at: string }>();

/** Nhân viên trên các POS và ngày có đơn đầu / cuối (cho web nhân sự nhập lần đầu). */
export const posStaffSources = () => Promise.all([
  env.DB.prepare('SELECT user_id,pos_id,name,email,phone,is_active,department,sale_group,source_created_at FROM pos_users').all<PosStaffRow>(),
  env.DB.prepare("SELECT seller_id, MIN(day) AS day, MAX(day) AS last FROM stats_daily WHERE seller_id<>'' GROUP BY seller_id").all<{ seller_id: string; day: string; last: string }>(),
]);

export async function hrUser(id: string) {
  const row = await env.DB.prepare('SELECT id,email,name,role,title,disabled FROM users WHERE id=?').bind(id)
    .first<{ id: string; email: string; name: string; role: string; title: string | null; disabled: number }>();
  return row ? { userId: row.id, email: row.email, name: row.name || row.email, role: parseRole(row.role), title: row.title ?? '', disabled: !!row.disabled } : null;
}

/** Mọi tài khoản web chính (không có mật khẩu, quyền xem). */
export const hrUserRows = () => env.DB.prepare('SELECT id,email,name,role,disabled FROM users ORDER BY name').all<{ id: string; email: string; name: string; role: string; disabled: number }>();
