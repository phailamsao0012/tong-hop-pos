import { mentorReport } from '@/lib/teams/staff-scope';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { careReport, parseCareParams } from '@/lib/reports/care-report';

// Khách theo nhân viên (lib/reports/care-report.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor' && !user.teamScope) return mentorReport(env.DB, user, request);
  const opts = parseCareParams(new URL(request.url).searchParams);
  if ('error' in opts) return Response.json(opts, { status: 400 });
  return Response.json(await careReport(opts), { headers: { 'Cache-Control': 'private, no-store' } });
}
