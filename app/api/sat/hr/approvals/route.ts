import { auditHeaders } from '@/lib/audit';
import { NO_STORE, hrBoss, hrGet, satCall, satResponse } from '@/lib/sat-proxy';
import { decisionSummary } from '@/lib/satellites';

// App của sếp · Nhân sự / Duyệt: yêu cầu đổi chức vụ, trạng thái chờ duyệt (?state=pending|done) và duyệt / từ chối.
// Web nhân sự tự kiểm ai được duyệt yêu cầu nào; worker ghi nhật ký lần duyệt (header x-audit mô tả thao tác).
export async function GET(request: Request) {
  return hrGet(request, '/api/v1/app/approvals', ['state']);
}

/** Body { ids, decision: 'approve'|'reject', note? } chuyển nguyên sang web nhân sự → { done, skipped }. */
export async function POST(request: Request) {
  const { user, error } = await hrBoss();
  if (error) return error;
  const text = await request.text().catch(() => '');
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400, headers: NO_STORE }); }
  const r = await satCall(user, '/api/v1/app/approvals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: text });
  if (r.status !== 200) return satResponse(r);
  // Web nhân sự đã duyệt xong: lỗi khi dựng mô tả nhật ký không được biến thành lỗi cho app (worker tự tóm tắt thay).
  let audit: Record<string, string> = {};
  try { audit = auditHeaders(decisionSummary(body, r.body), 'hr.decide'); } catch (error) { console.error('hr decide audit summary failed', error); }
  return satResponse(r, audit);
}
