import { getSessionUser, unauthorized } from '@/lib/auth';
import { addCosts, deleteCost, validCost, type CostInput } from '@/lib/ad-costs';

// Nhập chi phí quảng cáo: POST {rows:[{day, marketerId, amount, campaign?, note?}]} (tối đa 2.000 dòng / lần, dùng cho cả file Excel).
// DELETE ?id= xóa một dòng. Quyền: ai xem được trang Chi phí & ROAS (chặn ở worker theo VIEW_GATES).
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => null) as { rows?: Partial<CostInput>[] } | null;
  const rows = Array.isArray(body?.rows) ? body!.rows : [];
  if (!rows.length) return Response.json({ error: 'Chưa có dòng chi phí nào.' }, { status: 400 });
  if (rows.length > 2000) return Response.json({ error: 'Tối đa 2.000 dòng mỗi lần.' }, { status: 400 });
  const bad = rows.findIndex((r) => !validCost(r));
  if (bad >= 0) return Response.json({ error: `Dòng ${bad + 1} chưa đúng: cần ngày (YYYY-MM-DD), marketer và số tiền ≥ 0.` }, { status: 400 });
  const n = await addCosts(rows as CostInput[], user.userId);
  return Response.json({ ok: true, added: n });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Thiếu mã dòng.' }, { status: 400 });
  const ok = await deleteCost(id, user.userId, user.role === 'owner' || user.role === 'director');
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Chỉ người đã nhập dòng này, chủ hệ thống hoặc giám đốc mới xóa được.' }, { status: 403 });
}
