// Ảnh báo cáo tổng quan cho sếp (anh Vũ 14/11/2026, mẫu đã chốt: https://claude.ai/artifact/TyXGkhnrCa3f3NpneSPsMs).
// Luôn giao diện sáng. Vẽ bằng next/og (satori): mọi khối nhiều con phải display:flex, không dùng grid / table.
// Chiều cao tính trước theo số dòng (bossImageHeight) vì ImageResponse cần chiều cao cố định.
import React from 'react';
import {
  BOSS_CANCEL_RED, BOSS_CLOSE_RED, BOSS_RETURN_RED, COACH_MIN_BASE, closeRate, coach, coachMkt, money, num, prevWordOf, rateText, rateVsPrev, rateVsText, vsPrev, vsText, warnings,
  pct, type BossData, type BossImage, type BossPage, type TeamRow } from '@/lib/zalo/boss-report';

export const BOSS_IMAGE_WIDTH = 1080;
const C = { ink: '#14231c', muted: '#5f6f67', line: '#e3ebe6', soft: '#f2f6f3', green: '#2f6b4f', good: '#2e7d32', bad: '#c62828', badSoft: '#fdecea', barBg: '#e3e9e5', head: '#d6efe3' };
const PAD = 44;
const H = { mktNote: 40, head: 150, top: 250, secTitle: 48, cards: 150, th: 50, tr: 54, foot: 96, foot1: 150, gap: 30, warn: 64, people: 410, ship: 170 };
const MAX_TEAMS = 12, MAX_POS = 8, MAX_MKT = 7;
/** Cộng số về các team MKT lớn hơn tổng (một SĐT về từ nhiều team: mỗi team đếm, tổng đếm 1 lần) → chú thích nhỏ dưới bảng (anh Vũ 16/11/2026). */
export const mktLeadsNote = (d: Pick<BossData, 'mkt'>) => { const sum = d.mkt.teams.reduce((a, t) => a + t.leads, 0); return sum > d.mkt.leads ? `Cộng các team ${num(sum)} số, lớn hơn tổng ${num(d.mkt.leads)} số về: một SĐT về từ nhiều team được đếm ở mỗi team, tổng chỉ đếm 1 lần.` : null; };

const Box = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', ...style }}>{children}</div>;
const Col = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{children}</div>;
const Txt = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', ...style }}>{children}</div>;
/** Số so hôm qua: xanh nếu tăng, đỏ nếu giảm, xám nếu "–" hoặc 0. */
const toneOf = (v: number | null, text: string) => (v == null || text === '–' || text === '0' || text === '+0,0%' ? C.muted : v > 0 ? C.good : C.bad);

function Card({ children, width, height }: { children: React.ReactNode; width: number | string; height: number }) {
  return <Col style={{ width, height, background: C.soft, borderRadius: 20, padding: '20px 24px', marginRight: 16 }}>{children}</Col>;
}
const Lab = ({ children }: { children: React.ReactNode }) => <Txt style={{ fontSize: 21, fontWeight: 600, color: C.muted }}>{children}</Txt>;
/** Dòng chữ nhỏ ghép nhiều mảnh (chữ thường + số màu). Satori coi mỗi mảnh là một ô flex: mảnh ngắn giữ nguyên dấu cách và không
 *  bẻ dòng giữa chừng, cả dòng được xuống dòng giữa các mảnh; mảnh dài (tên người) tự xuống dòng. */
const Small = ({ children }: { children: React.ReactNode }) => (
  <Txt style={{ fontSize: 20, color: C.muted, marginTop: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
    {React.Children.map(children, (c) => (typeof c === 'string' || typeof c === 'number')
      ? <span style={String(c).length < 20 ? { whiteSpace: 'pre' } : { flex: 1, minWidth: 0 }}>{String(c)}</span> : c)}
  </Txt>
);

/** Ô số lớn đầu ảnh (mẫu rút gọn 17/11/2026): số hôm nay, dưới là "so hôm qua" bằng tiền và các dòng phụ. */
function BigTile({ label, value, lines, width }: { label: string; value: string; lines: React.ReactNode[]; width: number }) {
  return (
    <Card width={width} height={H.top}>
      <Lab>{label}</Lab>
      <Txt style={{ fontSize: 56, fontWeight: 700, marginTop: 4 }}>{value}</Txt>
      {lines}
    </Card>
  );
}
const Line = ({ children }: { children: React.ReactNode }) => <Small>{children}</Small>;
const Tone = ({ v, text }: { v: number | null; text: string }) => <span style={{ color: toneOf(v, text), fontWeight: 700, marginLeft: 6, marginRight: 6, whiteSpace: 'pre' }}>{text}</span>;

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
/** Ô bảng có màu (mẫu rút gọn): chữ, màu chữ, nền đỏ nhạt khi chốt dưới ngưỡng; extra = số nhỏ cạnh số chính (vd "+12" cạnh số new). */
type Cell = { t: string; tone?: string; red?: boolean; extra?: { t: string; tone: string } };
function RichTable({ head, rows, widths }: { head: string[]; rows: Cell[][]; widths: number[] }) {
  const cell = (i: number) => ({ width: `${widths[i]}%`, justifyContent: i === 0 ? 'flex-start' : 'flex-end', paddingLeft: 10, paddingRight: 10, alignItems: 'center' } as const);
  return (
    <Col>
      <Box style={{ height: H.th, borderBottom: `2px solid ${C.line}`, fontSize: 18, fontWeight: 700, color: C.muted }}>{head.map((h, i) => <Txt key={i} style={cell(i)}>{h}</Txt>)}</Box>
      {rows.map((r, ri) => (
        <Box key={ri} style={{ height: H.tr, borderBottom: `1px solid ${C.line}`, fontSize: 22, background: '#fff' }}>
          {r.map((c, i) => (
            <Txt key={i} style={{ ...cell(i), fontWeight: i === 0 || c.tone ? 700 : 400, color: c.tone ?? C.ink, ...(c.red ? { background: C.badSoft, color: C.bad, fontWeight: 700 } : {}) }}>
              <span style={{ whiteSpace: 'pre' }}>{c.t}</span>
              {c.extra ? <span style={{ color: c.extra.tone, fontSize: 18, fontWeight: 700, marginLeft: 8, whiteSpace: 'pre' }}>{c.extra.t}</span> : null}
            </Txt>
          ))}
        </Box>
      ))}
    </Col>
  );
}
function Frame({ title, d, children, foot, footHeight = H.foot }: { title: string; d: BossData; children: React.ReactNode; foot: string; footHeight?: number }) {
  return (
    <Col style={{ width: '100%', height: '100%', background: '#fff', color: C.ink, fontFamily: 'Be Vietnam Pro' }}>
      <Col style={{ height: H.head, background: C.green, padding: `34px ${PAD}px 0` }}>
        <Txt style={{ fontSize: 44, fontWeight: 700, color: '#fff' }}>{title}</Txt>
        <Txt style={{ fontSize: 24, color: C.head, marginTop: 8 }}>{`${d.title} · ${d.range} · ${d.until ? `so với 0h tới ${d.until} hôm qua` : `so với ngày ${prevWordOf(d)}`} · tất cả POS`}</Txt>
      </Col>
      <Col style={{ padding: `${H.gap}px ${PAD}px 0` }}>{children}</Col>
      <Txt style={{ height: footHeight, padding: `24px ${PAD}px 0`, fontSize: 17, color: C.muted }}>{foot}</Txt>
    </Col>
  );
}

/** Hàng "Ngoài team" luôn hiện ở cuối (Đầu não 14/11: bảng CSKH từng thiếu hàng này vì bị cắt khi quá số dòng). */
export const teamList = (teams: TeamRow[]) => {
  const outside = teams.find((t) => t.name === 'Ngoài team'), rest = teams.filter((t) => t !== outside);
  return outside ? [...rest.slice(0, MAX_TEAMS - 1), outside] : rest.slice(0, MAX_TEAMS);
};
const FOOT1 = `So hôm qua: cùng khoảng giờ hôm qua (báo cáo trọn ngày: trọn ngày trước), xanh là nhiều hơn, đỏ là ít hơn, hôm qua bằng 0 ghi "–". Đơn: đơn chốt của nhân viên Sale / CSKH tại POS đó (đơn tài khoản MKT tự chốt không nằm ở đây). TL chốt Sale: đơn lên trong khoảng giờ đã chốt ÷ đơn lên. Số new: số điện thoại mới chia cho Sale; TL chốt MKT = đơn New chốt ÷ số new. Chi phí "–": team chưa có chi phí trên sheet. Đỏ: chốt dưới ${BOSS_CLOSE_RED}%. Đã chốt là chốt (ngày chốt đơn).`;

export function bossImageHeight(img: BossImage) {
  const d = img.data;
  if (img.page) return pageHeight(img.page, d);
  if (img.part === 1) {
    const sale = Math.min(MAX_POS, d.sale.byPos?.length ?? 0), cskh = Math.min(MAX_POS, d.cskh.byPos?.length ?? 0), mkt = Math.min(MAX_MKT, d.mkt.teams.length);
    return H.head + H.gap + H.top + H.gap
      + H.secTitle + H.th + Math.max(1, sale) * H.tr + H.gap
      + H.secTitle + H.th + Math.max(1, cskh) * H.tr + H.gap
      + H.secTitle + H.th + Math.max(1, mkt) * H.tr + (mktLeadsNote(d) ? H.mktNote : 0) + H.foot1 + 10;
  }
  const w = Math.max(1, warnings(d).length);
  return H.head + H.gap + H.secTitle + w * H.warn + H.gap + H.secTitle + H.people + H.gap + H.secTitle + H.ship + H.foot + 10;
}

function Part1({ d }: { d: BossData }) {
  const cw = (BOSS_IMAGE_WIDTH - PAD * 2 - 48) / 3;
  const pw = prevWordOf(d), so = `so ${pw}`;
  const tone = (v: number | null, fmt?: (n: number) => string) => { const t = vsText(v, fmt); return { t, tone: toneOf(v, t) }; };
  const saleRate = closeRate(d.sale), saleRateVs = rateVsPrev(d.sale), saleVs = vsPrev(d.sale.kpi.todayNet, d.sale.prevNet);
  const cskhVs = vsPrev(d.cskh.kpi.todayNet, d.cskh.prevNet), mktVs = vsPrev(d.mkt.kpi.todayNet, d.mkt.prevNewNet), leadsVs = vsPrev(d.mkt.leads, d.mkt.prevLeads);
  const red = (r: number | null, base: number) => r != null && base >= COACH_MIN_BASE && r < BOSS_CLOSE_RED;
  const empty = (n: number) => [[{ t: 'Chưa có số' }, ...Array.from({ length: n - 1 }, () => ({ t: '' }))]];
  const saleRows: Cell[][] = (d.sale.byPos ?? []).slice(0, MAX_POS).map((p) => {
    const r = closeRate(p), rv = rateVsPrev(p);
    return [{ t: p.name }, { t: money(p.net) }, tone(vsPrev(p.net, p.prevNet)), { t: num(p.orders) }, { t: rateText(r), red: red(r, p.base) }, { t: rateVsText(rv), tone: toneOf(rv, rateVsText(rv)) }];
  });
  const cskhRows: Cell[][] = (d.cskh.byPos ?? []).slice(0, MAX_POS).map((p) => [
    { t: p.name }, { t: money(p.net) }, { t: num(p.orders) }, { t: p.orders ? `${num(p.net / p.orders / 1000)}k` : '–' }, tone(vsPrev(p.net, p.prevNet)),
  ]);
  const mktRows: Cell[][] = d.mkt.teams.slice(0, MAX_MKT).map((t) => {
    const r = closeRate({ base: t.leads, closed: t.closed }), lv = vsPrev(t.leads, t.prevLeads), lt = vsText(lv, num);
    return [{ t: t.name }, { t: t.cost ? money(t.cost) : '–' }, { t: money(t.newNet) }, tone(vsPrev(t.newNet, t.prevNewNet)), { t: num(t.leads), extra: { t: lt, tone: toneOf(lv, lt) } }, { t: rateText(r), red: red(r, t.leads) }];
  });
  return (
    <Frame title="MEGATECH · Báo cáo tổng quan" d={d} foot={FOOT1} footHeight={H.foot1}>
      <Box style={{ height: H.top }}>
        <BigTile label="SALE" value={money(d.sale.kpi.todayNet)} width={cw} lines={[
          <Line key="a">{''}<Tone v={saleVs} text={vsText(saleVs)} />{so}</Line>,
          <Line key="b">{'TL chốt'}<span style={{ marginLeft: 6, whiteSpace: 'pre', ...(saleRate != null && saleRate < BOSS_CLOSE_RED ? { color: C.bad, fontWeight: 700 } : {}) }}>{rateText(saleRate)}</span><Tone v={saleRateVs} text={rateVsText(saleRateVs)} /></Line>,
        ]} />
        <BigTile label="CSKH" value={money(d.cskh.kpi.todayNet)} width={cw} lines={[
          <Line key="a">{''}<Tone v={cskhVs} text={vsText(cskhVs)} />{so}</Line>,
          <Line key="b">{`${num(d.cskh.orders)} đơn`}</Line>,
        ]} />
        <BigTile label="MKT (DT New)" value={money(d.mkt.kpi.todayNet)} width={cw} lines={[
          <Line key="a">{''}<Tone v={mktVs} text={vsText(mktVs)} />{so}</Line>,
          <Line key="b">{`Số new ${num(d.mkt.leads)}`}<Tone v={leadsVs} text={vsText(leadsVs, num)} />{leadsVs == null ? '' : 'số'}</Line>,
        ]} />
      </Box>
      <Box style={{ height: H.gap }}>{''}</Box>

      <Title>SALE THEO POS</Title>
      <RichTable head={['POS', 'Doanh thu', `DT so ${pw}`, 'Đơn', 'TL chốt', `TLC so ${pw}`]} widths={[29, 15, 16, 9, 13, 18]} rows={saleRows.length ? saleRows : empty(6)} />
      <Box style={{ height: H.gap }}>{''}</Box>

      <Title>CSKH THEO POS</Title>
      <RichTable head={['POS', 'Doanh thu', 'Đơn', 'TB đơn', `So ${pw}`]} widths={[36, 17, 12, 15, 20]} rows={cskhRows.length ? cskhRows : empty(5)} />
      <Box style={{ height: H.gap }}>{''}</Box>

      <Title>MARKETING THEO TEAM</Title>
      <RichTable head={['Team MKT', 'Chi phí', 'DT New', `DT so ${pw}`, 'Số new', 'TL chốt']} widths={[24, 13, 14, 16, 19, 14]} rows={mktRows.length ? mktRows : empty(6)} />
      {mktLeadsNote(d) ? <Txt style={{ height: H.mktNote, paddingTop: 8, fontSize: 16, color: C.muted }}>{mktLeadsNote(d)!}</Txt> : null}
    </Frame>
  );
}

function Part2({ d }: { d: BossData }) {
  const w = warnings(d);
  const topSale = [...d.sale.people].sort((a, b) => b.net - a.net).slice(0, 3), topCskh = [...d.cskh.people].sort((a, b) => b.net - a.net).slice(0, 3);
  const topMkt = [...d.mkt.people].sort((a, b) => b.newNet - a.newNet).slice(0, 3);
  const saleCoach = coach(d.sale.people)[0];
  const mktCoach = coachMkt(d.mkt.people)[0];
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
      <Txt style={{ fontSize: 21, fontWeight: 600, color: C.muted, marginTop: 18 }}>Cần kèm</Txt>
      <Col style={{ marginTop: 8 }}>{coachLine}</Col>
    </Col>
  );
  // "Cần kèm" (Đầu não kiểm 17–18/11/2026): tên một dòng riêng, tự xuống dòng hết chiều rộng ô; tỉ lệ chốt và số ở dòng dưới.
  const coachOf = (name: string, rate: number, count: number) => (
    <Col>
      <Txt style={{ fontSize: 20, color: C.ink, lineHeight: 1.35 }}>{name}</Txt>
      <Txt style={{ fontSize: 20, color: C.muted, marginTop: 4, whiteSpace: 'pre' }}>
        <span style={{ color: C.bad, fontWeight: 700 }}>{rateText(rate, 0)}</span>
        <span>{` / ${num(count)} số`}</span>
      </Txt>
    </Col>
  );
  return (
    <Frame title="MEGATECH · Chi tiết & cảnh báo" d={d} foot="Cần kèm: người chốt thấp nhất (dưới 40%) trong người có từ 20 số; MKT: TL chốt = đơn New chốt ÷ số new, từ 20 số new. Top Marketing ghi DT New và TL chốt. Mọi số tính lại từ đơn gốc như trang Điều hành, không dùng số AI.">
      <Title>CẦN CHÚ Ý</Title>
      {(w.length ? w : ['Không có gì cần chú ý']).map((t, i) => (
        <Txt key={i} style={{ height: H.warn - 10, marginBottom: 10, alignItems: 'center', padding: '0 16px', borderRadius: 12, fontSize: 22, background: w.length ? C.badSoft : C.soft, color: w.length ? '#7f1d1d' : C.muted }}>{t}</Txt>
      ))}
      <Box style={{ height: H.gap }}>{''}</Box>
      <Title>TOP NGƯỜI</Title>
      <Box style={{ height: H.people }}>
        {col('Sale', topSale.map((p, i) => person(i, `${p.name} · ${money(p.net)} · ${rateText(closeRate(p), 0)}`)), saleCoach ? coachOf(saleCoach.name, saleCoach.rate, saleCoach.base) : <Small>Không có</Small>)}
        {col('CSKH', topCskh.map((p, i) => person(i, `${p.name} · ${money(p.net)}`)), <Small>Không xét tỉ lệ chốt CSKH</Small>)}
        {col('Marketing', topMkt.map((p, i) => person(i, `${p.name} · ${money(p.newNet)} · ${rateText(closeRate({ base: p.leads, closed: p.closed ?? 0 }), 0)}`)), mktCoach ? coachOf(mktCoach.name, mktCoach.rate, mktCoach.leads) : <Small>Không có</Small>)}
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
  if (img.page) return <PageView page={img.page} d={img.data} />;
  return img.part === 1 ? <Part1 d={img.data} /> : <Part2 d={img.data} />;
}

/** 5 ảnh mỗi mốc (anh Vũ 27/11/2026: "gửi 4 ảnh, 1 ảnh sale, 1 ảnh cskh, 1 ảnh mkt, 1 ảnh tổng quan, nếu được thêm vận đơn nữa"). */
const TOP = 5;
const kpiLine = (k: { goal: number | null; monthNet: number }) => (k.goal ? `KPI tháng ${rateText(pct(k.monthNet, k.goal), 0)} · ${money(k.monthNet)}/${money(k.goal)}` : 'Chưa đặt KPI tháng');
const tableH = (rows: number) => H.secTitle + H.th + Math.max(1, rows) * H.tr + H.gap;
const saleTeams = (d: BossData) => teamList(d.sale.teams).filter((t) => t.net || t.base || t.orders);
const cskhTeams = (d: BossData) => teamList(d.cskh.teams).filter((t) => t.net || t.orders);
const topSale = (d: BossData) => [...d.sale.people].sort((a, b) => b.net - a.net).slice(0, TOP);
const topCskh = (d: BossData) => [...d.cskh.people].sort((a, b) => b.net - a.net).slice(0, TOP);
const topMkt = (d: BossData) => [...d.mkt.people].sort((a, b) => b.newNet - a.newNet).slice(0, TOP);
const carriers = (d: BossData) => [{ name: 'Viettel Post', orders: d.ship.vtp }, { name: 'Shopee Express', orders: d.ship.spx }, ...(d.ship.others ?? [])].filter((c) => c.orders > 0);

function pageHeight(page: BossPage, d: BossData) {
  const base = H.head + H.gap + H.foot + 10;
  switch (page) {
    case 'tong': return base + H.top + H.gap + H.top + H.gap + tableH(Math.min(MAX_POS, d.pos.length)) + H.secTitle + Math.max(1, warnings(d).length) * H.warn;
    case 'sale': return base + H.top + H.gap + tableH(Math.min(MAX_POS, d.sale.byPos?.length ?? 0)) + tableH(saleTeams(d).length) + tableH(topSale(d).length) + H.warn;
    case 'cskh': return base + H.top + H.gap + tableH(Math.min(MAX_POS, d.cskh.byPos?.length ?? 0)) + tableH(cskhTeams(d).length) + tableH(topCskh(d).length);
    case 'mkt': return base + H.top + H.gap + tableH(Math.min(MAX_MKT, d.mkt.teams.length)) + (mktLeadsNote(d) ? H.mktNote : 0) + tableH(topMkt(d).length) + H.warn;
    default: return base + H.cards + H.gap + tableH(carriers(d).length);
  }
}

const tone = (v: number | null, fmt?: (n: number) => string): Cell => { const t = vsText(v, fmt); return { t, tone: toneOf(v, t) }; };
const redRate = (r: number | null, base: number) => r != null && base >= COACH_MIN_BASE && r < BOSS_CLOSE_RED;
const empty = (n: number): Cell[][] => [[{ t: 'Chưa có số' }, ...Array.from({ length: n - 1 }, () => ({ t: '' }))]];
const Gap = () => <Box style={{ height: H.gap }}>{''}</Box>;
const Table = ({ title, head, widths, rows }: { title: string; head: string[]; widths: number[]; rows: Cell[][] }) => (
  <Col>
    <Title>{title}</Title>
    <RichTable head={head} widths={widths} rows={rows.length ? rows : empty(head.length)} />
    <Gap />
  </Col>
);
const Note = ({ children, bad }: { children: React.ReactNode; bad?: boolean }) => (
  <Txt style={{ height: H.warn - 10, marginBottom: 10, alignItems: 'center', padding: '0 16px', borderRadius: 12, fontSize: 22, background: bad ? C.badSoft : C.soft, color: bad ? '#7f1d1d' : C.muted }}>{children}</Txt>
);
const pctMonth = (t: TeamRow): Cell => ({ t: t.goal ? rateText(pct(t.monthNet, t.goal), 0) : '–' });
const aov = (net: number, n: number) => (n ? `${num(net / n / 1000)}k` : '–');
const tileW = (BOSS_IMAGE_WIDTH - PAD * 2 - 48) / 3;

function Overview({ d }: { d: BossData }) {
  const so = `so ${prevWordOf(d)}`;
  const cv = vsPrev(d.company.net, d.company.yesterday), saleVs = vsPrev(d.sale.kpi.todayNet, d.sale.prevNet);
  const cskhVs = vsPrev(d.cskh.kpi.todayNet, d.cskh.prevNet), mktVs = vsPrev(d.mkt.kpi.todayNet, d.mkt.prevNewNet);
  const w = warnings(d);
  const posRows: Cell[][] = d.pos.slice(0, MAX_POS).map((p) => [{ t: p.name }, { t: money(p.net) }, tone(vsPrev(p.net, p.yesterday)), { t: num(p.orders) }, { t: aov(p.net, p.orders) }]);
  return (
    <Frame title="MEGATECH · Tổng quan" d={d} foot="Ảnh 1/5. Doanh thu công ty = cộng các POS. So hôm qua: cùng khoảng giờ hôm qua (báo cáo trọn ngày: trọn ngày trước), xanh nhiều hơn, đỏ ít hơn. KPI tháng: đã đạt từ đầu tháng ÷ KPI tháng. Chi tiết từng bộ phận ở ảnh 2–5.">
      <Box style={{ height: H.top }}>
        <Card width="100%" height={H.top}>
          <Lab>DOANH THU CÔNG TY</Lab>
          <Txt style={{ fontSize: 64, fontWeight: 700, marginTop: 4 }}>{money(d.company.net)}</Txt>
          <Line>{''}<Tone v={cv} text={vsText(cv)} />{so}</Line>
          <Line>{`${num(d.company.orders)} đơn chốt`}</Line>
        </Card>
      </Box>
      <Gap />
      <Box style={{ height: H.top }}>
        <BigTile label="SALE" value={money(d.sale.kpi.todayNet)} width={tileW} lines={[<Line key="a">{''}<Tone v={saleVs} text={vsText(saleVs)} />{so}</Line>, <Line key="b">{kpiLine(d.sale.kpi)}</Line>]} />
        <BigTile label="CSKH" value={money(d.cskh.kpi.todayNet)} width={tileW} lines={[<Line key="a">{''}<Tone v={cskhVs} text={vsText(cskhVs)} />{so}</Line>, <Line key="b">{kpiLine(d.cskh.kpi)}</Line>]} />
        <BigTile label="MKT (DT New)" value={money(d.mkt.kpi.todayNet)} width={tileW} lines={[<Line key="a">{''}<Tone v={mktVs} text={vsText(mktVs)} />{so}</Line>, <Line key="b">{kpiLine(d.mkt.kpi)}</Line>]} />
      </Box>
      <Gap />
      <Table title="DOANH THU THEO POS" head={['POS', 'Doanh thu', `So ${prevWordOf(d)}`, 'Đơn', 'TB đơn']} widths={[34, 18, 18, 12, 18]} rows={posRows} />
      <Title>CẦN CHÚ Ý</Title>
      {(w.length ? w : ['Không có gì cần chú ý']).map((t, i) => <Note key={i} bad={!!w.length}>{t}</Note>)}
    </Frame>
  );
}

function SalePage({ d }: { d: BossData }) {
  const pw = prevWordOf(d), so = `so ${pw}`;
  const rate = closeRate(d.sale), rv = rateVsPrev(d.sale), nv = vsPrev(d.sale.kpi.todayNet, d.sale.prevNet);
  const pos: Cell[][] = (d.sale.byPos ?? []).slice(0, MAX_POS).map((p) => {
    const r = closeRate(p), x = rateVsPrev(p);
    return [{ t: p.name }, { t: money(p.net) }, tone(vsPrev(p.net, p.prevNet)), { t: num(p.orders) }, { t: rateText(r), red: redRate(r, p.base) }, { t: rateVsText(x), tone: toneOf(x, rateVsText(x)) }];
  });
  const teams: Cell[][] = saleTeams(d).map((t) => { const r = closeRate(t); return [{ t: t.name }, { t: money(t.net) }, { t: num(t.orders) }, { t: num(t.base) }, { t: rateText(r), red: redRate(r, t.base) }, pctMonth(t)]; });
  const top: Cell[][] = topSale(d).map((p, i) => { const r = closeRate(p); return [{ t: `${i + 1}. ${p.name}` }, { t: p.team }, { t: money(p.net) }, { t: num(p.orders) }, { t: rateText(r, 0), red: redRate(r, p.base) }]; });
  const c = coach(d.sale.people)[0];
  return (
    <Frame title="MEGATECH · Sale" d={d} foot={`Ảnh 2/5. TL chốt: đơn lên trong khoảng giờ đã chốt ÷ đơn lên (số chia). Đỏ: chốt dưới ${BOSS_CLOSE_RED}% (từ ${COACH_MIN_BASE} số). Cần kèm: người chốt thấp nhất dưới ${BOSS_CLOSE_RED}% trong người có từ ${COACH_MIN_BASE} số. KPI tháng: đã đạt ÷ KPI tháng của team.`}>
      <Box style={{ height: H.top }}>
        <BigTile label="DOANH THU SALE" value={money(d.sale.kpi.todayNet)} width={tileW} lines={[<Line key="a">{''}<Tone v={nv} text={vsText(nv)} />{so}</Line>, <Line key="b">{kpiLine(d.sale.kpi)}</Line>]} />
        <BigTile label="TỈ LỆ CHỐT" value={rateText(rate)} width={tileW} lines={[<Line key="a">{''}<Tone v={rv} text={rateVsText(rv)} />{so}</Line>, <Line key="b">{`${num(Math.min(d.sale.base, d.sale.closed))}/${num(d.sale.base)} số đã chốt`}</Line>]} />
        <BigTile label="ĐƠN ĐI" value={num(d.sale.packed)} width={tileW} lines={[<Line key="a">{`Hoàn ${num(d.sale.returned)} · Hủy ${num(d.sale.cancelled)}`}</Line>]} />
      </Box>
      <Gap />
      <Table title="SALE THEO POS" head={['POS', 'Doanh thu', `DT so ${pw}`, 'Đơn', 'TL chốt', `TLC so ${pw}`]} widths={[29, 15, 16, 9, 13, 18]} rows={pos} />
      <Table title="SALE THEO TEAM" head={['Team', 'Doanh thu', 'Đơn', 'Số chia', 'TL chốt', 'KPI tháng']} widths={[32, 16, 10, 13, 14, 15]} rows={teams} />
      <Table title={`TOP ${TOP} SALE`} head={['Nhân viên', 'Team', 'Doanh thu', 'Đơn', 'TL chốt']} widths={[34, 24, 16, 11, 15]} rows={top} />
      <Note bad={!!c}>{c ? `Cần kèm: ${c.name} · chốt ${rateText(c.rate, 0)} / ${num(c.base)} số` : 'Cần kèm: không có'}</Note>
    </Frame>
  );
}

function CskhPage({ d }: { d: BossData }) {
  const pw = prevWordOf(d), so = `so ${pw}`;
  const nv = vsPrev(d.cskh.kpi.todayNet, d.cskh.prevNet), ov = vsPrev(d.cskh.orders, d.cskh.prevOrders);
  const pos: Cell[][] = (d.cskh.byPos ?? []).slice(0, MAX_POS).map((p) => [{ t: p.name }, { t: money(p.net) }, tone(vsPrev(p.net, p.prevNet)), { t: num(p.orders) }, { t: aov(p.net, p.orders) }]);
  const teams: Cell[][] = cskhTeams(d).map((t) => [{ t: t.name }, { t: money(t.net) }, { t: num(t.orders) }, { t: aov(t.net, t.orders) }, pctMonth(t)]);
  const top: Cell[][] = topCskh(d).map((p, i) => [{ t: `${i + 1}. ${p.name}` }, { t: p.team }, { t: money(p.net) }, { t: num(p.orders) }, { t: aov(p.net, p.orders) }]);
  return (
    <Frame title="MEGATECH · CSKH" d={d} foot="Ảnh 3/5. Đơn: đơn chốt của nhân viên CSKH. TB đơn: doanh thu ÷ đơn. KPI tháng: đã đạt ÷ KPI tháng của team. CSKH không xét tỉ lệ chốt.">
      <Box style={{ height: H.top }}>
        <BigTile label="DOANH THU CSKH" value={money(d.cskh.kpi.todayNet)} width={tileW} lines={[<Line key="a">{''}<Tone v={nv} text={vsText(nv)} />{so}</Line>, <Line key="b">{kpiLine(d.cskh.kpi)}</Line>]} />
        <BigTile label="ĐƠN CHỐT" value={num(d.cskh.orders)} width={tileW} lines={[<Line key="a">{''}<Tone v={ov} text={vsText(ov, num)} />{so}</Line>]} />
        <BigTile label="TB ĐƠN" value={aov(d.cskh.kpi.todayNet, d.cskh.orders)} width={tileW} lines={[<Line key="a">doanh thu ÷ đơn</Line>]} />
      </Box>
      <Gap />
      <Table title="CSKH THEO POS" head={['POS', 'Doanh thu', `So ${pw}`, 'Đơn', 'TB đơn']} widths={[34, 18, 18, 12, 18]} rows={pos} />
      <Table title="CSKH THEO TEAM" head={['Team', 'Doanh thu', 'Đơn', 'TB đơn', 'KPI tháng']} widths={[36, 18, 12, 16, 18]} rows={teams} />
      <Table title={`TOP ${TOP} CSKH`} head={['Nhân viên', 'Team', 'Doanh thu', 'Đơn', 'TB đơn']} widths={[34, 24, 16, 11, 15]} rows={top} />
    </Frame>
  );
}

function MktPage({ d }: { d: BossData }) {
  const pw = prevWordOf(d), so = `so ${pw}`;
  const nv = vsPrev(d.mkt.kpi.todayNet, d.mkt.prevNewNet), lv = vsPrev(d.mkt.leads, d.mkt.prevLeads);
  const closedAll = d.mkt.teams.reduce((a, t) => a + t.closed, 0), rate = closeRate({ base: d.mkt.leads, closed: closedAll });
  const teams: Cell[][] = d.mkt.teams.slice(0, MAX_MKT).map((t) => {
    const r = closeRate({ base: t.leads, closed: t.closed }), x = vsPrev(t.leads, t.prevLeads), xt = vsText(x, num);
    return [{ t: t.name }, { t: t.cost ? money(t.cost) : '–' }, { t: money(t.newNet) }, tone(vsPrev(t.newNet, t.prevNewNet)), { t: num(t.leads), extra: { t: xt, tone: toneOf(x, xt) } }, { t: rateText(r), red: redRate(r, t.leads) }];
  });
  const top: Cell[][] = topMkt(d).map((p, i) => { const r = closeRate({ base: p.leads, closed: p.closed ?? 0 }); return [{ t: `${i + 1}. ${p.name}` }, { t: p.team }, { t: p.cost ? money(p.cost) : '–' }, { t: money(p.newNet) }, { t: num(p.leads) }, { t: rateText(r, 0), red: redRate(r, p.leads) }]; });
  const c = coachMkt(d.mkt.people)[0];
  const note = mktLeadsNote(d);
  return (
    <Frame title="MEGATECH · Marketing" d={d} foot={`Ảnh 4/5. DT New: doanh thu đơn New. Số new: số điện thoại mới chia cho Sale; TL chốt = đơn New chốt ÷ số new. Chi phí "–": chưa có chi phí trên sheet. Đỏ: chốt dưới ${BOSS_CLOSE_RED}% (từ ${COACH_MIN_BASE} số new).`}>
      <Box style={{ height: H.top }}>
        <BigTile label="DT NEW" value={money(d.mkt.kpi.todayNet)} width={tileW} lines={[<Line key="a">{''}<Tone v={nv} text={vsText(nv)} />{so}</Line>, <Line key="b">{kpiLine(d.mkt.kpi)}</Line>]} />
        <BigTile label="SỐ NEW" value={num(d.mkt.leads)} width={tileW} lines={[<Line key="a">{''}<Tone v={lv} text={vsText(lv, num)} />{so}</Line>, <Line key="b">{`TL chốt ${rateText(rate)}`}</Line>]} />
        <BigTile label="CHI PHÍ QC" value={d.mkt.cost ? money(d.mkt.cost) : '–'} width={tileW} lines={[<Line key="a">{d.mkt.cost && d.mkt.kpi.todayNet ? `${rateText(pct(d.mkt.cost, d.mkt.kpi.todayNet), 0)} DT New` : 'chưa có chi phí'}</Line>]} />
      </Box>
      <Gap />
      <Col>
        <Title>MARKETING THEO TEAM</Title>
        <RichTable head={['Team MKT', 'Chi phí', 'DT New', `DT so ${pw}`, 'Số new', 'TL chốt']} widths={[24, 13, 14, 16, 19, 14]} rows={teams.length ? teams : empty(6)} />
        {note ? <Txt style={{ height: H.mktNote, paddingTop: 8, fontSize: 16, color: C.muted }}>{note}</Txt> : null}
        <Gap />
      </Col>
      <Table title={`TOP ${TOP} MARKETING`} head={['Marketer', 'Team', 'Chi phí', 'DT New', 'Số new', 'TL chốt']} widths={[30, 20, 13, 14, 11, 12]} rows={top} />
      <Note bad={!!c}>{c ? `Cần kèm: ${c.name} · chốt ${rateText(c.rate, 0)} / ${num(c.leads)} số new` : 'Cần kèm: không có'}</Note>
    </Frame>
  );
}

function ShipPage({ d }: { d: BossData }) {
  const list = carriers(d), total = list.reduce((a, c) => a + c.orders, 0);
  const rows: Cell[][] = list.map((c) => [{ t: c.name }, { t: num(c.orders) }, { t: rateText(pct(c.orders, total), 0) }]);
  const ret = pct(d.sale.returned, d.sale.packed), can = pct(d.sale.cancelled, d.sale.packed);
  return (
    <Frame title="MEGATECH · Vận đơn" d={d} foot="Ảnh 5/5. Đơn gửi đi: đơn giao cho hãng vận chuyển trong khoảng giờ (theo ngày gửi, số riêng của Vận đơn, không cộng vào doanh thu). Hoàn / hủy: trên đơn đi của Sale.">
      <Box style={{ height: H.cards }}>
        <SmallCard width="23.5%" label="Đơn gửi đi" value={num(d.ship.packed)} sub={`${num(d.ship.closed)} đơn chốt`} />
        <SmallCard width="23.5%" label="Đơn đi Sale" value={num(d.sale.packed)} sub="đã đóng hàng" />
        <SmallCard width="23.5%" label="Hoàn" value={num(d.sale.returned)} sub={rateText(ret)} red={ret != null && ret >= BOSS_RETURN_RED} />
        <SmallCard width="23.5%" label="Hủy" value={num(d.sale.cancelled)} sub={rateText(can)} red={can != null && can >= BOSS_CANCEL_RED} />
      </Box>
      <Gap />
      <Table title="THEO HÃNG VẬN CHUYỂN" head={['Hãng', 'Đơn gửi', 'Phần']} widths={[50, 25, 25]} rows={rows} />
    </Frame>
  );
}

function PageView({ page, d }: { page: BossPage; d: BossData }) {
  switch (page) {
    case 'tong': return <Overview d={d} />;
    case 'sale': return <SalePage d={d} />;
    case 'cskh': return <CskhPage d={d} />;
    case 'mkt': return <MktPage d={d} />;
    default: return <ShipPage d={d} />;
  }
}
