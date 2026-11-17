// Ảnh báo cáo tổng quan cho sếp (anh Vũ 14/11/2026, mẫu đã chốt: https://claude.ai/artifact/TyXGkhnrCa3f3NpneSPsMs).
// Luôn giao diện sáng. Vẽ bằng next/og (satori): mọi khối nhiều con phải display:flex, không dùng grid / table.
// Chiều cao tính trước theo số dòng (bossImageHeight) vì ImageResponse cần chiều cao cố định.
import React from 'react';
import { addDays } from '@/lib/shared/report-time';
import {
  BOSS_CANCEL_RED, BOSS_CLOSE_RED, BOSS_RETURN_RED, closeRate, coach, deptKpi, money, num, pct, rateText, signed, warnings,
  type BossData, type BossImage, type MktTeamRow, type TeamRow, gapWord, kpiGap, type KpiGap } from '@/lib/zalo/boss-report';

export const BOSS_IMAGE_WIDTH = 1080;
const C = { ink: '#14231c', muted: '#5f6f67', line: '#e3ebe6', soft: '#f2f6f3', green: '#2f6b4f', good: '#2e7d32', bad: '#c62828', badSoft: '#fdecea', barBg: '#e3e9e5', head: '#d6efe3' };
const PAD = 44;
const H = { mktNote: 40, head: 150, top: 330, note: 74, secTitle: 48, cards: 150, th: 50, tr: 54, mktBig: 262, foot: 96, gap: 30, warn: 64, people: 330, ship: 170 };
const MAX_TEAMS = 12, MAX_POS = 8, MAX_MKT = 7;
/** Cộng số về các team MKT lớn hơn tổng (một SĐT về từ nhiều team: mỗi team đếm, tổng đếm 1 lần) → chú thích nhỏ dưới bảng (anh Vũ 16/11/2026). */
export const mktLeadsNote = (d: Pick<BossData, 'mkt'>) => { const sum = d.mkt.teams.reduce((a, t) => a + t.leads, 0); return sum > d.mkt.leads ? `Cộng các team ${num(sum)} số, lớn hơn tổng ${num(d.mkt.leads)} số về: một SĐT về từ nhiều team được đếm ở mỗi team, tổng chỉ đếm 1 lần.` : null; };

const Box = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', ...style }}>{children}</div>;
const Col = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{children}</div>;
const Txt = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', ...style }}>{children}</div>;
/** "thiếu 9 tr" đỏ / "dư 2 tr" xanh (KPI ghi bằng tiền, anh Vũ 15/11/2026). */
const Gap = ({ v, fmt = money }: { v: number; fmt?: (n: number) => string }) => <span style={{ color: v >= 0 ? C.good : C.bad, fontWeight: 700, marginLeft: 6, marginRight: 6 }}>{gapWord(v, fmt)}</span>;
const Diff = ({ v, fmt = money, suffix = '' }: { v: number; fmt?: (n: number) => string; suffix?: string }) => <span style={{ color: v >= 0 ? C.good : C.bad, fontWeight: 700, marginLeft: 6, marginRight: 6 }}>{signed(v, fmt)}{suffix}</span>;

function Bar({ p }: { p: number }) {
  return <Box style={{ height: 16, background: C.barBg, borderRadius: 99, marginTop: 6, marginBottom: 6 }}><Box style={{ width: `${Math.max(2, Math.min(100, p))}%`, height: '100%', background: C.green, borderRadius: 99 }}>{''}</Box></Box>;
}
function Card({ children, width, height }: { children: React.ReactNode; width: number | string; height: number }) {
  return <Col style={{ width, height, background: C.soft, borderRadius: 20, padding: '20px 24px', marginRight: 16 }}>{children}</Col>;
}
const Lab = ({ children }: { children: React.ReactNode }) => <Txt style={{ fontSize: 21, fontWeight: 600, color: C.muted }}>{children}</Txt>;
/** Dòng chữ nhỏ ghép nhiều mảnh (chữ thường + số màu). Satori coi mỗi mảnh là một ô flex: mảnh ngắn giữ nguyên dấu cách và không
 *  bẻ dòng giữa chừng, cả dòng được xuống dòng giữa các mảnh; mảnh dài (tên người) tự xuống dòng. */
const Small = ({ children }: { children: React.ReactNode }) => (
  <Txt style={{ fontSize: 20, color: C.muted, marginTop: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
    {React.Children.map(children, (c) => (typeof c === 'string' || typeof c === 'number')
      ? <span style={String(c).length < 34 ? { whiteSpace: 'pre' } : { flex: 1, minWidth: 0 }}>{String(c)}</span> : c)}
  </Txt>
);

/** Thẻ số lớn có KPI ngày + tháng (dùng ở hàng 3 số lớn và khối Marketing). */
function KpiCard({ label, value, k, width, height, extra, note, dayWord = 'hôm nay' }: { label: string; value: number; k: KpiGap | null; width: number | string; height: number; extra?: React.ReactNode; note?: string; dayWord?: string }) {
  return (
    <Card width={width} height={height}>
      <Lab>{label}</Lab>
      {note ? <Txt style={{ fontSize: 16, color: C.muted }}>{note}</Txt> : null}
      <Txt style={{ fontSize: 56, fontWeight: 700, marginTop: 4 }}>{money(value)}</Txt>
      {k ? <Bar p={value / k.daily * 100} /> : null}
      {k ? <Small>{`KPI ${dayWord} ${money(k.daily)} ·`}<Gap v={k.today} /></Small> : <Small>Chưa đặt KPI tháng</Small>}
      {k ? <Small>{'Từ đầu tháng:'}<Diff v={k.month} /></Small> : null}
      {extra ?? null}
    </Card>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <Txt style={{ height: H.secTitle, alignItems: 'flex-end', paddingBottom: 10, fontSize: 24, fontWeight: 700, letterSpacing: 2, color: C.green }}>{children}</Txt>;
}
function SmallCard({ label, value, sub, red, width }: { label: string; value: string; sub?: string; red?: boolean; width: string }) {
  return (
    <Col style={{ width, height: H.cards - 16, background: C.soft, borderRadius: 20, padding: '18px 22px', marginRight: 14 }}>
      <Lab>{label}</Lab>
      <Txt style={{ fontSize: value.length > 9 ? 28 : 36, fontWeight: 700, marginTop: 4, color: red ? C.bad : C.ink, whiteSpace: 'pre' }}>{value}</Txt>
      {sub && <Txt style={{ fontSize: sub.length > 19 ? 16 : 19, color: C.muted, marginTop: 2 }}>{sub}</Txt>}
    </Col>
  );
}
/** Bảng: cột 1 trái, các cột sau phải. widths: % theo cột. */
function Table({ head, rows, widths, red, good, bold }: { head: string[]; rows: string[][]; widths: number[]; red?: boolean[][]; good?: boolean[][]; bold?: boolean[] }) {
  const cell = (i: number) => ({ width: `${widths[i]}%`, justifyContent: i === 0 ? 'flex-start' : 'flex-end', paddingLeft: 10, paddingRight: 10, alignItems: 'center' } as const);
  return (
    <Col>
      <Box style={{ height: H.th, borderBottom: `2px solid ${C.line}`, fontSize: 18, fontWeight: 700, color: C.muted }}>{head.map((h, i) => <Txt key={i} style={cell(i)}>{h}</Txt>)}</Box>
      {rows.map((r, ri) => (
        <Box key={ri} style={{ height: H.tr, borderBottom: `1px solid ${C.line}`, fontSize: 22, background: bold?.[ri] ? C.soft : '#fff', fontWeight: bold?.[ri] ? 700 : 400 }}>
          {r.map((v, i) => <Txt key={i} style={{ ...cell(i), fontWeight: i === 0 || bold?.[ri] ? 700 : 400, ...(good?.[ri]?.[i] ? { color: C.good, fontWeight: 700 } : {}), ...(red?.[ri]?.[i] ? { background: C.badSoft, color: C.bad, fontWeight: 700 } : {}) }}>{v}</Txt>)}
        </Box>
      ))}
    </Col>
  );
}
function Frame({ title, d, children, foot }: { title: string; d: BossData; children: React.ReactNode; foot: string }) {
  return (
    <Col style={{ width: '100%', height: '100%', background: '#fff', color: C.ink, fontFamily: 'Be Vietnam Pro' }}>
      <Col style={{ height: H.head, background: C.green, padding: `34px ${PAD}px 0` }}>
        <Txt style={{ fontSize: 44, fontWeight: 700, color: '#fff' }}>{title}</Txt>
        <Txt style={{ fontSize: 24, color: C.head, marginTop: 8 }}>{`${d.title} · ${d.range} · tất cả POS`}</Txt>
      </Col>
      <Col style={{ padding: `${H.gap}px ${PAD}px 0` }}>{children}</Col>
      <Txt style={{ height: H.foot, padding: `24px ${PAD}px 0`, fontSize: 17, color: C.muted }}>{foot}</Txt>
    </Col>
  );
}

/** Hàng "Ngoài team" luôn hiện ở cuối (Đầu não 14/11: bảng CSKH từng thiếu hàng này vì bị cắt khi quá số dòng). */
export const teamList = (teams: TeamRow[]) => {
  const outside = teams.find((t) => t.name === 'Ngoài team'), rest = teams.filter((t) => t !== outside);
  return outside ? [...rest.slice(0, MAX_TEAMS - 1), outside] : rest.slice(0, MAX_TEAMS);
};
/** Sale: cột tỉ lệ chốt; CSKH: cột TB đơn (CSKH bỏ KPI tỉ lệ chốt — anh Vũ 14/11/2026). */
const teamTable = (teams: TeamRow[], d: BossData, cskh = false) => {
  const list = teamList(teams);
  return {
    rows: list.map((t) => {
      const g = kpiGap(t.goal, d.day, t.monthNet, t.net);
      return [t.name, money(t.net), num(t.orders), cskh ? (t.orders ? `${num(t.net / t.orders / 1000)}k` : '–') : rateText(closeRate(t)), g ? gapWord(g.today) : '–', g ? gapWord(g.month) : '–'];
    }),
    red: list.map((t) => {
      const r = closeRate(t), g = kpiGap(t.goal, d.day, t.monthNet, t.net);
      return [false, false, false, !cskh && r != null && t.base >= 20 && r < BOSS_CLOSE_RED, !!g && g.today < 0, !!g && g.month < 0];
    }),
    good: list.map((t) => { const g = kpiGap(t.goal, d.day, t.monthNet, t.net); return [false, false, false, false, !!g && gapWord(g.today) !== '0' && g.today > 0, !!g && gapWord(g.month) !== '0' && g.month > 0]; }),
  };
};
const TEAM_HEAD = (n: string, cskh = false) => [n, 'Doanh thu', 'Đơn', cskh ? 'TB đơn' : 'TL chốt', 'KPI ngày', 'Từ đầu tháng'];
const TEAM_W = [27, 14, 8, 13, 21, 17];

export function bossImageHeight(img: BossImage) {
  const d = img.data;
  if (img.part === 1) {
    const sale = teamList(d.sale.teams).length, cskh = teamList(d.cskh.teams).length, pos = Math.min(MAX_POS, d.pos.length);
    return H.head + H.gap + H.top + H.note + H.gap
      + H.secTitle + H.cards + H.th + sale * H.tr + H.gap
      + H.secTitle + H.cards + H.th + cskh * H.tr + H.gap
      + H.secTitle + H.mktBig + 16 + H.cards + H.gap
      + H.secTitle + H.th + (pos + 1) * H.tr + H.foot + 10;
  }
  const w = Math.max(1, warnings(d).length), mkt = Math.min(MAX_MKT, d.mkt.teams.length);
  return H.head + H.gap + H.secTitle + w * H.warn + H.gap + H.secTitle + H.th + mkt * H.tr + (mktLeadsNote(d) ? H.mktNote : 0) + H.gap + H.secTitle + H.people + H.gap + H.secTitle + H.ship + H.foot + 10;
}

/** "09:35 14/11" giờ VN từ ISO. */
const costTime = (iso: string) => { const x = new Date(Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`) + 7 * 3600000).toISOString(); return `${x.slice(11, 16)} ${x.slice(8, 10)}/${x.slice(5, 7)}`; };

function Part1({ d }: { d: BossData }) {
  const sk = deptKpi(d.sale.kpi, d), ck = deptKpi(d.cskh.kpi, d);
  const gap = (k: { goal: number | null; monthNet: number; todayNet: number }) => kpiGap(k.goal, d.day, k.monthNet, k.todayNet);
  const sg = gap(d.sale.kpi), cg = gap(d.cskh.kpi), mg = gap(d.mkt.kpi), lg = kpiGap(d.mkt.leadsGoal, d.day, d.mkt.monthLeads, d.mkt.leads);
  const cw = (BOSS_IMAGE_WIDTH - PAD * 2 - 48) / 3;
  const comp = pct(d.company.net - d.company.yesterday, d.company.yesterday);
  const saleRate = closeRate(d.sale), salePrev = closeRate({ base: d.sale.prevBase, closed: d.sale.prevClosed });
  const ret = pct(d.sale.returned, d.sale.packed), can = pct(d.sale.cancelled, d.sale.packed);
  // Ảnh 8h (số trọn ngày hôm qua): ghi rõ ngày thay cho "hôm nay" / "hôm qua" (Đầu não 14/11/2026).
  const dmy = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}`;
  const dayWord = d.until ? 'hôm nay' : `ngày ${dmy(d.day)}`, prevWord = d.until ? 'hôm qua' : `ngày ${dmy(addDays(d.day, -1))}`, prevCmp = d.until ? 'cùng giờ hôm qua' : prevWord;
  const sT = teamTable(d.sale.teams, d), cT = teamTable(d.cskh.teams, d, true);
  const pos = d.pos.slice(0, MAX_POS);
  const ch = (a: number, b: number) => { const v = pct(a - b, b); return v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}%`; };
  return (
    <Frame title="MEGATECH · Báo cáo tổng quan" d={d} foot={`Đã chốt là chốt (ngày chốt đơn). Hoàn / hủy tính trên đơn đi từ đầu tháng. KPI ngày = KPI tháng chia đúng số ngày trong tháng. Đỏ: chốt dưới ${BOSS_CLOSE_RED}%, hoàn từ ${BOSS_RETURN_RED}%, hủy từ ${BOSS_CANCEL_RED}%.`}>
      <Box style={{ height: H.top }}>
        <KpiCard label="SALE" note="theo ngày chốt, gồm đơn hủy về sau" dayWord={dayWord} value={d.sale.kpi.todayNet} k={sg} width={cw} height={H.top} />
        <KpiCard label="CSKH" dayWord={dayWord} value={d.cskh.kpi.todayNet} k={cg} width={cw} height={H.top} />
        <KpiCard label="MKT (DT New)" note="theo ngày xác nhận, đã trừ đơn hủy" dayWord={dayWord} value={d.mkt.kpi.todayNet} k={mg} width={cw} height={H.top}
          extra={lg ? <Small>{`Số ${num(d.mkt.leads)} / KPI ${num(lg.daily)} ·`}<Gap v={lg.today} fmt={num} /></Small> : <Small>{`Số đưa về ${num(d.mkt.leads)}`}</Small>} />
      </Box>
      <Txt style={{ height: H.note, paddingTop: 12, fontSize: 18, color: C.muted, flexWrap: 'wrap' }}>
        {`Tổng công ty ${money(d.company.net)} · ${num(d.company.orders)} đơn chốt${d.company.orders ? ` · TB đơn ${num(d.company.net / d.company.orders)} đ` : ''}${comp != null ? ` · so ${prevCmp} ${comp >= 0 ? '+' : '−'}${Math.abs(comp).toFixed(1).replace('.', ',')}%` : ''}. Tổng chỉ tính người bán có hậu tố SALE / CSKH / MKT và người được bật Vẫn tính. DT MKT đã nằm trong số Sale, không cộng 3 số.`}
      </Txt>
      <Box style={{ height: H.gap }}>{''}</Box>

      <Title>SALE</Title>
      <Box style={{ height: H.cards }}>
        <SmallCard width="23.5%" label="Tháng / KPI" value={money(d.sale.kpi.monthNet)} sub={sk ? `/ ${money(sk.goal)} · còn ${money(Math.max(0, sk.goal - d.sale.kpi.monthNet))}` : 'chưa đặt KPI'} />
        <SmallCard width="23.5%" label="Tỉ lệ chốt" value={rateText(saleRate)} red={saleRate != null && saleRate < BOSS_CLOSE_RED} sub={salePrev != null ? `${prevWord} ${rateText(salePrev)}` : undefined} />
        <SmallCard width="23.5%" label="Tỉ lệ hoàn" value={rateText(ret)} red={ret != null && ret >= BOSS_RETURN_RED} sub="trên đơn đi" />
        <SmallCard width="23.5%" label="Tỉ lệ hủy" value={rateText(can)} red={can != null && can >= BOSS_CANCEL_RED} sub="trên đơn đi" />
      </Box>
      <Table head={TEAM_HEAD('Team Sale')} rows={sT.rows} red={sT.red} good={sT.good} widths={TEAM_W} />
      <Box style={{ height: H.gap }}>{''}</Box>

      <Title>CSKH</Title>
      <Box style={{ height: H.cards }}>
        <SmallCard width="31.5%" label="Tháng / KPI" value={money(d.cskh.kpi.monthNet)} sub={ck ? `/ ${money(ck.goal)} · còn ${money(Math.max(0, ck.goal - d.cskh.kpi.monthNet))}` : 'chưa đặt KPI'} />
        <SmallCard width="31.5%" label="Đơn chốt" value={num(d.cskh.orders)} />
        <SmallCard width="31.5%" label="TB đơn" value={d.cskh.orders ? `${num(d.cskh.kpi.todayNet / d.cskh.orders / 1000)}k` : '–'} />
      </Box>
      <Table head={TEAM_HEAD('Team CSKH', true)} rows={cT.rows} red={cT.red} good={cT.good} widths={TEAM_W} />
      <Box style={{ height: H.gap }}>{''}</Box>

      <Title>MARKETING</Title>
      <Box style={{ height: H.mktBig }}>
        <KpiCard label={`Doanh thu MKT${d.until ? ` tới ${d.until}` : ''} (DT New)`} note="theo ngày xác nhận, đã trừ đơn hủy" dayWord={dayWord} value={d.mkt.kpi.todayNet} k={mg} width="48%" height={H.mktBig} />
        <Card width="48%" height={H.mktBig}>
          <Lab>{`Số đưa về${d.until ? ` tới ${d.until}` : ''}`}</Lab>
          <Txt style={{ fontSize: 56, fontWeight: 700, marginTop: 4 }}>{num(d.mkt.leads)}</Txt>
          {lg ? <Bar p={d.mkt.leads / lg.daily * 100} /> : null}
          {lg ? <Small>{`KPI số ${dayWord} ${num(lg.daily)} ·`}<Gap v={lg.today} fmt={num} /></Small> : <Small>Chưa đặt KPI số</Small>}
          {lg ? <Small>{'Từ đầu tháng:'}<Diff v={lg.month} fmt={num} /></Small> : null}
        </Card>
      </Box>
      <Box style={{ height: 16 }}>{''}</Box>
      <Box style={{ height: H.cards }}>
        <SmallCard width="23.5%" label="Chi phí QC" value={money(d.mkt.cost)} sub={d.mkt.costAt ? `cập nhật ${costTime(d.mkt.costAt)}` : "chưa nhập sheet"} />
        <SmallCard width="23.5%" label="Chi phí / số" value={d.mkt.leads ? num(d.mkt.cost / d.mkt.leads) : '–'} />
        <SmallCard width="23.5%" label="ROAS" value={d.mkt.cost ? `${(d.mkt.kpi.todayNet / d.mkt.cost).toFixed(2).replace('.', ',')}×` : '–'} />
        <SmallCard width="23.5%" label="% CP / DT New" value={rateText(pct(d.mkt.cost, d.mkt.kpi.todayNet))} />
      </Box>
      <Box style={{ height: H.gap }}>{''}</Box>

      <Title>THEO POS</Title>
      <Table head={['POS', 'Doanh thu', 'Đơn', `So ${prevCmp}`]} widths={[44, 20, 14, 22]} bold={[...pos.map(() => false), true]}
        rows={[...pos.map((p) => [p.name, money(p.net), num(p.orders), ch(p.net, p.yesterday)]), ['Tổng', money(d.company.net), num(d.company.orders), ch(d.company.net, d.company.yesterday)]]}
        red={[...pos.map((p) => [false, false, false, p.net < p.yesterday]), [false, false, false, d.company.net < d.company.yesterday]]} />
    </Frame>
  );
}

function Part2({ d }: { d: BossData }) {
  const w = warnings(d), mkt: MktTeamRow[] = d.mkt.teams.slice(0, MAX_MKT);
  const topSale = [...d.sale.people].sort((a, b) => b.net - a.net).slice(0, 3), topCskh = [...d.cskh.people].sort((a, b) => b.net - a.net).slice(0, 3);
  const topMkt = [...d.mkt.people].sort((a, b) => b.newNet - a.newNet).slice(0, 3);
  const saleCoach = coach(d.sale.people)[0];
  const mktCoach = d.mkt.people.filter((p) => p.cost >= 2e6).map((p) => ({ ...p, roas: p.newNet / p.cost })).sort((a, b) => a.roas - b.roas)[0];
  const person = (i: number, text: string) => (
    <Box key={i} style={{ fontSize: 20, color: C.muted, marginTop: 4 }}>
      <span style={{ color: C.ink, fontWeight: 700, width: 26, flexShrink: 0 }}>{`${i + 1}.`}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
    </Box>
  );
  const col = (label: string, lines: React.ReactNode[], coachLine: React.ReactNode) => (
    <Col style={{ width: '31.5%', height: H.people, background: C.soft, borderRadius: 20, padding: '20px 22px', marginRight: 14 }}>
      <Lab>{label}</Lab>
      {lines.length ? lines : <Small>Chưa có số</Small>}
      <Txt style={{ fontSize: 21, fontWeight: 600, color: C.muted, marginTop: 14 }}>Cần kèm</Txt>
      {coachLine}
    </Col>
  );
  return (
    <Frame title="MEGATECH · Chi tiết & cảnh báo" d={d} foot="Cần kèm: chốt thấp nhất (dưới 40%) trong người có từ 20 số; MKT: ROAS thấp nhất trong người chi từ 2 tr. Mọi số tính lại từ đơn gốc như trang Điều hành, không dùng số AI.">
      <Title>CẦN CHÚ Ý</Title>
      {(w.length ? w : ['Không có gì cần chú ý']).map((t, i) => (
        <Txt key={i} style={{ height: H.warn - 10, marginBottom: 10, alignItems: 'center', padding: '0 16px', borderRadius: 12, fontSize: 22, background: w.length ? C.badSoft : C.soft, color: w.length ? '#7f1d1d' : C.muted }}>{t}</Txt>
      ))}
      <Box style={{ height: H.gap }}>{''}</Box>
      <Title>TEAM MARKETING</Title>
      <Table head={['Team MKT', 'Chi phí', 'DT New', 'ROAS', 'Số về', 'KPI số', 'TL chốt']} widths={[20, 11, 12, 10, 9, 26, 12]}
        rows={mkt.map((t) => {
          const lg = kpiGap(t.leadsGoal, d.day, t.monthLeads, t.leads);
          return [t.name, money(t.cost), money(t.newNet), t.cost ? `${(t.newNet / t.cost).toFixed(2).replace('.', ',')}×` : '–', num(t.leads), lg ? `${gapWord(lg.today, num)} · ${gapWord(lg.month, num)}` : '–', rateText(pct(t.closed, t.leads))];
        })}
        red={mkt.map((t) => { const r = pct(t.closed, t.leads), lg = kpiGap(t.leadsGoal, d.day, t.monthLeads, t.leads); return [false, false, false, !!t.cost && t.newNet / t.cost < 1.5, false, !!lg && lg.today < 0, r != null && t.leads >= 20 && r < BOSS_CLOSE_RED]; })} />
      {mktLeadsNote(d) ? <Txt style={{ height: H.mktNote, paddingTop: 8, fontSize: 16, color: C.muted }}>{mktLeadsNote(d)!}</Txt> : null}
      <Box style={{ height: H.gap }}>{''}</Box>
      <Title>TOP NGƯỜI</Title>
      <Box style={{ height: H.people }}>
        {col('Sale', topSale.map((p, i) => person(i, `${p.name} · ${money(p.net)} · ${rateText(closeRate(p), 0)}`)), saleCoach ? <Small>{saleCoach.name} ·<span style={{ color: C.bad, fontWeight: 700, marginLeft: 6, marginRight: 6 }}>{rateText(saleCoach.rate, 0)}</span>/ {num(saleCoach.base)} số</Small> : <Small>Không có</Small>)}
        {col('CSKH', topCskh.map((p, i) => person(i, `${p.name} · ${money(p.net)}`)), <Small>Không xét tỉ lệ chốt CSKH</Small>)}
        {col('Marketing', topMkt.map((p, i) => person(i, `${p.name} · ${money(p.newNet)}${p.cost ? ` · ${(p.newNet / p.cost).toFixed(1).replace('.', ',')}×` : ''}`)), mktCoach ? <Small>{mktCoach.name} · ROAS<span style={{ color: C.bad, fontWeight: 700, marginLeft: 6 }}>{`${mktCoach.roas.toFixed(1).replace('.', ',')}×`}</span></Small> : <Small>Không có</Small>)}
      </Box>
      <Box style={{ height: H.gap }}>{''}</Box>
      <Title>ĐƠN ĐI & VẬN ĐƠN</Title>
      <Box style={{ height: H.ship }}>
        <SmallCard width="23.5%" label="Đơn gửi đi" value={num(d.ship.packed)} sub={`${num(d.ship.closed)} đơn chốt`} />
        <SmallCard width="23.5%" label="Viettel Post" value={num(d.ship.vtp)} sub="đơn gửi" />
        <SmallCard width="23.5%" label="Shopee Express" value={num(d.ship.spx)} sub="đơn gửi" />
        <SmallCard width="23.5%" label="Hãng khác" value={num((d.ship.others ?? []).reduce((a, o) => a + o.orders, 0))} sub={(d.ship.others ?? []).map((o) => `${o.name} ${num(o.orders)}`).join(" · ") || "không có"} />
      </Box>
    </Frame>
  );
}

export function BossImageView({ img }: { img: BossImage }) {
  return img.part === 1 ? <Part1 d={img.data} /> : <Part2 d={img.data} />;
}
