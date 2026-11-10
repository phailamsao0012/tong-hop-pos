import { getSessionUser, isOwner, forbidden, unauthorized } from '@/lib/auth/auth';
import { auditHeaders } from '@/lib/ops/audit';
import { BACKUP_TABLES, BackupError, EXCLUDED_TABLES, NOT_CONFIGURED, listBackups, readBackupStatus, readManifest, runBackup } from '@/lib/ops/backup';

// Sao lưu đêm ra R2 (chỉ chủ hệ thống; worker.ts cũng chặn qua OWNER_ONLY trong lib/access.ts).
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (e: unknown) => e instanceof BackupError
  ? Response.json({ error: e.message }, { status: e.status, headers: noStore })
  : (console.error('backup api failed'), Response.json({ error: 'Lỗi máy chủ.' }, { status: 500, headers: noStore }));

/** Trạng thái lượt gần nhất + danh sách bản sao lưu; ?date=YYYY-MM-DD trả manifest (số dòng từng bảng) của ngày đó. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  try {
    const date = new URL(request.url).searchParams.get('date');
    if (date) {
      const m = await readManifest(date);
      if (!m) return Response.json({ error: `Không có bản sao lưu ngày ${date}.` }, { status: 404, headers: noStore });
      return Response.json({ date: m.date, finishedAt: m.finishedAt, tables: m.tables.map((t) => ({ name: t.name, rows: t.rows, bytes: t.bytes, redacted: t.redacted ?? [] })), missing: m.missing }, { headers: noStore });
    }
    const backups = await listBackups();
    return Response.json({ status: await readBackupStatus(), configured: backups !== null, backups: backups ?? [], tables: BACKUP_TABLES, excluded: EXCLUDED_TABLES }, { headers: noStore });
  } catch (e) { return fail(e); }
}

/** Chạy sao lưu ngay (thử trên demo, hoặc sau khi sửa lỗi lượt đêm). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  try {
    const s = await runBackup();
    if (!s) return Response.json({ error: 'Đang có lượt sao lưu chạy, thử lại sau.' }, { status: 409, headers: noStore });
    const summary = s.status === 'ok' ? `Sao lưu ${s.date}: ${Object.keys(s.tables ?? {}).length} bảng, ${s.bytes ?? 0} byte` : `Sao lưu ${s.date}: ${s.status} · ${s.error ?? ''}`;
    const status = s.status === 'ok' ? 200 : s.status === 'off' ? 503 : 500;
    return Response.json({ ...(s.status === 'off' ? { error: NOT_CONFIGURED } : s.status === 'fail' ? { error: s.error } : {}), status: s }, { status, headers: { ...noStore, ...auditHeaders(summary, 'backup.run') } });
  } catch (e) { return fail(e); }
}
