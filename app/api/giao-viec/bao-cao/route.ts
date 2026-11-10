import { bossRoute } from '../me/route';
import { DEFAULT_ZALO_SETTINGS, readZaloSetting, saveZaloSettings, writeZaloSetting } from '@/lib/zalo/zalo-work';
import { REPORT_SCHEDULE_KEY, parseReportSchedule, validateReportSchedule } from '@/lib/zalo/report-schedule';

// Cài đặt báo cáo Zalo (Giao việc → Cài đặt báo cáo): giờ gửi, lặp lại, mục trong báo cáo (zalo_report_v1) và bật / tắt
// (morningBrief, slotReports trong zalo_settings_v1 — cùng chỗ với công tắc ở Danh bạ Zalo). Quyền như cài đặt thông báo cũ:
// người được giao việc (bossRoute; anh Vũ 05/11/2026: giữ như hiện tại). Chỉ lưu cài đặt, không gửi tin. Nhắc trước giờ họp dùng chung
// khoá remindBeforeMeetingMin trong zalo_settings_v1.
export async function GET(request: Request) {
  return bossRoute(request, async (db, _actor, user) => {
    const [stored, settings] = await Promise.all([
      readZaloSetting<unknown>(db, REPORT_SCHEDULE_KEY, null),
      readZaloSetting(db, 'zalo_settings_v1', DEFAULT_ZALO_SETTINGS),
    ]);
    const merged = { ...DEFAULT_ZALO_SETTINGS, ...settings };
    return { schedule: parseReportSchedule(stored), customized: stored !== null, morningBrief: merged.morningBrief, slotReports: merged.slotReports, remindBeforeMeetingMin: merged.remindBeforeMeetingMin, owner: user.role === 'owner' };
  });
}

export async function PUT(request: Request) {
  return bossRoute(request, async (db) => {
    const body = await request.json().catch(() => null) as { schedule?: unknown; morningBrief?: unknown; slotReports?: unknown; remindBeforeMeetingMin?: unknown } | null;
    if (!body || typeof body.morningBrief !== 'boolean' || typeof body.slotReports !== 'boolean') throw new Error('Thiếu công tắc bật / tắt báo cáo.');
    const schedule = validateReportSchedule(body.schedule);
    const settings = { ...DEFAULT_ZALO_SETTINGS, ...await readZaloSetting(db, 'zalo_settings_v1', DEFAULT_ZALO_SETTINGS) };
    // Nhắc trước giờ họp: cùng khoá remindBeforeMeetingMin với Danh bạ Zalo (không gửi lên = giữ nguyên). saveZaloSettings kiểm 1–1440 phút.
    const remind = body.remindBeforeMeetingMin === undefined ? settings.remindBeforeMeetingMin : body.remindBeforeMeetingMin as number;
    await saveZaloSettings(db, { ...settings, morningBrief: body.morningBrief, slotReports: body.slotReports, remindBeforeMeetingMin: remind });
    await writeZaloSetting(db, REPORT_SCHEDULE_KEY, schedule);
    return { ok: true, schedule };
  });
}
