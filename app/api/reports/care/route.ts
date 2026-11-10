import { mentorReport } from '@/lib/teams/staff-scope';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { careReport, parseCareParams } from '@/lib/reports/care-report';
import { privateJson } from '@/lib/auth/phone-privacy';

// Khách theo nhân viên (lib/reports/care-report.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor' && !user.teamScope) return mentorReport(env.DB, user, request);
  const opts = parseCareParams(new URL(request.url).searchParams);
  if ('error' in opts) return Response.json(opts, { status: 400 });
  return privateJson(user.role, await careReport(opts), { headers: { 'Cache-Control': 'private, no-store' } });
}
