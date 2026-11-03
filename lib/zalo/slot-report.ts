// Ảnh gộp các team gửi sếp ở ca 12h / 17h / 22h (anh Vũ 03/11/2026: "đã là báo cáo phải có ảnh").
// Ảnh từng team dùng đúng kiểu ảnh 8h (lib/zalo/morning-report.ts, slotHour). Ảnh gộp vẽ ở app/zalo-slot-image.tsx.
export type BossSlotTeam = { team: string; total: number; cumulative: number };
export type BossSlotReport = {
  kind: 'bossSlot';
  slot: string;
  hour: string;
  day: string;
  teams: BossSlotTeam[];
};

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
