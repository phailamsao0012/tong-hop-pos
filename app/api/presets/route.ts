import { deletePreset, insertPreset, listPresets } from '@/lib/reports/report-presets';
import { getSessionUser } from '@/lib/auth/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return Response.json(
      { error: 'Đăng nhập để xem báo cáo.' },
      { status: 401 },
    );
  const rows = await listPresets(user);
  return Response.json(
    rows.results.map((r) => ({
      id: r.id,
      title: r.title,
      config: JSON.parse(r.config_json),
      updatedAt: r.updated_at,
    })),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user)
    return Response.json(
      { error: 'Đăng nhập để lưu báo cáo.' },
      { status: 401 },
    );
  let body: { title?: string; config?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 });
  }
  const title = body.title?.trim();
  const config = body.config;
  if (!title || title.length > 80 || !config || typeof config !== 'object')
    return Response.json(
      { error: 'Tên hoặc cấu hình báo cáo không hợp lệ.' },
      { status: 400 },
    );
  const encoded = JSON.stringify(config);
  if (encoded.length > 8000)
    return Response.json({ error: 'Cấu hình quá lớn.' }, { status: 400 });
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  await insertPreset(id, user, title, encoded, now);
  return Response.json({ id, title, config, updatedAt: now }, { status: 201 });
}
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user)
    return Response.json(
      { error: 'Đăng nhập để xóa báo cáo.' },
      { status: 401 },
    );
  const id = new URL(request.url).searchParams.get('id');
  if (!id)
    return Response.json({ error: 'Thiếu mã báo cáo.' }, { status: 400 });
  await deletePreset(id, user);
  return Response.json({ ok: true });
}
