// Ảnh báo cáo tổng quan cho sếp (anh Vũ 14/11/2026, mẫu đã chốt: https://claude.ai/artifact/TyXGkhnrCa3f3NpneSPsMs).
// Luôn giao diện sáng. Vẽ bằng next/og (satori): mọi khối nhiều con phải display:flex, không dùng grid / table.
// Chiều cao tính trước theo số dòng (bossImageHeight) vì ImageResponse cần chiều cao cố định.
import React from 'react';
import {
  BOSS_CLOSE_RED, COACH_MIN_BASE, closeRate, coach, coachMkt, money, num, prevWordOf, rateText, rateVsPrev, rateVsText, vsPrev, vsText, warnings,
  type BossData, type BossImage, type TeamRow } from '@/lib/zalo/boss-report';

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
const FOOT1 = `So hôm qua: cùng khoảng giờ hôm qua (báo cáo trọn ngày: trọn ngày trước), xanh là nhiều hơn, đỏ là ít hơn, hôm qua bằng 0 ghi "–". Đơn: đơn chốt của nhân viên Sale / CSKH tại POS đó (đơn tài khoản MKT tự chốt không nằm ở đây). TL chốt Sale: đơn lên trong khoảng giờ đã chốt ÷ đơn lên. Số new: số điện thoại mới chia cho Sale; TL chốt MKT = đơn New chốt ÷ số new. Chi phí "–": team chưa có chi phí trên sheet. Đỏ: chốt dưới ${BOSS_CLOSE_RED}%. Doanh thu theo ngày tạo đơn; đã chốt là chốt (đơn tạo hôm trước, chốt sáng nay trước 8h vẫn tính cho hôm trước).`;

export function bossImageHeight(img: BossImage) {
  const d = img.data;
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
  return img.part === 1 ? <Part1 d={img.data} /> : <Part2 d={img.data} />;
}
