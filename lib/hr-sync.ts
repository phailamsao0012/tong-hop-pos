// Kéo dữ liệu web nhân sự về bảng hr_* (bản sao chỉ đọc): 5 phút một lần theo Cron, và ngay khi web nhân sự báo có thay đổi.
// Dữ liệu không đổi (so mã băm) thì không ghi gì.
import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER } from '@/lib/hr-link';
import { computePosTeams, isSnapshot, snapshotKey, type HrSnapshot } from '@/lib/hr-copy';
import { todayVn } from '@/lib/report-time';

export const HR_SYNC_KEY = 'hr_sync';
export type HrSyncState = { hash: string | null; pulledAt: string | null; changedAt: string | null; employees: number; linked: number; error: string | null };

export async function hrSyncState(): Promise<HrSyncState> {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(HR_SYNC_KEY).first<{ value: string }>();
  const empty: HrSyncState = { hash: null, pulledAt: null, changedAt: null, employees: 0, linked: 0, error: null };
  try { return row ? { ...empty, ...JSON.parse(row.value) } : empty; } catch { return empty; }
}
const saveState = (s: HrSyncState) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(HR_SYNC_KEY, JSON.stringify(s), new Date().toISOString());

/** Gọi web nhân sự: qua Service Binding HR khi có (cùng tên miền thì Worker không gọi nhau qua internet được), không có thì qua CRM_URL. */
export function crmFetch(path: string, init: RequestInit = {}) {
  const secret = env.HR_SHARED_SECRET?.trim();
  if (!secret) throw new Error('Thiếu bí mật HR_SHARED_SECRET.');
  const base = (env.CRM_URL?.trim() || 'https://crm.tonghopposmegatech.io.vn').replace(/\/+$/, '');
  const request = new Request(`${base}${path}`, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), [HR_SECRET_HEADER]: secret } });
  return env.HR ? env.HR.fetch(request) : fetch(request);
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function replaceStatements(s: HrSnapshot, day: string) {
  const db = env.DB;
  const out: D1PreparedStatement[] = ['hr_offices', 'hr_departments', 'hr_levels', 'hr_titles', 'hr_employees', 'hr_assignments', 'hr_pos_team'].map((t) => db.prepare(`DELETE FROM ${t}`));
  for (const o of s.offices) out.push(db.prepare('INSERT INTO hr_offices (id,name) VALUES (?,?)').bind(o.id, o.name));
  for (const d of s.departments) out.push(db.prepare('INSERT INTO hr_departments (id,name,parent_id,kind,office_id,director_employee_id,active) VALUES (?,?,?,?,?,?,?)').bind(d.id, d.name, d.parent_id, d.kind, d.office_id, d.director_employee_id ?? null, d.active ? 1 : 0));
  for (const l of s.levels) out.push(db.prepare('INSERT INTO hr_levels (id,name,rank,is_manager) VALUES (?,?,?,?)').bind(l.id, l.name, l.rank, l.is_manager ? 1 : 0));
  for (const t of s.titles) out.push(db.prepare('INSERT INTO hr_titles (id,name) VALUES (?,?)').bind(t.id, t.name));
  for (const e of s.employees) out.push(db.prepare('INSERT INTO hr_employees (id,code,full_name,email,phone,office_id,joined_on,status,left_on,main_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(e.id, e.code, e.full_name, e.email, e.phone, e.office_id, e.joined_on, e.status, e.left_on, e.main_user_id));
  for (const a of s.assignments) out.push(db.prepare('INSERT INTO hr_assignments (id,employee_id,department_id,level_id,title_id,manager_employee_id,is_primary,start_on,end_on) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(a.id, a.employee_id, a.department_id, a.level_id, a.title_id, a.manager_employee_id, a.is_primary ? 1 : 0, a.start_on, a.end_on));
  for (const p of computePosTeams(s, day)) out.push(db.prepare(`INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,department,department_id,level,title,leader_employee_id,leader_name,head_name,manager_pos_user_id,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(p.pos_user_id, p.employee_id, p.employee_name, p.team, p.department, p.department_id, p.level, p.title, p.leader_employee_id, p.leader_name, p.head_name, p.manager_pos_user_id, p.status));
  return out;
}

/**
 * Kéo ảnh chụp từ web nhân sự. force: ghi lại kể cả khi mã băm không đổi (đầu ngày tính lại vai trò hiệu lực theo ngày mới).
 * Trả về trạng thái sau lần kéo; lỗi được lưu vào trạng thái để trang cài đặt hiển thị, không ném ra ngoài.
 */
export async function pullHr(force = false): Promise<HrSyncState> {
  const prev = await hrSyncState();
  const now = new Date().toISOString();
  try {
    const res = await crmFetch('/api/v1/snapshot', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Web nhân sự trả lỗi ${res.status}.`);
    const data: unknown = await res.json();
    if (!isSnapshot(data)) throw new Error('Dữ liệu web nhân sự không đúng định dạng.');
    const day = todayVn();
    // Mã băm gồm cả ngày: vai trò có ngày bắt đầu/kết thúc nên sang ngày mới phải tính lại.
    const hash = await sha256(`${day}|${snapshotKey(data)}`);
    const next: HrSyncState = { hash, pulledAt: now, changedAt: prev.changedAt, employees: data.employees.length, linked: data.posAccounts.length, error: null };
    if (hash === prev.hash && !force) { await saveState(next).run(); return next; }
    next.changedAt = now;
    await env.DB.batch([...replaceStatements(data, day), saveState(next)]);
    return next;
  } catch (error) {
    const next = { ...prev, error: error instanceof Error ? error.message : 'Không kéo được dữ liệu nhân sự.' };
    console.error('hr pull failed', error);
    await saveState(next).run().catch(() => undefined);
    return next;
  }
}
