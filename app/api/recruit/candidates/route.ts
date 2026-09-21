import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { STATUS_LABELS, type CandidateRow } from '@/lib/recruit';

// Danh sách ứng viên (mọi file / tab) cho trang Tuyển dụng; ?id=… trả chi tiết kèm lịch sử sự kiện.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const id = p.get('id');
  const db = env.DB;
  if (id) {
    const [c, events, cv] = await Promise.all([
      db.prepare('SELECT * FROM recruit_candidates WHERE id=?').bind(id).first<CandidateRow>(),
      db.prepare('SELECT id, kind, changes_json, created_at, notified_at FROM recruit_events WHERE candidate_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all<{ id: number; kind: string; changes_json: string; created_at: string; notified_at: string | null }>(),
      db.prepare('SELECT drive_file_id, name, mime, size, telegram_file_id, sent_at, updated_at FROM recruit_cv WHERE candidate_id=?').bind(id).first<{ drive_file_id: string; name: string; mime: string; size: number; telegram_file_id: string | null; sent_at: string | null; updated_at: string }>(),
    ]);
    if (!c) return Response.json({ error: 'Không có ứng viên này.' }, { status: 404 });
    return Response.json({ candidate: pack(c), events: events.results.map((e) => ({ id: e.id, kind: e.kind, changes: JSON.parse(e.changes_json || '[]'), createdAt: e.created_at, notifiedAt: e.notified_at })), cv: cv ? { name: cv.name, mime: cv.mime, size: cv.size, viewable: !!cv.telegram_file_id, updatedAt: cv.updated_at } : null }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const includeDeleted = p.get('deleted') === '1';
  const [rows, sources, cvs] = await Promise.all([
    db.prepare(`SELECT * FROM recruit_candidates ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY updated_at DESC LIMIT 5000`).all<CandidateRow>(),
    db.prepare('SELECT file_id, file_name, tabs_json, last_snapshot_at, last_change_at FROM recruit_sources').all<{ file_id: string; file_name: string; tabs_json: string; last_snapshot_at: string; last_change_at: string | null }>(),
    db.prepare('SELECT candidate_id, telegram_file_id FROM recruit_cv').all<{ candidate_id: string; telegram_file_id: string | null }>(),
  ]);
  const viewable = new Set(cvs.results.filter((r) => r.telegram_file_id).map((r) => r.candidate_id));
  return Response.json({
    candidates: rows.results.map((c) => ({ ...pack(c), cvViewable: viewable.has(c.id) })),
    sources: sources.results.map((s) => ({ fileId: s.file_id, fileName: s.file_name, tabs: JSON.parse(s.tabs_json || '[]'), lastSnapshotAt: s.last_snapshot_at, lastChangeAt: s.last_change_at })),
    statusLabels: STATUS_LABELS,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
const pack = (c: CandidateRow) => ({
  id: c.id, fileId: c.file_id, fileName: c.file_name, tab: c.tab, rowNum: c.row_num, name: c.name, phone: c.phone, position: c.position, team: c.team, handler: c.handler,
  birthYear: c.birth_year, receivedOn: c.received_on, cvUrl: c.cv_url, status: c.status, data: JSON.parse(c.data_json || '{}') as Record<string, string>,
  firstSeenAt: c.first_seen_at, updatedAt: c.updated_at, deletedAt: c.deleted_at,
});
