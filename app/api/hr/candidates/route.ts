import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';
import { STATUS_LABELS } from '@/lib/recruit';

const denied = () => Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });

// Ứng viên đã pass phỏng vấn / nhận việc cho web nhân sự tạo hồ sơ bằng một nút.
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return denied();
  const rows = await env.DB.prepare(`SELECT id,name,phone,position,team,birth_year,received_on,status,cv_url,hr_employee_id,updated_at FROM recruit_candidates
    WHERE deleted_at IS NULL AND status IN ('passed','trial') AND name<>'' ORDER BY updated_at DESC LIMIT 300`)
    .all<{ id: string; name: string; phone: string | null; position: string | null; team: string | null; birth_year: string | null; received_on: string | null; status: string; cv_url: string | null; hr_employee_id: string | null; updated_at: string }>();
  return Response.json({ candidates: rows.results.map((r) => ({ ...r, status_label: STATUS_LABELS[r.status] ?? r.status })) }, { headers: { 'Cache-Control': 'no-store' } });
}

// Web nhân sự báo đã tạo hồ sơ cho ứng viên: { id, employeeId }.
export async function POST(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return denied();
  const body = await request.json().catch(() => null) as { id?: unknown; employeeId?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '', employeeId = typeof body?.employeeId === 'string' ? body.employeeId.slice(0, 80) : '';
  if (!id || !employeeId) return Response.json({ error: 'Thiếu ứng viên hoặc mã nhân viên.' }, { status: 400 });
  const r = await env.DB.prepare('UPDATE recruit_candidates SET hr_employee_id=? WHERE id=? AND hr_employee_id IS NULL').bind(employeeId, id).run();
  if (!r.meta.changes) return Response.json({ error: 'Ứng viên không có hoặc đã tạo hồ sơ.' }, { status: 409 });
  return Response.json({ ok: true });
}
