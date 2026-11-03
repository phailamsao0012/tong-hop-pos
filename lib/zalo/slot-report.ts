// Báo cáo theo ca 12h / 17h / 22h gửi leader và sếp qua Zalo, có ảnh như báo cáo 8h (anh Vũ 03/11/2026:
// "đã là báo cáo phải có ảnh", ca nào cũng kèm chữ). Ảnh vẽ ở app/zalo-slot-image.tsx từ đúng dữ liệu này.
export type SlotPerson = { name: string; total: number; orders: number };
export type SlotReport = {
  kind: 'slot';
  team: string;
  /** Ví dụ "khung 8h–12h" hoặc "từ đầu ngày tới 12h". */
  slot: string;
  hour: string;
  day: string;
  total: number;
  cumulative: number;
  orders: number;
  /** Người có đơn trong khung, cao xuống thấp (tối đa 8). */
  people: SlotPerson[];
  /** Người chưa có đơn trong khung. */
  noOrders: string[];
};
export type BossSlotTeam = { team: string; total: number; cumulative: number };
export type BossSlotReport = {
  kind: 'bossSlot';
  slot: string;
  hour: string;
  day: string;
  teams: BossSlotTeam[];
};

export function buildSlotReport(input: {
  team: string;
  slot: string;
  hour: string;
  day: string;
  total: number;
  cumulative: number;
  orders: number;
  people: SlotPerson[];
}): SlotReport {
  const withOrders = input.people
    .filter((p) => p.orders > 0)
    .sort((a, b) => b.total - a.total);
  return {
    kind: 'slot',
    team: input.team,
    slot: input.slot,
    hour: input.hour,
    day: input.day,
    total: input.total,
    cumulative: input.cumulative,
    orders: input.orders,
    people: withOrders.slice(0, 8),
    noOrders: input.people
      .filter((p) => p.orders <= 0)
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b, 'vi')),
  };
}

export function buildBossSlotReport(
  slot: string,
  hour: string,
  day: string,
  teams: BossSlotTeam[],
): BossSlotReport {
  return {
    kind: 'bossSlot',
    slot,
    hour,
    day,
    teams: [...teams].sort((a, b) => b.total - a.total).slice(0, 14),
  };
}

const vnd = (n: number) => n.toLocaleString('vi-VN');

/** Chữ kèm ảnh (cũng là bản gửi khi Zalo không tải được ảnh). */
export function slotText(r: SlotReport) {
  return [
    `Doanh số team ${r.team} ${r.slot}`,
    `Doanh số khung: ${vnd(r.total)} · Luỹ kế hôm nay: ${vnd(r.cumulative)}`,
    `Đơn chốt: ${r.orders}`,
    `Cao nhất: ${
      r.people
        .slice(0, 3)
        .map((p) => `${p.name}: ${vnd(p.total)}`)
        .join(', ') || 'chưa có'
    }`,
    `Chưa có đơn trong khung: ${r.noOrders.join(', ') || 'không ai'}`,
  ]
    .join('\n')
    .slice(0, 2000);
}

export function bossSlotText(r: BossSlotReport) {
  return [
    'Doanh số các team',
    ...r.teams.map(
      (t) =>
        `${t.team} · ${r.slot}: ${vnd(t.total)} · Luỹ kế: ${vnd(t.cumulative)}`,
    ),
  ]
    .join('\n')
    .slice(0, 2000);
}
