// Khung chi tiết khi rê chuột vào một con số (anh Vũ 19/11/2026 "với tất cả các con số, khi đưa chuột vào đều ra chi tiết của con số đó",
// plan đã duyệt "ok plan rê chuột"). File này chỉ dựng NỘI DUNG khung từ số trang đã có (không gọi API, không tính lại theo cách khác);
// giao diện ở app/num-detail.tsx. Mỗi khung 3 phần: tên đủ + phạm vi; các số tạo ra nó (cộng hoặc chia ra đúng số đang hiện); so kỳ trước.

export type NumKind = 'money' | 'count' | 'pct' | 'x';
export type DetailPart = { label: string; value: number | null; kind: NumKind; strong?: boolean; tone?: 'good' | 'warn' | 'bad' };
export type NumDetailSpec = {
  title: string;
  scope?: string;
  /** Các số tạo ra số đang hiện. sum: các dòng không strong cộng lại bằng dòng strong; div: dòng 1 ÷ dòng 2 = dòng strong. */
  parts: DetailPart[];
  op?: 'sum' | 'div';
  /** Một câu cách tính. */
  how?: string;
  prev?: { value: number | null; kind: NumKind; label?: string };
  /** Nhắc ở cuối khung, vd "Bấm để mở danh sách đơn". */
  hint?: string;
  /** Kết quả phép chia bị chặn trên (tỷ lệ chốt tối đa 100%). */
  cap?: number;
  /** Số đi kèm (không thuộc phép cộng / chia ở trên), vd cột cũ đã gộp vào khung: AOV, Cho ĐVVC (25/11/2026). */
  extra?: DetailPart[];
};

/** Số MKT của một dòng (bảng Marketer / team / sản phẩm / ngày, ô tổng): cùng tên trường với lib/reports/mkt-analytics.ts và lib/ops/ad-costs.ts. */
export type MktNumbers = {
  cost: number; net: number; closed: number; phones: number;
  newNet?: number; newOrders?: number; cskhNet?: number; cskhOrders?: number; otherNet?: number;
  roas: number | null; costPerClosed: number | null; costPerLead: number | null; costShare?: number | null;
  /** Phần của người có chi phí (ROAS, chi phí / đơn, chi phí / số chỉ tính phần này). */
  coveredNet?: number; coveredClosed?: number; coveredPhones?: number;
  covered?: { net: number; closed: number; phones: number };
};
export type MktCell = 'cost' | 'net' | 'newNet' | 'cskhNet' | 'roas' | 'closed' | 'phones' | 'rate' | 'cpc' | 'cpl' | 'share';

const cov = (m: MktNumbers) => m.covered ?? { net: m.coveredNet ?? m.newNet ?? 0, closed: m.coveredClosed ?? m.newOrders ?? 0, phones: m.coveredPhones ?? m.phones };

/** Nội dung khung chi tiết cho một ô số MKT. name = tên dòng (marketer, team…), scope = kỳ · POS. prevNet: doanh thu kỳ trước nếu trang có. */
export function mktCellDetail(cell: MktCell, m: MktNumbers, ctx: { name: string; scope: string; prevNet?: number; ordersHint?: boolean }): NumDetailSpec {
  const c = cov(m), scope = `${ctx.name} · ${ctx.scope}`;
  const hint = ctx.ordersHint ? 'Bấm vào số để mở danh sách đơn.' : undefined;
  switch (cell) {
    case 'cost': return {
      title: 'Chi phí quảng cáo', scope,
      parts: [{ label: 'Chi phí trong kỳ', value: m.cost, kind: 'money', strong: true }, { label: 'DT chốt (New) cùng kỳ', value: m.newNet ?? null, kind: 'money' }],
      how: 'Tiền marketer ghi trên sheet CPQC hoặc nhập tay, theo ngày. Tên trên sheet chưa ghép tài khoản POS không tính.',
    };
    case 'net': {
      const parts: DetailPart[] = [
        { label: 'DT chốt (New, Sale chốt)', value: m.newNet ?? 0, kind: 'money' },
        { label: 'DT CSKH chốt', value: m.cskhNet ?? 0, kind: 'money' },
        ...(m.otherNet ? [{ label: 'Người bán khác', value: m.otherNet, kind: 'money' as const }] : []),
        { label: 'Doanh thu', value: m.net, kind: 'money', strong: true },
      ];
      return { title: 'Doanh thu MKT', scope, op: 'sum', parts, how: `Đơn chốt theo ngày xác nhận lần đầu, sau giảm giá, kể cả đơn hủy / hoàn sau đó (đã chốt là chốt) · ${m.closed} đơn.`, prev: ctx.prevNet === undefined ? undefined : { value: ctx.prevNet, kind: 'money' }, hint };
    }
    case 'newNet': return {
      title: 'Doanh thu chốt (New)', scope,
      parts: [{ label: 'Số đơn New', value: m.newOrders ?? 0, kind: 'count' }, { label: 'DT chốt', value: m.newNet ?? 0, kind: 'money', strong: true }],
      how: 'Đơn có Marketer này, người bán thuộc Sale, đã chốt trong kỳ, kể cả đơn hủy / hoàn sau đó.', hint,
    };
    case 'cskhNet': return {
      title: 'Doanh thu CSKH', scope,
      parts: [{ label: 'Số đơn CSKH', value: m.cskhOrders ?? 0, kind: 'count' }, { label: 'DT CSKH', value: m.cskhNet ?? 0, kind: 'money', strong: true }],
      how: 'Đơn có Marketer này, người bán thuộc CSKH, đã chốt trong kỳ, kể cả đơn hủy / hoàn sau đó. Không vào ROAS.', hint,
    };
    case 'roas': return {
      title: 'ROAS', scope, op: 'div',
      parts: [{ label: 'DT chốt (New) của người có chi phí', value: c.net, kind: 'money' }, { label: 'Chi phí', value: m.cost, kind: 'money' }, { label: 'ROAS', value: m.roas, kind: 'x', strong: true, tone: m.roas === null ? undefined : m.roas >= 3 ? 'good' : m.roas >= 1.5 ? 'warn' : 'bad' }],
      how: 'ROAS = DT chốt ÷ chi phí. Xanh từ 3×, vàng từ 1,5×, đỏ dưới 1,5×.',
    };
    case 'closed': return {
      title: 'Đơn chốt', scope, op: 'sum',
      parts: [
        { label: 'Đơn New (Sale chốt)', value: m.newOrders ?? 0, kind: 'count' },
        { label: 'Đơn CSKH chốt', value: m.cskhOrders ?? 0, kind: 'count' },
        ...(m.closed - (m.newOrders ?? 0) - (m.cskhOrders ?? 0) ? [{ label: 'Người bán khác', value: m.closed - (m.newOrders ?? 0) - (m.cskhOrders ?? 0), kind: 'count' as const }] : []),
        { label: 'Đơn chốt', value: m.closed, kind: 'count', strong: true },
      ], hint,
    };
    case 'phones': return {
      title: 'Số (SĐT) về', scope,
      parts: [{ label: 'SĐT khác nhau trên đơn tạo trong kỳ', value: m.phones, kind: 'count', strong: true }],
      how: 'Chỉ đơn đang chia cho Sale (số New) hoặc CSKH theo nút đầu trang; trừ đơn xoá.', hint,
    };
    case 'rate': {
      const r = m.phones > 0 ? Math.min(100, m.closed / m.phones * 100) : null;
      return {
        title: 'Tỷ lệ chốt', scope, op: 'div', cap: 100,
        parts: [{ label: 'Đơn chốt', value: m.closed, kind: 'count' }, { label: 'Số (SĐT)', value: m.phones, kind: 'count' }, { label: 'Tỷ lệ chốt', value: r, kind: 'pct', strong: true, tone: r === null ? undefined : r < 40 ? 'bad' : 'good' }],
        how: 'Đơn chốt ÷ số, tối đa 100%. Dưới 40% tô đỏ.',
      };
    }
    case 'cpc': return {
      title: 'Chi phí / đơn New', scope, op: 'div',
      parts: [{ label: 'Chi phí', value: m.cost, kind: 'money' }, { label: 'Đơn New của người có chi phí', value: c.closed, kind: 'count' }, { label: 'Chi phí / đơn', value: m.costPerClosed, kind: 'money', strong: true }],
    };
    case 'cpl': return {
      title: 'Chi phí / số', scope, op: 'div',
      parts: [{ label: 'Chi phí', value: m.cost, kind: 'money' }, { label: 'Số của người có chi phí', value: c.phones, kind: 'count' }, { label: 'Chi phí / số', value: m.costPerLead, kind: 'money', strong: true }],
    };
    case 'share': return {
      title: '% chi phí / DT chốt', scope, op: 'div',
      parts: [{ label: 'Chi phí', value: m.cost, kind: 'money' }, { label: 'DT chốt của người có chi phí', value: c.net, kind: 'money' }, { label: '% chi phí', value: m.costShare == null ? null : m.costShare * 100, kind: 'pct', strong: true }],
    };
  }
}

/** Kiểm khung: các dòng cộng / chia ra đúng dòng đậm (dùng trong test và để dò ô sai). Sai số làm tròn 0,5%. */
export function detailAddsUp(s: NumDetailSpec): boolean {
  const strong = s.parts.find((p) => p.strong), rest = s.parts.filter((p) => !p.strong);
  if (!strong || strong.value === null) return true;
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 0.005);
  if (s.op === 'div') {
    const [a, b] = rest;
    if (!a || !b || a.value === null || b.value === null || !b.value) return true;
    const q = a.value / b.value * (strong.kind === 'pct' ? 100 : 1);
    return near(s.cap === undefined ? q : Math.min(s.cap, q), strong.value);
  }
  if (s.op === 'sum' && rest.length && rest.every((p) => p.kind === strong.kind)) return near(rest.reduce((t, p) => t + (p.value ?? 0), 0), strong.value);
  return true;
}
