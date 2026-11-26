// Tổng quan kiểu mới (bản demo giao diện, cờ THP_UI_MOI): chỉ GOM số từ các hàm báo cáo đang có, không tính số nào theo cách khác.
// - Doanh thu chốt, đơn chốt, AOV, đơn tạo theo trạng thái: overviewReport (như trang Tổng quan POS), so kỳ trước cùng mốc.
// - Số về / chốt data, hủy sau chốt, hoàn, theo giờ, theo thứ: saleAnalytics (như trang Phân tích Sale).
// - ROAS từng marketer: mktAnalytics (như khối số chính trang Marketing), chỉ khi người xem được xem chi phí.
// Luật việc cần xem và câu tóm tắt: lib/shared/overview-moi-rules.ts.
import { overviewReport } from '@/lib/reports/overview-report';
import { saleAnalytics } from '@/lib/reports/sale-analytics';
import { mktAnalytics } from '@/lib/reports/mkt-analytics';
import { byWeekday, weekdayOf } from '@/lib/reports/sale-hours';
import { addDays } from '@/lib/shared/report-time';
import type { Team } from '@/lib/teams/team';
import { NEED_LIMITS, briefSentence, needItems } from '@/lib/shared/overview-moi-rules';

/** Khung giờ của bảng nhiệt (mỗi ô 2 giờ, 6h–21h59). */
export const HEAT_HOURS = [6, 8, 10, 12, 14, 16, 18, 20] as const;
/** Khung giờ của cột theo giờ hôm nay. */
export const BAR_HOURS = Array.from({ length: 15 }, (_, i) => i + 6);
/** Người bán có ít nhất chừng này đơn chốt mới xét tỉ lệ hủy (tránh 1/1 = 100%). */
const MIN_CLOSED_FOR_RATE = 10;

export type OverviewMoiOpts = { posIds: string[]; start: string; end: string; today: string; team?: Team; withCost: boolean };

export async function overviewMoi(o: OverviewMoiOpts) {
  const histStart = addDays(o.today, -28);
  const [ov, sa, hist, mkt] = await Promise.all([
    overviewReport({ posIds: o.posIds, start: o.start, end: o.end, team: o.team ?? 'all', compare: 'previous' }),
    saleAnalytics({ posIds: o.posIds, start: o.start, end: o.end }),
    saleAnalytics({ posIds: o.posIds, start: histStart, end: o.today }),
    o.withCost ? mktAnalytics({ posIds: o.posIds, start: o.start, end: o.end }) : null,
  ]);
  const cur = ov.current.total, prev = ov.compare?.total ?? null;

  // Hôm nay theo giờ: đơn chốt (theo giờ xác nhận lần đầu) so với trung bình cùng thứ 4 tuần trước.
  const todayRow = hist.days.find((d) => d.day === o.today);
  const sameDay = hist.days.filter((d) => d.day !== o.today && weekdayOf(d.day) === weekdayOf(o.today));
  const hours = BAR_HOURS.map((h) => ({
    hour: h, today: todayRow?.o[h] ?? 0,
    usual: sameDay.length ? Math.round(sameDay.reduce((t, d) => t + d.o[h], 0) / sameDay.length * 10) / 10 : null,
  }));
  // Bảng nhiệt: số được chia (số về Sale) trung bình mỗi ngày theo thứ × 2 giờ, 4 tuần gần nhất (không gồm hôm nay).
  const past = hist.days.filter((d) => d.day < o.today);
  const heat = byWeekday(past).map((w) => ({
    label: w.day, days: w.days,
    cells: HEAT_HOURS.map((h) => w.days ? Math.round((w.a[h] + w.a[h + 1]) / w.days * 10) / 10 : 0),
  }));

  const cancelStaff = sa.staff.filter((s) => s.closed >= MIN_CLOSED_FOR_RATE && s.cancelAfterClose !== null && s.cancelAfterClose >= NEED_LIMITS.cancel)
    .sort((a, b) => (b.cancelAfterClose ?? 0) - (a.cancelAfterClose ?? 0)).map((s) => ({ id: s.staffId, name: s.name, rate: s.cancelAfterClose!, closed: s.closed }));
  const lowRoas = mkt ? mkt.people.filter((p) => p.cost > 0 && p.roas !== null && p.roas < NEED_LIMITS.roas)
    .map((p) => ({ name: p.name, cost: p.cost, net: p.coveredNet, roas: p.roas! })) : null;
  const needs = needItems({
    sale: { cancelRate: sa.total.cancelAfterClose, returnRate: sa.total.returnRate, closeRate: sa.total.dataRate, closed: sa.total.closed, assigned: sa.total.assigned },
    cancelStaff, lowRoas,
  });

  return {
    period: { start: o.start, end: o.end, today: o.today },
    brief: briefSentence({ net: cur.closedNet, prevNet: prev ? prev.closedNet : null, needs: needs.length, closed: cur.closedOrders }),
    needs,
    revenue: {
      closedNet: cur.closedNet, closedOrders: cur.closedOrders, averageOrder: cur.averageOrder,
      prevClosedNet: prev?.closedNet ?? null, prevClosedOrders: prev?.closedOrders ?? null, comparePeriod: ov.comparePeriod,
    },
    /** Đơn TẠO trong kỳ theo trạng thái hiện tại (như phễu trang Tổng quan POS). */
    status: (['new', 'confirmed', 'shipping', 'delivered', 'returned', 'cancelled'] as const).map((k) => ({ key: k, orders: cur.groups[k].orders })),
    sale: {
      assigned: sa.total.assigned, closedFromAssigned: sa.total.closedFromAssigned, dataRate: sa.total.dataRate,
      cancelRate: sa.total.cancelAfterClose, returnRate: sa.total.returnRate, closed: sa.total.closed, net: sa.total.net,
    },
    cancelStaff: cancelStaff.slice(0, 6),
    hours, heat, heatHours: HEAT_HOURS,
    todaySale: { assigned: todayRow ? todayRow.a.reduce((t, v) => t + v, 0) : 0, closed: todayRow ? todayRow.o.reduce((t, v) => t + v, 0) : 0 },
    cost: mkt ? { cost: mkt.current.cost, roas: mkt.current.roas, lowRoas: lowRoas!.length } : null,
    missing: [
      'Mốc CSKH gọi dưới mức: chưa có số, chờ anh Vũ cho mốc.',
      'Số về "đang chăm" / "không chốt": web chưa có trạng thái này, vòng tròn chỉ chia đã chốt / chưa chốt.',
      'Đơn hủy theo TEAM: báo cáo hủy hiện theo người bán, khối hủy hiện theo người bán.',
      'Khung hỏi trợ lý: chưa làm trong đợt này.',
    ],
  };
}
export type OverviewMoi = Awaited<ReturnType<typeof overviewMoi>>;
