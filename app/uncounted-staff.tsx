'use client';

// Danh sách người KHÔNG được tính doanh số (tên trên Pancake không có hậu tố MKT / CSKH / SALE), kèm số đơn và tiền trong kỳ, để anh Vũ soát.
// Mặc định thu gọn một dòng; chủ hệ thống bấm "Vẫn tính" cho người sót hậu tố (hoặc sửa tên trên Pancake, lần đồng bộ sau tự đúng).
import { useState } from 'react';
import { ChevronDown, UserX } from 'lucide-react';
import { useApi } from './use-api';
import { money, posName, toast, vi } from './ui-kit';

type Person = { id: string; name: string; department: string | null; posIds: string[]; orders: number; net: number };
type Data = { sellers: Person[]; marketers: Person[]; extra: Person[]; canEdit: boolean; rule: string };

export function UncountedStaff({ start, end, posIds }: { start: string; end: string; posIds: string[] }) {
  const params = new URLSearchParams({ start, end, posIds: posIds.join(',') });
  const { data, reload } = useApi<Data>(`/api/reports/uncounted?${params}`, { refreshMs: 10 * 60000, keep: false });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return null;
  const rows = [...data.sellers.map((p) => ({ ...p, role: 'Người bán' })), ...data.marketers.map((p) => ({ ...p, role: 'Marketer' }))];
  if (!rows.length && !data.extra.length) return null;
  const orders = data.sellers.reduce((a, p) => a + p.orders, 0), net = data.sellers.reduce((a, p) => a + p.net, 0);
  const people = new Set(rows.map((r) => r.id)).size;
  const toggle = async (p: Person, counted: boolean) => {
    setBusy(p.id);
    try {
      const r = await fetch('/api/reports/uncounted', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: p.id, counted }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Lỗi');
      toast(counted ? `Đã tính doanh số cho ${p.name}` : `Đã bỏ tính doanh số ${p.name}`); reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'Không lưu được', { kind: 'error' }); }
    finally { setBusy(null); }
  };
  const where = (p: Person) => p.posIds.length >= 6 ? 'Cả 6 POS' : p.posIds.map(posName).join(', ');
  return (
    <section className="card p-3" aria-label="Người không tính doanh số">
      <button type="button" className="flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-left text-[12.5px]" aria-expanded={open} onClick={() => setOpen(!open)}>
        <UserX size={14} aria-hidden="true" className="text-ink-3" />
        <span className="font-semibold text-ink">Không tính doanh số: {vi.format(people)} người</span>
        {rows.length > 0 && <span className="num text-ink-2">· người bán {vi.format(orders)} đơn chốt, {money(net)} trong kỳ</span>}
        <span className="text-ink-3">· tên trên Pancake không có hậu tố MKT, CSKH, SALE</span>
        <ChevronDown size={14} aria-hidden="true" className={`ml-auto text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-2 grid gap-2">
        <p className="text-[12px] text-ink-3">{data.rule} Ai sót hậu tố thì sửa tên trên Pancake (lần đồng bộ sau tự tính){data.canEdit ? ', hoặc bấm Vẫn tính' : ''}.</p>
        {rows.length > 0 && <div className="overflow-x-auto">
          <table className="tbl compact min-w-[640px]">
            <thead><tr><th>Tên trên Pancake</th><th>Vai trò trên đơn</th><th>Bộ phận Pancake</th><th>POS</th><th className="n">Đơn</th><th className="n">Tiền</th>{data.canEdit && <th><span className="sr-only">Thao tác</span></th>}</tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={`${p.role}:${p.id}`}>
                <td className="font-medium">{p.name}</td><td className="text-xs">{p.role}</td><td className="text-xs">{p.department ?? '—'}</td>
                <td className="text-xs">{where(p)}</td><td className="n">{vi.format(p.orders)}</td><td className="n">{money(p.net)}</td>
                {data.canEdit && <td><button type="button" className={`btn sm ${busy === p.id ? 'is-busy' : ''}`} disabled={busy === p.id} onClick={() => void toggle(p, true)}>Vẫn tính</button></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>}
        {data.extra.length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">Đang vẫn tính dù không có hậu tố:
          {data.extra.map((p) => <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5">{p.name}{data.canEdit && <button type="button" className="cursor-pointer text-ink-3 hover:text-bad" aria-label={`Bỏ tính ${p.name}`} disabled={busy === p.id} onClick={() => void toggle(p, false)}>×</button>}</span>)}
        </p>}
      </div>}
    </section>
  );
}
