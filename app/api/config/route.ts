import { forbidden, getSessionUser } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { POS } from '@/lib/shared/report-model';
import { alertRuleAndShops, saveAlertRule, saveShopId } from '@/lib/ops/config-store';

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
  const user = await getSessionUser();
  if (!user)
    return Response.json(
      { error: 'Đăng nhập để xem cấu hình.' },
      { status: 401 },
    );
  if (!isOwner(user)) return forbidden(); // chặn cả ở đây, không chỉ dựa vào worker (Đợt 0, K1)
  const [rule, shops] = await alertRuleAndShops(user);
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
        shopId: /^\d+$/.test(String(byId.get(p.id)?.shop_id ?? ''))
          ? byId.get(p.id)?.shop_id
          : '',
        invalidSavedId: Boolean(byId.get(p.id)?.shop_id) &&
          !/^\d+$/.test(String(byId.get(p.id)?.shop_id)),
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
  const user = await getSessionUser();
  if (!user)
    return Response.json(
      { error: 'Đăng nhập để lưu cấu hình.' },
      { status: 401 },
    );
  if (!isOwner(user)) return forbidden();
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
    if (!pos || (shopId && !/^\d{1,20}$/.test(shopId)))
      return Response.json({ error: 'Shop ID phải là dãy số, không phải API key.' }, { status: 400 });
    await saveShopId(pos, shopId);
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
      a.employeeIds.length > 200 ||
      (a.chatId && !/^-?\d{4,20}$/.test(String(a.chatId).trim()))
    )
      return Response.json(
        { error: 'Ngưỡng, ca làm hoặc Chat ID không hợp lệ (Chat ID là dãy số, không phải token bot).' },
        { status: 400 },
      );
    const now = new Date().toISOString();
    await saveAlertRule(user, a, now);
    return Response.json({ ok: true });
  }
  return Response.json(
    { error: 'Loại cấu hình không hợp lệ.' },
    { status: 400 },
  );
}
