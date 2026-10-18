import { getSessionUser, isOwner, forbidden, unauthorized } from '@/lib/auth';
import { auditHeaders } from '@/lib/audit';
import { BackupError, restoreTable } from '@/lib/backup';

// Khôi phục một bảng của một ngày vào bảng MỚI restore_<bảng>_<yyyymmdd> (không ghi đè bảng đang chạy). Chỉ chủ hệ thống.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  let body: { date?: unknown; table?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const text = (v: unknown, n: number) => typeof v === 'string' ? v.slice(0, n) : '?';
  const what = `${text(body.table, 40)} ngày ${text(body.date, 10)}`;
  try {
    const r = await restoreTable(body.date, body.table);
    return Response.json({ ok: true, ...r }, { headers: auditHeaders(`Khôi phục ${what} → ${r.table} (${r.rows}/${r.expected} dòng)`, 'backup.restore') });
  } catch (e) {
    const status = e instanceof BackupError ? e.status : 500;
    const error = e instanceof BackupError ? e.message : 'Lỗi máy chủ.';
    if (!(e instanceof BackupError)) console.error('backup restore failed');
    return Response.json({ error }, { status, headers: auditHeaders(`Khôi phục ${what} lỗi: ${error}`, 'backup.restore') });
  }
}
