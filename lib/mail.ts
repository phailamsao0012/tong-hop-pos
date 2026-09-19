import { env } from 'cloudflare:workers';

// Gửi thư qua Brevo (api.brevo.com). Cần bí mật BREVO_API_KEY và địa chỉ gửi MAIL_FROM đã xác minh trên Brevo.
export const mailConfigured = () => !!(env.BREVO_API_KEY?.trim() && env.MAIL_FROM?.trim());

export async function sendMail(to: string, subject: string, html: string, text?: string) {
  const key = env.BREVO_API_KEY?.trim(), from = env.MAIL_FROM?.trim();
  if (!key || !from) throw new Error('Chưa cấu hình gửi thư (BREVO_API_KEY, MAIL_FROM).');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: from, name: 'MEGATECH POS' }, to: [{ email: to }], subject, htmlContent: html, textContent: text ?? html.replace(/<[^>]+>/g, ' ') }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Gửi thư thất bại (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

export const otpMail = (code: string, minutes: number) => ({
  subject: `${code} là mã đăng nhập MEGATECH POS`,
  html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e3e8e4;border-radius:12px">
    <h2 style="margin:0 0 8px;color:#17342b">Mã đăng nhập</h2>
    <p style="color:#4c5f55">Nhập mã sau vào màn hình đăng nhập. Mã có hiệu lực ${minutes} phút, chỉ dùng một lần.</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#17684b;margin:16px 0">${code}</p>
    <p style="color:#7d9184;font-size:12px">Nếu bạn không đăng nhập, hãy bỏ qua thư này và báo quản trị viên.</p></div>`,
});
