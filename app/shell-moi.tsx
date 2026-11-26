'use client';
// Vỏ giao diện mới (cờ THP_UI_MOI, plan docs/plans/2026-11-26-tong-quan-kieu-moi): menu ngang dạng viên thuốc thay cho menu trái.
// Hàng 1: Tổng quan, từng bộ phận (Sale, CSKH, Marketing, Vận đơn…) và các nhóm còn lại; hàng 2: trang con của nhóm đang mở
// (trang con của bộ phận vẫn nằm ở thanh tab bộ phận trong trang như cũ). Điện thoại: cuộn ngang trong thanh menu.
// Chỉ dùng danh sách nhóm / quyền dashboard đã tính sẵn; cờ tắt thì không vẽ file này.
import type { LucideIcon } from 'lucide-react';

export type ShellItem = { id: string; label: string; icon: LucideIcon; deptKey?: string; match?: string[] };
export type ShellGroup = { title: string; icon: LucideIcon; items: ShellItem[] };
type Count = { value: number; hot?: boolean; title: string } | undefined;

export function ShellMoiNav({ home, groups, view, activeDept, onSelect, counts }: {
  /** Mục Tổng quan kiểu mới (null khi người xem không có quyền). */ home: ShellItem | null;
  groups: ShellGroup[]; view: string; activeDept: string | undefined;
  onSelect: (id: string, deptKey?: string) => void; counts: Partial<Record<string, Count>>;
}) {
  // Mỗi bộ phận thành một viên riêng; nhóm thường (Doanh thu, Báo cáo & AI…) là một viên, trang con ở hàng 2.
  const pills = groups.flatMap((g) => g.items.some((n) => n.deptKey)
    ? g.items.map((n) => ({ key: `d:${n.deptKey ?? n.id}`, label: n.label, icon: n.icon, first: n, sub: [] as ShellItem[], on: n.deptKey ? n.deptKey === activeDept : n.id === view }))
    : [{ key: `g:${g.title}`, label: g.items.length === 1 ? g.items[0].label : g.title, icon: g.icon, first: g.items[0], sub: g.items.length > 1 ? g.items : [],
      on: g.items.some((n) => n.id === view || !!n.match?.includes(view)) }]);
  const open = pills.find((p) => p.on);
  const count = (n: ShellItem) => counts[n.id];
  return (
    <div className="nav-moi" data-no-st>
      <nav className="nav-moi-row" aria-label="Menu chính">
        <span className="nav-moi-brand"><img src="/logo.svg" alt="" width={28} height={28} />MEGATECH</span>
        {home && (
          <button type="button" className={`nav-moi-pill ${view === home.id ? 'is-on' : ''}`} aria-current={view === home.id ? 'page' : undefined} onClick={() => onSelect(home.id)}>
            <home.icon size={15} aria-hidden="true" />{home.label}
          </button>
        )}
        {pills.map((p) => {
          const c = count(p.first);
          return (
            <button key={p.key} type="button" className={`nav-moi-pill ${p.on ? 'is-on' : ''}`} aria-current={p.on ? 'page' : undefined} onClick={() => onSelect(p.first.id, p.first.deptKey)}>
              <p.icon size={15} aria-hidden="true" />{p.label}
              {c && c.value > 0 && <span className={`nav-moi-cnt ${c.hot ? 'hot' : ''}`} title={c.title}>{c.value.toLocaleString('vi-VN')}</span>}
            </button>
          );
        })}
      </nav>
      {open && open.sub.length > 0 && (
        <nav className="nav-moi-row nav-moi-sub" aria-label={`Các trang của ${open.label}`}>
          {open.sub.map((n) => {
            const on = n.id === view || !!n.match?.includes(view);
            return (
              <button key={n.id} type="button" className={`nav-moi-pill sm ${on ? 'is-on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => onSelect(n.id, n.deptKey)}>
                {n.label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
