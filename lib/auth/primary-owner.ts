import { env } from 'cloudflare:workers';

// Chủ hệ thống gốc = tài khoản chủ hệ thống tạo sớm nhất (30/09/2026). Chỉ người này được cấp / bỏ quyền chủ hệ thống, sửa, khóa
// hay đăng xuất tài khoản chủ hệ thống khác; chủ hệ thống được cấp thêm có mọi quyền còn lại.
export async function primaryOwnerId() {
  return (await env.DB.prepare("SELECT id FROM users WHERE role='owner' ORDER BY created_at, id LIMIT 1").first<{ id: string }>())?.id ?? null;
}
