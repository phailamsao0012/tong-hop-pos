import { mentorReport } from '@/lib/teams/staff-scope';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { callsReport, parseCallsParams } from '@/lib/reports/calls-report';

// Cuộc gọi CSKH theo nhân viên × ngày (lib/reports/calls-report.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor' && !user.teamScope) return mentorReport(env.DB, user, request);
  const opts = await parseCallsParams(new URL(request.url).searchParams);
  if (opts instanceof Response) return opts;
  return Response.json(await callsReport(opts), { headers: { 'Cache-Control': 'private, no-store' } });
}
