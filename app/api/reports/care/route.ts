import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { parseTeam, teamFilter } from '@/lib/team';
import { customerBackfillProgress } from '@/lib/customers-sync';

// Khách theo nhân viên (giống mục Khách hàng của Pancake): khách được phân công, ghi chú trao đổi mới nhất,
// thẻ, đã nhận, đã chi, lần mua cuối; lọc "N ngày chưa note" (mọi cuộc gọi đều phải note, nên ghi chú = lần chăm sóc gần nhất).
type Row = { id: string; pos_id: string; customer_id: string; name: string; phone: string | null; assigned_user_id: string | null; level: string | null; order_count: number; succeed_order_count: number; purchased_amount: number; last_order_at: string | null; inserted_at: string | null; tags_json: string; note_count: number; last_note_at: string | null; days_since_note: number | null };
type NoteRow = { id: string; pos_id: string; customer_id: string; author_id: string | null; author_name: string | null; message: string; created_at: string; rn: number };
const SORTS: Record<string, string> = {
  note_old: '(c.last_note_at IS NULL) DESC, c.last_note_at ASC',
  note_new: 'c.last_note_at DESC',
  purchased: 'c.purchased_amount DESC',
  last_order: 'c.last_order_at DESC',
  name: 'c.name COLLATE NOCASE ASC',
};

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const team = parseTeam(p.get('team'));
  const assigned = (p.get('assigned') ?? 'all').slice(0, 100);
  const q = (p.get('q') ?? '').trim().slice(0, 100);
  const minDays = Math.max(0, Math.min(3650, Number(p.get('minDays') ?? 0) || 0));
  const size = Math.max(1, Math.min(5000, Number(p.get('size') ?? 50) || 50));
  const page = Math.max(1, Number(p.get('page') ?? 1) || 1);
  const sort = SORTS[p.get('sort') ?? ''] ? (p.get('sort') as string) : 'note_old';
  const ph = posIds.map(() => '?').join(',');
  const cutoff = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 19);

  const where: string[] = [`c.pos_id IN (${ph})`];
  const binds: (string | number)[] = [...posIds];
  if (assigned === '__none') where.push('c.assigned_user_id IS NULL');
  else if (assigned !== 'all') { where.push('c.assigned_user_id=?'); binds.push(assigned); }
  const tf = teamFilter('c.assigned_user_id', team);
  if (q) { where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.phones_json LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (minDays > 0) { where.push('(c.last_note_at IS NULL OR c.last_note_at<?)'); binds.push(cutoff(minDays)); }
  const whereSql = `WHERE ${where.join(' AND ')}${tf}`;

  const [list, summary, staff, names, shops] = await env.DB.batch([
    env.DB.prepare(`SELECT c.id, c.pos_id, c.customer_id, c.name, c.phone, c.assigned_user_id, c.level, c.order_count, c.succeed_order_count, c.purchased_amount, c.last_order_at, c.inserted_at, c.tags_json, c.note_count, c.last_note_at,
        CASE WHEN c.last_note_at IS NULL THEN NULL ELSE CAST(julianday('now') - julianday(c.last_note_at) AS INTEGER) END AS days_since_note
      FROM pos_customers c ${whereSql} ORDER BY ${SORTS[sort]}, c.id LIMIT ? OFFSET ?`).bind(...binds, size, (page - 1) * size),
    env.DB.prepare(`SELECT COUNT(*) AS total, SUM(c.last_note_at IS NULL) AS never_noted, SUM(c.last_note_at IS NOT NULL AND c.last_note_at<?) AS over20, SUM(c.succeed_order_count>0) AS buyers, SUM(c.purchased_amount) AS purchased
      FROM pos_customers c ${whereSql}`).bind(cutoff(20), ...binds),
    // Theo nhân viên được phân công (không phụ thuộc bộ lọc nhân viên/tìm kiếm/N ngày, chỉ theo POS + nhóm).
    env.DB.prepare(`SELECT c.assigned_user_id, COUNT(*) AS n, SUM(c.last_note_at IS NULL) AS never_noted, SUM(c.last_note_at IS NOT NULL AND c.last_note_at<?) AS over7, SUM(c.last_note_at IS NOT NULL AND c.last_note_at<?) AS over20, SUM(c.last_note_at>=?) AS noted_today
      FROM pos_customers c WHERE c.pos_id IN (${ph}) AND c.assigned_user_id IS NOT NULL${teamFilter('c.assigned_user_id', team)} GROUP BY 1 ORDER BY n DESC`).bind(cutoff(7), cutoff(20), cutoff(1), ...posIds),
    env.DB.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
    env.DB.prepare('SELECT id, shop_id, customer_cursor FROM pos_shops'),
  ]);
  const rows = list.results as Row[];
  const nameMap = new Map((names.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));
  const shopMap = new Map((shops.results as { id: string; shop_id: string | null }[]).map((r) => [r.id, r.shop_id]));
  const backfill = customerBackfillProgress((shops.results as { id: string; customer_cursor: string | null }[]).filter((r) => posIds.includes(r.id)));

  // 3 ghi chú mới nhất của các khách trong trang (theo lô, mỗi POS).
  const notesByCustomer = new Map<string, NoteRow[]>();
  const byPos = new Map<string, string[]>();
  for (const r of rows) { if (!byPos.has(r.pos_id)) byPos.set(r.pos_id, []); byPos.get(r.pos_id)!.push(r.customer_id); }
  for (const [posId, ids] of byPos) {
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const r = await env.DB.prepare(`SELECT id, pos_id, customer_id, author_id, author_name, message, created_at, rn FROM (
          SELECT n.id, n.pos_id, n.customer_id, n.author_id, n.author_name, n.message, n.created_at, ROW_NUMBER() OVER (PARTITION BY n.customer_id ORDER BY n.created_at DESC) AS rn
          FROM customer_notes n WHERE n.pos_id=? AND n.customer_id IN (${chunk.map(() => '?').join(',')})
        ) WHERE rn<=3 ORDER BY customer_id, rn`).bind(posId, ...chunk).all<NoteRow>();
      for (const n of r.results) { const k = `${n.pos_id}:${n.customer_id}`; notesByCustomer.set(k, [...(notesByCustomer.get(k) ?? []), n]); }
    }
  }
  const sum = summary.results[0] as { total: number; never_noted: number; over20: number; buyers: number; purchased: number };
  return Response.json({
    page, size, total: Number(sum?.total ?? 0), minDays, sort, backfill,
    summary: { total: Number(sum?.total ?? 0), neverNoted: Number(sum?.never_noted ?? 0), over20: Number(sum?.over20 ?? 0), buyers: Number(sum?.buyers ?? 0), purchased: Number(sum?.purchased ?? 0) },
    staff: (staff.results as { assigned_user_id: string; n: number; never_noted: number; over7: number; over20: number; noted_today: number }[]).map((s) => ({
      id: s.assigned_user_id, name: nameMap.get(s.assigned_user_id)?.name ?? s.assigned_user_id, department: nameMap.get(s.assigned_user_id)?.department ?? null,
      assigned: Number(s.n), neverNoted: Number(s.never_noted), over7: Number(s.over7), over20: Number(s.over20), notedToday: Number(s.noted_today),
    })),
    rows: rows.map((r) => ({
      id: r.id, posId: r.pos_id, posName: POS.find((x) => x.id === r.pos_id)?.name ?? r.pos_id, shopId: shopMap.get(r.pos_id) ?? null, customerId: r.customer_id, name: r.name, phone: r.phone,
      assignedId: r.assigned_user_id, assignedName: r.assigned_user_id ? nameMap.get(r.assigned_user_id)?.name ?? r.assigned_user_id : null,
      level: r.level, orderCount: Number(r.order_count), succeedOrders: Number(r.succeed_order_count), purchased: Number(r.purchased_amount), lastOrderAt: r.last_order_at, insertedAt: r.inserted_at,
      tags: safeTags(r.tags_json), noteCount: Number(r.note_count), lastNoteAt: r.last_note_at, daysSinceNote: r.days_since_note === null ? null : Number(r.days_since_note),
      notes: (notesByCustomer.get(r.id) ?? []).map((n) => ({ id: n.id, author: n.author_name ?? (n.author_id ? nameMap.get(n.author_id)?.name ?? '' : ''), message: n.message, createdAt: n.created_at })),
    })),
    definitions: {
      note: 'Ghi chú trao đổi = ghi chú nhân viên viết trên hồ sơ khách ở Pancake (mục Khách hàng). Mọi cuộc gọi đều phải ghi chú, nên "lần note cuối" = lần chăm sóc gần nhất.',
      days: '"N ngày chưa note" tính từ ghi chú mới nhất của bất kỳ ai; khách chưa có ghi chú nào được đưa vào danh sách và đánh dấu "Chưa note".',
      source: 'Đã nhận, số tiền đã chi, lần mua cuối, thẻ và người phân công lấy đúng theo hồ sơ khách Pancake (cập nhật theo đồng bộ khách hàng, vài phút một lần).',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

function safeTags(json: string): string[] {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
