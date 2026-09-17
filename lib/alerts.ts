// Cảnh báo Telegram: trong ca làm, nhân viên có số nhận ≥ tối thiểu và tỷ lệ chốt nóng dưới ngưỡng
// thì gửi tin; có thời gian nghỉ giữa các tin và tùy chọn nhắc lại. Dữ liệu đồng bộ lỗi / quá cũ
// → gửi cảnh báo lỗi dữ liệu thay vì cảnh báo hiệu suất.
import { hotCloseByEmployee, type HotCloseRow } from '@/lib/hot-close';
import { POS } from '@/lib/report-model';
import { VN_OFFSET_HOURS, todayVn } from '@/lib/report-time';
import { sendTelegram } from '@/lib/telegram';

export type AlertRule = {
  ownerId: string; enabled: boolean; threshold: number; minReceived: number; cooldownMinutes: number;
  shiftStart: string; shiftEnd: string; repeat: boolean; chatId: string; employeeIds: string[];
};
export type Evaluation = HotCloseRow & { name: string; below: boolean; eligible: boolean };
export type AlertRun = {
  ownerId: string; inShift: boolean; shift: string; window: { startUtc: string; endUtc: string };
  dataError: string | null; updatedAt: string | null; evaluations: Evaluation[]; sent: { kind: string; employeeId: string | null; message: string; ok: boolean; error?: string }[];
  skipped?: string;
};

const vi = new Intl.NumberFormat('vi-VN');
const STALE_MINUTES = 20;

export function loadRules(db: D1Database) {
  return db.prepare('SELECT * FROM alert_rules WHERE enabled=1').all<Record<string, unknown>>().then((r) => r.results.map((x): AlertRule => ({
    ownerId: String(x.owner_id), enabled: !!x.enabled, threshold: Number(x.threshold), minReceived: Number(x.min_received),
    cooldownMinutes: Number(x.cooldown_minutes), shiftStart: String(x.shift_start), shiftEnd: String(x.shift_end),
    repeat: !!x.repeat, chatId: String(x.chat_id ?? ''), employeeIds: JSON.parse(String(x.employee_ids_json ?? '[]')),
  })));
}

/** Khung giờ ca hôm nay (VN) → UTC không hậu tố. */
export function shiftWindow(day: string, shiftStart: string, shiftEnd: string) {
  const toUtc = (t: string) => {
    const d = new Date(`${day}T${t}:00Z`);
    d.setUTCHours(d.getUTCHours() - VN_OFFSET_HOURS);
    return d.toISOString().slice(0, 19);
  };
  return { startUtc: toUtc(shiftStart), endUtc: toUtc(shiftEnd) };
}

export function formatAlert(e: Evaluation, rule: AlertRule, updatedAt: string | null) {
  const vnTime = (iso: string | null) => iso
    ? new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }) : '—';
  return [
    `⚠️ <b>Tỷ lệ chốt dưới ngưỡng</b>`,
    `Nhân viên: <b>${e.name}</b>`,
    `Ca: ${rule.shiftStart}–${rule.shiftEnd}`,
    `Số đã nhận: ${vi.format(e.received)}`,
    `Số đã chốt: ${vi.format(e.closed)}`,
    `Tỷ lệ chốt: <b>${e.rate === null ? '—' : e.rate.toFixed(0) + '%'}</b> — dưới ngưỡng ${rule.threshold}%`,
    `Đơn chốt từ tệp này: ${vi.format(e.hotOrders)}`,
    `Tổng giá trị chốt từ tệp này: ${vi.format(Math.round(e.hotValue))} đồng`,
    `Dữ liệu cập nhật tới: ${vnTime(updatedAt)}`,
  ].join('\n');
}

/** Đánh giá và (nếu không dryRun) gửi cảnh báo cho mọi quy tắc đang bật. */
export async function runAlerts(env: Cloudflare.Env, now: Date, options: { dryRun?: boolean; ownerId?: string } = {}): Promise<AlertRun[]> {
  const db = env.DB;
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const rules = (await loadRules(db)).filter((r) => !options.ownerId || r.ownerId === options.ownerId);
  if (!rules.length) return [];
  const day = todayVn();
  const vnNow = new Date(now.getTime() + VN_OFFSET_HOURS * 3600000).toISOString().slice(11, 16);
  const [shops, names] = await db.batch([
    db.prepare('SELECT id,status,last_sync_at,last_error FROM pos_shops WHERE enabled=1 AND shop_id IS NOT NULL'),
    db.prepare("SELECT user_id,name FROM pos_users WHERE name<>''"),
  ]);
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  const shopRows = shops.results as { id: string; status: string; last_sync_at: string | null; last_error: string | null }[];
  const updatedAt = shopRows.map((s) => s.last_sync_at).filter(Boolean).sort()[0] ?? null;
  const stale = !updatedAt || now.getTime() - Date.parse(updatedAt) > STALE_MINUTES * 60000;
  const errored = shopRows.filter((s) => s.status === 'error');
  const dataError = stale ? `Dữ liệu đồng bộ đã cũ (cập nhật gần nhất ${updatedAt ?? 'chưa có'}).`
    : errored.length ? `Đồng bộ lỗi ở ${errored.map((s) => POS.find((p) => p.id === s.id)?.name ?? s.id).join(', ')}: ${errored[0].last_error ?? ''}` : null;
  const posIds = POS.map((p) => p.id);
  const runs: AlertRun[] = [];
  for (const rule of rules) {
    const inShift = vnNow >= rule.shiftStart && vnNow <= rule.shiftEnd;
    const window = shiftWindow(day, rule.shiftStart, rule.shiftEnd);
    const run: AlertRun = { ownerId: rule.ownerId, inShift, shift: `${rule.shiftStart}–${rule.shiftEnd}`, window, dataError, updatedAt, evaluations: [], sent: [] };
    runs.push(run);
    const rows = await hotCloseByEmployee(db, posIds, window.startUtc, window.endUtc, rule.employeeIds);
    run.evaluations = rows.map((r) => ({
      ...r, name: nameMap.get(r.employeeId) ?? `NV ${r.employeeId.slice(0, 8)}`,
      eligible: r.received >= rule.minReceived, below: r.received >= rule.minReceived && r.rate !== null && r.rate < rule.threshold,
    }));
    if (options.dryRun) continue;
    if (!inShift) { run.skipped = 'outside_shift'; continue; }
    if (!token || !rule.chatId) { run.skipped = !token ? 'missing_token' : 'missing_chat'; continue; }
    const cooldownSince = new Date(now.getTime() - rule.cooldownMinutes * 60000).toISOString();
    const recent = await db.prepare('SELECT kind,employee_id,MAX(sent_at) AS sent_at FROM alert_log WHERE owner_id=? AND day=? AND ok=1 GROUP BY kind,employee_id')
      .bind(rule.ownerId, day).all<{ kind: string; employee_id: string | null; sent_at: string }>();
    const lastSent = new Map(recent.results.map((r) => [`${r.kind}:${r.employee_id ?? ''}`, r.sent_at]));
    const send = async (kind: string, employeeId: string | null, message: string) => {
      let ok = true, error: string | undefined;
      try { await sendTelegram(token, rule.chatId, message); } catch (e) { ok = false; error = e instanceof Error ? e.message : String(e); }
      await db.prepare('INSERT INTO alert_log (id,owner_id,kind,employee_id,day,sent_at,message,ok,error) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), rule.ownerId, kind, employeeId, day, now.toISOString(), message, ok ? 1 : 0, error ?? null).run();
      run.sent.push({ kind, employeeId, message, ok, error });
    };
    if (dataError) {
      const last = lastSent.get('data_error:');
      if (!last || last < cooldownSince) await send('data_error', null, `🛑 <b>Lỗi dữ liệu</b>\n${dataError}\nChưa gửi cảnh báo hiệu suất vì số liệu thiếu.`);
      continue;
    }
    for (const e of run.evaluations.filter((x) => x.below)) {
      const last = lastSent.get(`low_rate:${e.employeeId}`);
      if (last && (!rule.repeat || last >= cooldownSince)) continue; // đã báo hôm nay (không nhắc lại) hoặc đang trong thời gian nghỉ
      await send('low_rate', e.employeeId, formatAlert(e, rule, updatedAt));
    }
  }
  return runs;
}
