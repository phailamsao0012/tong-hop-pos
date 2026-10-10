// D1 giả chạy trên node:sqlite (có sẵn từ Node 22) cho test báo cáo thật: dựng bảng từ drizzle/*.sql, nạp thế giới demo (lib/demo/world.ts).
// Không gọi mạng, không cần Cloudflare. Dùng cho test đối chiếu số (golden), 10/10/2026.
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { SHOPS, dayData, hrSnapshot, listUsers, toSourceOrder } from '../../lib/demo/world';
import { computePosTeams } from '../../lib/hr-copy';
import { orderStatements } from '../../lib/sync';
import { markDirtyOrder, rebuildStats, type DirtyBuckets } from '../../lib/stats';

type Args = (string | number | null)[];
export function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, args: Args = []) => ({
    sql, args, bind: (...a: Args) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])), meta: {} }),
    first: async (col?: string) => { const r = db.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined; return r ? (col ? r[col] : r) : null; },
    run: async () => { const r = db.prepare(sql).run(...(args as never[])); return { meta: { rows_written: Number(r.changes) } }; },
  });
  const isRead = (s: string) => /^\s*(SELECT|WITH)/i.test(s);
  return {
    prepare: (s: string) => stmt(s),
    batch: async (list: ReturnType<typeof stmt>[]) => { const out = []; for (const s of list) out.push(isRead(s.sql) ? await s.all() : await s.run()); return out; },
  } as unknown as D1Database;
}

/** Dựng D1 giả có đơn demo của các ngày `days` (6 POS) và bản sao nhân sự demo; gán vào env.DB. */
export async function demoWorld(days: string[], nowMs: number) {
  const raw = new DatabaseSync(':memory:');
  const dir = new URL('../../drizzle/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(f, dir), 'utf8').replaceAll('--> statement-breakpoint', ''));
  const db = d1(raw);
  Object.assign(env as object, { DB: db });
  const now = new Date(nowMs).toISOString();
  const dirty: DirtyBuckets = new Map();
  for (const p of SHOPS) {
    raw.prepare('INSERT INTO pos_shops (id,name,status,enabled) VALUES (?,?,?,1) ON CONFLICT DO NOTHING').run(p.posId, p.posId, 'connected');
    for (const u of listUsers(p.posId)) raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,is_active,fetched_at,department) VALUES (?,?,?,?,1,?,?) ON CONFLICT DO NOTHING')
      .run(`${p.posId}:${u.user_id}`, p.posId, u.user_id!, u.user!.name!, now, u.department!.name!);
    for (const day of days) for (const o of dayData(p.posId, day).orders) {
      const s = toSourceOrder(o, nowMs);
      if (!s) continue;
      await db.batch(orderStatements(db, p.posId, '1', s, now));
      markDirtyOrder(dirty, p.posId, s);
    }
  }
  await rebuildStats(db, dirty);
  // Bản sao nhân sự: cùng câu ghi với lib/hr-sync.ts replaceStatements, nguồn team = web nhân sự.
  const s = hrSnapshot();
  const run = (sql: string, ...a: (string | number | null)[]) => raw.prepare(sql).run(...a);
  for (const o of s.offices) run('INSERT INTO hr_offices (id,name) VALUES (?,?)', o.id, o.name);
  for (const d of s.departments) run('INSERT INTO hr_departments (id,name,parent_id,kind,office_id,director_employee_id,active) VALUES (?,?,?,?,?,?,?)', d.id, d.name, d.parent_id, d.kind, d.office_id, d.director_employee_id ?? null, d.active ? 1 : 0);
  for (const l of s.levels) run('INSERT INTO hr_levels (id,name,rank,is_manager) VALUES (?,?,?,?)', l.id, l.name, l.rank, l.is_manager ? 1 : 0);
  for (const t of s.titles) run('INSERT INTO hr_titles (id,name) VALUES (?,?)', t.id, t.name);
  for (const e of s.employees) run('INSERT INTO hr_employees (id,code,full_name,email,phone,office_id,joined_on,status,left_on,main_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)', e.id, e.code, e.full_name, e.email, e.phone, e.office_id, e.joined_on, e.status, e.left_on, e.main_user_id);
  for (const a of s.assignments) run('INSERT INTO hr_assignments (id,employee_id,department_id,level_id,title_id,manager_employee_id,is_primary,start_on,end_on) VALUES (?,?,?,?,?,?,?,?,?)', a.id, a.employee_id, a.department_id, a.level_id, a.title_id, a.manager_employee_id, a.is_primary ? 1 : 0, a.start_on, a.end_on);
  for (const p of computePosTeams(s, days[days.length - 1])) run(`INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,department,department_id,level,title,leader_employee_id,leader_name,head_name,manager_pos_user_id,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, p.pos_user_id, p.employee_id, p.employee_name, p.team, p.department, p.department_id, p.level, p.title, p.leader_employee_id, p.leader_name, p.head_name, p.manager_pos_user_id, p.status);
  run("INSERT INTO app_settings (key,value,updated_at) VALUES ('team_source','hr',?) ON CONFLICT(key) DO UPDATE SET value='hr'", now);
  return { raw, db };
}
