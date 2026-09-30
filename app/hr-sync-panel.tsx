'use client';

import { useCallback, useEffect, useState } from 'react';
import { Network, RotateCw } from 'lucide-react';
import { ChartCard, ErrorBox, toast } from './ui-kit';

type Row = { team: 'sale' | 'cskh'; pancakePeople: number; hrPeople: number; pancakeRevenue: number; hrRevenue: number };
type Data = {
  month: string; source: 'pancake' | 'hr'; matched: boolean; rows: Row[];
  state: { pulledAt: string | null; changedAt: string | null; employees: number; linked: number; error: string | null };
  mismatches: { id: string; name: string; pancake: string | null; hr: string; department: string | null; revenue: number }[];
  linked: number; unlinkedCount: number; unlinked: { id: string; name: string; pancake: string | null; revenue: number }[];
};
const TEAM: Record<string, string> = { sale: 'Sale', cskh: 'CSKH', mkt: 'Marketing', other: 'Khác' };
const money = (v: number) => `${Math.round(v / 1e6).toLocaleString('vi-VN')} tr`;
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'chưa có';

// Liên kết web nhân sự: đối chiếu team trước khi cho báo cáo lấy team, Leader, Trưởng phòng từ web nhân sự ("chuyển dần").
export function HrSyncPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const call = useCallback(async (method: 'GET' | 'POST' | 'PUT', body?: unknown) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/hr-sync', { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json() as Data & { error?: string };
      if (!r.ok) throw new Error(j.error ?? 'Không tải được liên kết web nhân sự.');
      setData(j);
      return j;
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được liên kết web nhân sự.'); return null; }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void call('GET'); }, [call]);

  const toggle = async () => {
    if (!data) return;
    const next = data.source === 'hr' ? 'pancake' : 'hr';
    if (next === 'hr' && !data.matched && !window.confirm(`${data.mismatches.length} người có team khác với Pancake, số báo cáo theo team sẽ đổi. Vẫn bật?`)) return;
    const j = await call('PUT', { source: next });
    if (j) toast(next === 'hr' ? 'Báo cáo đã lấy team từ web nhân sự.' : 'Báo cáo quay lại lấy team từ Pancake.');
  };

  return <ChartCard icon={Network} title="Liên kết web nhân sự" subtitle="Web chính kéo hồ sơ, team, Leader, Trưởng phòng từ web nhân sự mỗi 5 phút. Vai trò đăng nhập vẫn chỉnh ở Tài khoản."
    action={<div className="flex flex-wrap gap-2">
      <button type="button" className="btn" disabled={busy} onClick={() => void call('POST').then((j) => j && toast('Đã kéo lại dữ liệu nhân sự.'))}><RotateCw size={14} /> Kéo lại</button>
      {data && <button type="button" className={`btn ${data.source === 'hr' ? '' : 'primary'}`} disabled={busy || !data.state.pulledAt} onClick={() => void toggle()}>
        {data.source === 'hr' ? 'Quay lại team Pancake' : 'Dùng team từ web nhân sự'}</button>}
    </div>}>
    {error && <ErrorBox error={error} onRetry={() => void call('GET')} className="mb-3" />}
    {data && <div className="space-y-3">
      <div className={`notice ${data.state.error ? 'error' : data.source === 'hr' ? 'ok' : 'info'}`}>
        <span>
          {data.source === 'hr' ? 'Báo cáo đang lấy team từ web nhân sự.' : 'Báo cáo đang lấy team từ bộ phận Pancake (như cũ).'}
          {' '}Lần kéo gần nhất {when(data.state.pulledAt)}, {data.state.employees} hồ sơ, {data.state.linked} tài khoản POS đã gắn.
          {data.state.error ? ` Lỗi: ${data.state.error}` : ''}
        </span>
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Team</th><th className="num">Người (Pancake)</th><th className="num">Người (nhân sự)</th><th className="num">Doanh thu tháng (Pancake)</th><th className="num">Doanh thu tháng (nhân sự)</th></tr></thead>
        <tbody>{data.rows.map((r) => <tr key={r.team}>
          <td>{TEAM[r.team]}</td><td className="num">{r.pancakePeople}</td><td className="num">{r.hrPeople}</td>
          <td className="num">{money(r.pancakeRevenue)}</td><td className={`num ${r.hrRevenue !== r.pancakeRevenue ? 'text-bad font-semibold' : ''}`}>{money(r.hrRevenue)}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="text-sm">{data.matched
        ? 'Khớp: không ai đổi team, số báo cáo theo team giữ nguyên khi bật.'
        : `${data.mismatches.length} người có team khác Pancake. Sửa trên web nhân sự (hoặc chấp nhận nếu web nhân sự đúng) rồi kéo lại.`}</p>
      {!!data.mismatches.length && <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Người</th><th>Pancake</th><th>Web nhân sự</th><th className="num">Doanh thu tháng</th></tr></thead>
        <tbody>{data.mismatches.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.pancake ? TEAM[m.pancake] : 'Không thuộc Sale/CSKH'}</td><td>{TEAM[m.hr]}{m.department ? ` · ${m.department}` : ''}</td><td className="num">{money(m.revenue)}</td></tr>)}</tbody>
      </table></div>}
      {data.unlinkedCount > 0 && <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">{data.unlinkedCount} tài khoản POS chưa gắn hồ sơ nhân sự (vẫn theo Pancake)</summary>
        <ul className="mt-2 space-y-1">{data.unlinked.map((u) => <li key={u.id} className="flex justify-between gap-3"><span>{u.name}{u.pancake ? ` · ${TEAM[u.pancake]}` : ''}</span><span className="num text-ink-3">{money(u.revenue)}</span></li>)}</ul>
      </details>}
    </div>}
  </ChartCard>;
}
