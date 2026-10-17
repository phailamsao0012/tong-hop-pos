'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MentorReport, MentorCustomer } from '@/lib/staff-scope';
import { todayVn } from '@/lib/report-time';

const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
type Detail = { customer: MentorCustomer; notes: { id: string; at: string; message: string }[] };

export function MentorView() {
  const today = todayVn();
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`), [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState('');
  const [q, setQ] = useState('');
  const [staff, setStaff] = useState<MentorReport | null>(null), [customers, setCustomers] = useState<MentorReport | null>(null);
  const [sellerId, setSellerId] = useState(''), [page, setPage] = useState(1);
  const [orderSeller, setOrderSeller] = useState(''), [orderPage, setOrderPage] = useState(1), [orders, setOrders] = useState<MentorReport | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null), [customerId, setCustomerId] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  // POS được chọn ở đây chỉ trong các POS máy chủ cấp cho tài khoản.
  const params = new URLSearchParams({ start, end, ...(posIds ? { posIds } : {}) }).toString();
  useEffect(() => {
    const controller = new AbortController();
    const read = async <T,>(path: string): Promise<T> => {
      const response = await fetch(path, { signal: controller.signal, cache: 'no-store' });
      const body = await response.json() as T & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Không tải được dữ liệu.');
      return body as T;
    };
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setBusy(true); setError(''); setDetail(null); setStaff(null); setCustomers(null); setOrders(null);
      return Promise.all([
      read<MentorReport>(`/api/reports/staff-compare?${params}`),
      read<MentorReport>(`/api/reports/customers?${params}&sellerId=${encodeURIComponent(sellerId)}&page=${page}&q=${encodeURIComponent(q)}`),
      customerId ? read<Detail>(`/api/reports/customer-detail?${params}&sellerId=${encodeURIComponent(sellerId)}&customerId=${encodeURIComponent(customerId)}`) : Promise.resolve(null),
      orderSeller ? read<MentorReport>(`/api/reports/staff-detail?${params}&sellerId=${encodeURIComponent(orderSeller)}&orders=1&page=${orderPage}`) : Promise.resolve(null),
      ]);
    }).then((result) => { if (result && !controller.signal.aborted) { const [people, clients, selected, sources] = result; setStaff(people); setCustomers(clients); setDetail(selected); setOrders(sources); } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) { setStaff(null); setCustomers(null); setError(reason instanceof Error ? reason.message : 'Không tải được dữ liệu.'); } })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [params, q, sellerId, page, customerId, orderSeller, orderPage, refresh]);
  const setTarget = async (id: string) => {
    const raw = window.prompt('Doanh thu mục tiêu tháng hiện tại (₫)');
    if (raw === null) return;
    const rawOrders = window.prompt('Số đơn chốt mục tiêu tháng hiện tại');
    if (rawOrders === null) return;
    const closedOrders = Number(rawOrders);
    if (!Number.isSafeInteger(closedOrders) || closedOrders < 0) return;
    const revenue = Number(raw);
    if (!Number.isFinite(revenue) || revenue < 0) { setError('Mục tiêu không hợp lệ.'); return; }
    const previousResponse = await fetch(`/api/targets?month=${today.slice(0, 7)}`, { cache: 'no-store' });
    if (!previousResponse.ok) { setError('Không tải được KPI hiện tại.'); return; }
    const previous = await previousResponse.json() as { items: { scope: string; refId: string; closedOrders: number; workingDays: number | null }[] };
    const existing = previous.items.find((item) => item.scope === 'employee' && item.refId === id);
    const response = await fetch('/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: today.slice(0, 7), only: [`employee:${id}`], items: [{ ...existing, scope: 'employee', refId: id, revenue, closedOrders }] }) });
    if (!response.ok) { setError('Không lưu được KPI.'); return; }
    setRefresh((value) => value + 1);
  };
  const reset = () => { setPage(1); setCustomerId(''); setOrderSeller(''); setOrderPage(1); };
  const openOrders = (id: string) => { setOrderSeller(id); setOrderPage(1); setCustomerId(''); };

  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-ink">Team của tôi</h1><p className="text-sm text-ink-2">Chỉ số của chính mình và người đang thuộc team mình kèm, theo phạm vi POS được cấp.</p></div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
      <label className="text-sm" htmlFor="mentor-start">Từ ngày<Input id="mentor-start" type="date" value={start} onChange={(e) => { setStart(e.target.value); reset(); }} /></label>
      <label className="text-sm" htmlFor="mentor-end">Đến ngày<Input id="mentor-end" type="date" value={end} onChange={(e) => { setEnd(e.target.value); reset(); }} /></label>
      <label className="text-sm">POS<select className="block rounded-md border border-line bg-surface p-2" value={posIds} onChange={(e) => { setPosIds(e.target.value); reset(); }}>
        <option value="">Mọi POS được cấp</option>
        {staff?.posOptions?.map((pos) => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
      </select></label>
      <Button onClick={() => setRefresh((value) => value + 1)} disabled={busy}>Làm mới</Button>
    </div>
    {busy && <output>Đang tải team của tôi…</output>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {staff && <>
      <p className="text-xs text-ink-2" title="Cách tính">{staff.definitions}</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full text-sm"><thead><tr>{['Nhân viên', 'Doanh thu trong kỳ', 'Đơn chốt', 'AOV', 'Tỷ lệ chốt', 'Tỷ lệ hoàn', `KPI tháng ${staff.month}`].map((label) => <th className="whitespace-nowrap p-3 text-left" key={label}>{label}</th>)}</tr></thead>
        <tbody>{staff.staff.map((person) => <tr key={person.id} className="border-t border-line"><td className="p-3"><button className="link" onClick={() => { setSellerId(person.id); reset(); }}>{person.name}</button></td>
          <td className="p-3"><button className="link" title="Cách tính: doanh thu đơn chốt trong kỳ; bấm xem đơn tạo ra số này" onClick={() => openOrders(person.id)}>{number(person.net)} ₫</button></td>
          <td className="p-3"><button className="link" title="Cách tính: đơn chốt trong kỳ" onClick={() => openOrders(person.id)}>{number(person.closedOrders)}</button></td><td className="p-3" title="Cách tính: doanh thu ÷ đơn chốt"><button className="link" onClick={() => openOrders(person.id)}>{number(person.aov)}</button></td>
          <td className="p-3">{number(person.closeRate)}{person.closeRate === null ? '' : '%'}</td><td className="p-3">{number(person.returnRate)}{person.returnRate === null ? '' : '%'}</td>
          <td className="p-3" title="Cách tính: doanh thu tháng hiện tại ÷ mục tiêu doanh thu tháng, trong POS được cấp">{person.target === null ? 'Chưa đặt' : `${number(person.monthNet)} / ${number(person.target)} ₫ (${person.target ? number(person.monthNet / person.target * 100) : '—'}%)`} <button className="link" onClick={() => void setTarget(person.id)}>Đặt KPI</button></td></tr>)}</tbody>
      </table>{!staff.staff.length && <p className="p-4 text-ink-2">Chưa có người trong phạm vi. Chủ hệ thống cần kiểm tra liên kết hồ sơ và ghế Mentor đang hiệu lực.</p>}</div>
    </>}
    {orders && <section className="space-y-3 rounded-xl border border-line bg-surface p-4"><h2 className="text-lg font-semibold">Đơn chốt tạo ra số của {staff?.staff.find((person) => person.id === orderSeller)?.name}</h2><p className="text-xs text-ink-2">Giữ nguyên kỳ {start} → {end} và POS đang chọn.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Mã đơn</th><th className="p-2 text-left">Ngày chốt</th><th className="p-2 text-left">Doanh thu</th></tr></thead><tbody>{orders.orderRows?.map((order) => <tr key={order.id}><td className="p-2">{order.code}</td><td className="p-2">{order.at}</td><td className="p-2">{number(order.net)} ₫</td></tr>)}</tbody></table></div>
      <div className="flex gap-3"><Button variant="outline" disabled={orderPage <= 1 || busy} onClick={() => setOrderPage(orderPage - 1)}>Trước</Button><span>Trang {orderPage}</span><Button variant="outline" disabled={!orders.hasMore || busy} onClick={() => setOrderPage(orderPage + 1)}>Tiếp</Button><Button variant="outline" onClick={() => setOrderSeller('')}>Đóng</Button></div>
    </section>}
    {customers && <section className="space-y-3"><Input aria-label="Tìm theo tên khách" placeholder="Tìm theo tên khách" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} /><div className="flex items-center gap-3"><h2 className="text-lg font-semibold">Khách trong phạm vi{sellerId ? ` · ${staff?.staff.find((person) => person.id === sellerId)?.name ?? 'Nhân viên'}` : ''}</h2>{sellerId && <Button variant="outline" onClick={() => { setSellerId(''); reset(); }}>Cả team</Button>}</div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full text-sm"><thead><tr>{['Khách', 'SĐT đã che', 'Đơn chốt trong kỳ', 'Doanh thu trong kỳ'].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>
        {customers.customers.map((customer) => <tr key={customer.id} className="border-t border-line"><td className="p-3"><button className="link" onClick={() => setCustomerId(customer.id)}>{customer.name || 'Khách'}</button></td><td className="p-3">{customer.phone ?? '—'}</td><td className="p-3">{number(customer.orders)}</td><td className="p-3">{number(customer.net)} ₫</td></tr>)}
      </tbody></table>{!customers.customers.length && <p className="p-4">Chưa có khách trong phạm vi đang chọn.</p>}</div>
      <div className="flex gap-3"><Button variant="outline" disabled={page <= 1 || busy} onClick={() => { setPage(page - 1); setCustomerId(''); }}>Trước</Button><span>Trang {page}</span><Button variant="outline" disabled={!customers.hasMore || busy} onClick={() => { setPage(page + 1); setCustomerId(''); }}>Tiếp</Button></div>
    </section>}
    {detail && <section className="space-y-2 rounded-xl border border-line bg-surface p-4"><h2 className="text-lg font-semibold">{detail.customer.name} · {detail.customer.phone}</h2><p>Ghi chú của người trong phạm vi</p>{detail.notes.map((note) => <p key={note.id} className="border-t border-line py-2"><time className="text-xs text-ink-2">{note.at}</time><br />{note.message}</p>)}{!detail.notes.length && <p>Chưa có ghi chú trong phạm vi.</p>}<Button variant="outline" onClick={() => setCustomerId('')}>Đóng</Button></section>}
  </div>;
}
