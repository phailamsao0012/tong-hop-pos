// Tham số ?hrTeam=<mã team web nhân sự> của các báo cáo xem được theo team (10/10/2026). Kiểm mã, tìm bộ phận của team, và ép theo phạm vi tài khoản:
// tài khoản bị giới hạn một bộ phận (scopeApi đã ghi team=sale|cskh) chỉ chọn được team trong bộ phận đó, team ngoài bộ phận thì bỏ, xem cả bộ phận.
import { env } from 'cloudflare:workers';
import { HR_UNIT_RE, unitIds, type HrUnit, type Team } from '@/lib/team';

export type UnitScope = { team: Team; unit: HrUnit | null; /** Có hỏi team nhưng team thuộc bộ phận khác phạm vi tài khoản nên bị bỏ. */ dropped: boolean };

/** Team của bộ phận nào: bộ phận (sale / cskh) mà đa số tài khoản POS của team mang trong hr_pos_team. */
export async function resolveHrUnit(params: URLSearchParams, team: Team): Promise<UnitScope | Response> {
  const raw = (params.get('hrTeam') ?? '').trim();
  if (!raw) return { team, unit: null, dropped: false };
  if (!HR_UNIT_RE.test(raw)) return Response.json({ error: 'Mã team không hợp lệ.' }, { status: 400 });
  // Một team, hoặc cả nhóm team cùng người phụ trách (mã nối bằng dấu phẩy): mọi mã phải còn là team đang hoạt động.
  const ids = [...new Set(unitIds(raw))];
  const marks = ids.map(() => '?').join(',');
  const found = await env.DB.prepare(`SELECT d.id, d.name FROM hr_departments d WHERE d.id IN (${marks}) AND d.kind='team' AND d.active=1`).bind(...ids).all<{ id: string; name: string }>();
  if ((found.results ?? []).length !== ids.length) return Response.json({ error: 'Không tìm thấy team này bên web nhân sự (có thể đã đổi tên hoặc xoá).' }, { status: 400 });
  const deptRow = await env.DB.prepare(`SELECT t.team AS dept FROM hr_pos_team t WHERE t.department_id IN (${marks}) AND t.team IN ('sale','cskh') GROUP BY t.team ORDER BY COUNT(*) DESC LIMIT 1`)
    .bind(...ids).first<{ dept: 'sale' | 'cskh' }>();
  const row = { id: ids.join(','), name: ids.length === 1 ? found.results[0].name : `${ids.length} team`, dept: deptRow?.dept ?? null };
  // Team chưa có ai gắn tài khoản POS: không có số nào, coi như thuộc bộ phận đang xem.
  const dept = row.dept ?? (team === 'all' ? 'sale' : team);
  if (team !== 'all' && dept !== team) return { team, unit: null, dropped: true };
  return { team: dept, unit: { id: row.id, name: row.name, dept }, dropped: false };
}
