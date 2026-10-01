import { EMPTY_LEVELS, LEVEL_METRICS, getMeta, orgTree, peopleList, personDetail, saveLevels, saveMeta, getLevels, type LevelConfig, type PersonMeta } from '@/lib/people';

// Con người (hiệu suất, hồ sơ 360, cấp bậc, tổ chức & mục tiêu): trang đã chuyển sang web nhân sự,
// web nhân sự gọi các hàm này qua /api/hr/people (bí mật dùng chung). Số liệu vẫn tính từ đơn hàng ở web chính.
// GET → danh sách; ?id= → hồ sơ; ?levels=1 → cấu hình cấp bậc; ?org=1 → cây tổ chức & mục tiêu.
export async function peopleGet(request: Request) {
  const p = new URL(request.url).searchParams;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (p.get('org')) return Response.json(await orgTree(), { headers });
  if (p.get('levels')) return Response.json({ levels: await getLevels(), metrics: LEVEL_METRICS }, { headers });
  const id = p.get('id');
  if (id) { const d = await personDetail(id.slice(0, 100)); return d ? Response.json(d, { headers }) : Response.json({ error: 'Không tìm thấy nhân viên.' }, { status: 404 }); }
  return Response.json(await peopleList(), { headers });
}

const clean = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '') || null;
/** PUT {levels} lưu cấp bậc; PUT {id, meta} lưu thông tin quản lý của một người. Bên gọi tự kiểm quyền. */
export async function peoplePut(request: Request) {
  const body = await request.json().catch(() => null) as { levels?: LevelConfig; id?: string; meta?: PersonMeta } | null;
  if (body?.levels) {
    const out: LevelConfig = { ...EMPTY_LEVELS };
    for (const dept of ['sale', 'cskh', 'mkt'] as const) {
      out[dept] = (Array.isArray(body.levels[dept]) ? body.levels[dept] : []).slice(0, 12).map((l, i) => ({
        id: clean(l.id, 40) ?? `lv${i}`, name: clean(l.name, 60) ?? `Bậc ${i + 1}`,
        conditions: (Array.isArray(l.conditions) ? l.conditions : []).slice(0, 6).filter((c) => c.metric in LEVEL_METRICS)
          .map((c) => ({ metric: c.metric, min: Math.max(0, Number(c.min) || 0), months: Math.max(1, Math.min(12, Math.round(Number(c.months) || 1))) })),
      }));
    }
    await saveLevels(out);
    return Response.json({ ok: true, levels: out });
  }
  if (body?.id) {
    const meta = await getMeta();
    const m = body.meta ?? {};
    meta[body.id.slice(0, 100)] = { joinedAt: clean(m.joinedAt, 10), managerId: clean(m.managerId, 100), title: clean(m.title, 80), note: clean(m.note, 1000), level: clean(m.level, 60) };
    await saveMeta(meta);
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'Thiếu dữ liệu.' }, { status: 400 });
}
