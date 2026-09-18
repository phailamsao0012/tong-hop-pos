'use client';

// Khảo sát danh mục dữ liệu Pancake (chỉ quản trị viên): endpoint nào lấy được, bao nhiêu bản ghi, có trường gì, web đã kéo về chưa.
import { Fragment, useState } from 'react';
import { Database, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { ChartCard, StatusChip, dt, vi, type Tone } from './ui-kit';

type Result = { key: string; label: string; group: string; path: string; have: 'yes' | 'part' | 'no'; note?: string; status: 'available' | 'empty' | 'forbidden' | 'missing' | 'error'; httpStatus: number | null; count: number | null; fields: string[]; message: string | null; ms: number };
type Catalog = { posId: string; shopId: string; checkedAt: string; sampleOrderId: string | null; results: Result[] };
const STATUS: Record<Result['status'], { label: string; tone: Tone }> = {
  available: { label: 'Lấy được', tone: 'green' }, empty: { label: 'Có endpoint, chưa có dữ liệu', tone: 'teal' }, forbidden: { label: 'Khóa không có quyền', tone: 'orange' }, missing: { label: 'Không có endpoint', tone: 'gray' }, error: { label: 'Lỗi', tone: 'red' },
};
const HAVE: Record<Result['have'], { label: string; tone: Tone }> = { yes: { label: 'Đã kéo về', tone: 'green' }, part: { label: 'Một phần', tone: 'blue' }, no: { label: 'Chưa', tone: 'gray' } };

export function CatalogPanel() {
  const [posId, setPosId] = useState<string>(POS[0].id);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/connection/catalog?posId=${encodeURIComponent(posId)}`, { cache: 'no-store' });
      const body = await r.json() as Catalog & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không khảo sát được.');
      setCatalog(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không khảo sát được.'); }
    finally { setLoading(false); }
  };
  const [phone, setPhone] = useState('');
  const [lookup, setLookup] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const runLookup = async () => {
    setLooking(true); setLookup(null);
    try {
      const r = await fetch(`/api/connection/catalog?posId=${encodeURIComponent(posId)}&phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      const body = await r.json() as { error?: string; lookup?: Record<string, { customers?: Record<string, unknown>[] }> };
      if (!r.ok) throw new Error(body.error ?? 'Không tra được.');
      const found = Object.values(body.lookup ?? {}).flatMap((v) => v?.customers ?? []);
      if (!found.length) { setLookup(JSON.stringify(body.lookup, null, 2)); return; }
      // Hiện gọn: các trường liên quan phân công trước, rồi toàn bộ JSON.
      const c = found[0];
      const head = Object.entries(c).filter(([k]) => /assign|creator|user|staff|pages_customers|tags|level/i.test(k)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
      setLookup(`${head}\n\n---- JSON đầy đủ ----\n${JSON.stringify(c, null, 2)}`);
    } catch (e) { setLookup(e instanceof Error ? e.message : 'Không tra được.'); }
    finally { setLooking(false); }
  };
  const groups = catalog ? [...new Set(catalog.results.map((r) => r.group))] : [];
  const available = catalog?.results.filter((r) => r.status === 'available') ?? [];
  const newAvailable = available.filter((r) => r.have !== 'yes');
  return (
    <ChartCard icon={Database} title="Danh mục dữ liệu Pancake có thể kéo về" subtitle="Gọi thử từng endpoint bằng khóa API hiện tại (1 bản ghi mỗi cái), không ghi gì vào web"
      action={<div className="flex items-center gap-2">
        <Select value={posId} items={Object.fromEntries(POS.map((p) => [p.id, p.name]))} onValueChange={(v) => setPosId(String(v))}><SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger><SelectContent>{POS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
        <Button size="sm" onClick={() => void run()} disabled={loading}><Search size={14} />{loading ? 'Đang gọi Pancake…' : 'Khảo sát'}</Button>
      </div>}>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2">
        <span className="text-xs font-semibold text-[#62796d]">Tra JSON gốc một khách</span>
        <Input className="w-44" placeholder="SĐT khách" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!phone.trim() || looking} onClick={() => void runLookup()}>{looking ? 'Đang tra…' : 'Tra trên Pancake'}</Button>
        <span className="text-xs text-[#7d9184]">Dùng để đối chiếu trường phân công giữa Pancake và web.</span>
      </div>
      {lookup && <pre className="mb-3 max-h-96 overflow-auto rounded-xl bg-[#f6f8f6] p-3 text-[11px] leading-snug whitespace-pre-wrap break-all">{lookup}</pre>}
      {error && <p className="text-sm text-[#c8403f]">{error}</p>}
      {!catalog && !error && <p className="text-sm text-[#7d9184]">Chọn POS rồi bấm Khảo sát. Mất khoảng 10–20 giây.</p>}
      {catalog && (
        <div className="space-y-3">
          <p className="text-sm text-[#4c5f55]">Kiểm tra lúc {dt(catalog.checkedAt.slice(0, 19), true)} · shop {catalog.shopId} · <strong>{available.length}</strong> nhóm lấy được, trong đó <strong>{newAvailable.length}</strong> nhóm web chưa kéo về{newAvailable.length ? `: ${newAvailable.map((r) => r.label).join(', ')}` : ''}.</p>
          <div className="overflow-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">Dữ liệu</th><th>Kết quả</th><th className="text-right">Bản ghi</th><th>Web đã kéo</th><th>Trường dữ liệu mẫu</th><th>Ghi chú</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g}>
                    <tr className="border-t bg-[#f8faf8]"><td colSpan={6} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-[#62796d]">{g}</td></tr>
                    {catalog.results.filter((r) => r.group === g).map((r) => (
                      <tr key={r.key} className="border-t align-top">
                        <td className="whitespace-nowrap py-2"><div className="font-medium">{r.label}</div><div className="font-mono text-[10px] text-[#7d9184]">{r.path}</div></td>
                        <td className="whitespace-nowrap py-2"><StatusChip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusChip>{r.httpStatus ? <span className="ml-1 text-[10px] text-[#7d9184]">HTTP {r.httpStatus} · {r.ms} ms</span> : null}</td>
                        <td className="whitespace-nowrap py-2 text-right">{r.count === null ? '—' : vi.format(r.count)}</td>
                        <td className="whitespace-nowrap py-2"><StatusChip tone={HAVE[r.have].tone}>{HAVE[r.have].label}</StatusChip></td>
                        <td className="py-2 text-xs text-[#4c5f55]"><span className="line-clamp-2" title={r.fields.join(', ')}>{r.fields.join(', ') || '—'}</span></td>
                        <td className="py-2 text-xs text-[#7d9184]">{r.message ?? r.note ?? ''}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
