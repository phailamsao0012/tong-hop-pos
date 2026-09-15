import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { POS } from '@/lib/report-model';

const defaults = {
  enabled: false,
  threshold: 40,
  minReceived: 20,
  cooldownMinutes: 60,
  shiftStart: '08:00',
  shiftEnd: '12:00',
  repeat: false,
  chatId: '',
  employeeIds: [] as string[],
};
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Đăng nhập để xem cấu hình.' },
      { status: 401 },
    );
  const [rule, shops] = await Promise.all([
    env.DB.prepare('SELECT * FROM alert_rules WHERE owner_id=?')
      .bind(user.userId)
      .first<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT id,shop_id,status,last_sync_at,history_start,last_error FROM pos_shops',
    ).all<Record<string, unknown>>(),
  ]);
  const byId = new Map(shops.results.map((r) => [String(r.id), r]));
  return Response.json(
    {
      alert: rule
        ? {
            enabled: Boolean(rule.enabled),
            threshold: Number(rule.threshold),
            minReceived: Number(rule.min_received),
            cooldownMinutes: Number(rule.cooldown_minutes),
            shiftStart: String(rule.shift_start),
            shiftEnd: String(rule.shift_end),
            repeat: Boolean(rule.repeat),
            chatId: String(rule.chat_id ?? ''),
            employeeIds: JSON.parse(String(rule.employee_ids_json)),
          }
        : defaults,
      shops: POS.map((p) => ({
        id: p.id,
        name: p.name,
        shopId: byId.get(p.id)?.shop_id ?? '',
        status: byId.get(p.id)?.status ?? 'pending',
        lastSyncAt: byId.get(p.id)?.last_sync_at ?? null,
        historyStart: byId.get(p.id)?.history_start ?? null,
        lastError: byId.get(p.id)?.last_error ?? null,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Đăng nhập để lưu cấu hình.' },
      { status: 401 },
    );
  let body: {
    type?: string;
    id?: string;
    shopId?: string;
    alert?: typeof defaults;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 });
  }
  if (body.type === 'shop') {
    const pos = POS.find((p) => p.id === body.id);
    const shopId = body.shopId?.trim();
    if (!pos || !shopId || shopId.length > 100)
      return Response.json({ error: 'Shop ID không hợp lệ.' }, { status: 400 });
    await env.DB.prepare(
      'INSERT INTO pos_shops (id,name,shop_id,status) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET shop_id=excluded.shop_id,status=CASE WHEN pos_shops.last_sync_at IS NULL THEN ? ELSE pos_shops.status END',
    )
      .bind(pos.id, pos.name, shopId, 'pending', 'pending')
      .run();
    return Response.json({ ok: true });
  }
  if (body.type === 'alert') {
    const a = body.alert;
    if (
      !a ||
      !Number.isInteger(a.threshold) ||
      a.threshold < 1 ||
      a.threshold > 100 ||
      !Number.isInteger(a.minReceived) ||
      a.minReceived < 1 ||
      a.minReceived > 10000 ||
      !Number.isInteger(a.cooldownMinutes) ||
      a.cooldownMinutes < 5 ||
      a.cooldownMinutes > 1440 ||
      !/^\d\d:\d\d$/.test(a.shiftStart) ||
      !/^\d\d:\d\d$/.test(a.shiftEnd) ||
      !Array.isArray(a.employeeIds) ||
      a.employeeIds.length > 20
    )
      return Response.json(
        { error: 'Ngưỡng cảnh báo hoặc ca làm không hợp lệ.' },
        { status: 400 },
      );
    const now = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO alert_rules (owner_id,enabled,threshold,min_received,cooldown_minutes,shift_start,shift_end,repeat,chat_id,employee_ids_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled,threshold=excluded.threshold,min_received=excluded.min_received,cooldown_minutes=excluded.cooldown_minutes,shift_start=excluded.shift_start,shift_end=excluded.shift_end,repeat=excluded.repeat,chat_id=excluded.chat_id,employee_ids_json=excluded.employee_ids_json,updated_at=excluded.updated_at',
    )
      .bind(
        user.userId,
        a.enabled ? 1 : 0,
        a.threshold,
        a.minReceived,
        a.cooldownMinutes,
        a.shiftStart,
        a.shiftEnd,
        a.repeat ? 1 : 0,
        a.chatId ?? '',
        JSON.stringify(a.employeeIds),
        now,
      )
      .run();
    return Response.json({ ok: true });
  }
  return Response.json(
    { error: 'Loại cấu hình không hợp lệ.' },
    { status: 400 },
  );
}
