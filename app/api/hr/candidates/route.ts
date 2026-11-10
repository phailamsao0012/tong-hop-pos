import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/teams/hr-link';
import { STATUS_LABELS } from '@/lib/teams/recruit';
import { markCandidateCreated, passedCandidates } from '@/lib/teams/hr-api';

const denied = () => Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });

// Ứng viên đã pass phỏng vấn / nhận việc cho web nhân sự tạo hồ sơ bằng một nút.
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return denied();
  const rows = await passedCandidates();
  return Response.json({ candidates: rows.results.map((r) => ({ ...r, status_label: STATUS_LABELS[r.status] ?? r.status })) }, { headers: { 'Cache-Control': 'no-store' } });
}

// Web nhân sự báo đã tạo hồ sơ cho ứng viên: { id, employeeId }.
export async function POST(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return denied();
  const body = await request.json().catch(() => null) as { id?: unknown; employeeId?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '', employeeId = typeof body?.employeeId === 'string' ? body.employeeId.slice(0, 80) : '';
  if (!id || !employeeId) return Response.json({ error: 'Thiếu ứng viên hoặc mã nhân viên.' }, { status: 400 });
  const r = await markCandidateCreated(employeeId, id);
  if (!r.meta.changes) return Response.json({ error: 'Ứng viên không có hoặc đã tạo hồ sơ.' }, { status: 409 });
  return Response.json({ ok: true });
}
