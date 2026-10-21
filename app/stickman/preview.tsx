'use client';

// Trang xem thử người que (?xem-thu=nguoi-que). Chỉ bản demo, chỉ chủ hệ thống (app/page.tsx chặn ở máy chủ).
// Dùng đúng SkeletonKpis và KpiCard của web: bấm tên trò để xem riêng trò đó; "Số về" thay ô xương bằng ô thật để xem trò đưa số.
import { useEffect, useRef, useState } from 'react';
import { BarChart3, CircleDollarSign, Percent, ShoppingCart, Sparkles, Users } from 'lucide-react';
import { KpiCard, PageHeader, SkeletonKpis } from '../ui-kit';
import { loadStickman } from './slot';

type List = { id: string; name: string }[];
const CARDS = [
  { icon: CircleDollarSign, label: 'Doanh thu', value: '1,75 tỷ', d: 24.4 },
  { icon: ShoppingCart, label: 'AOV', value: '1,5 tr', d: 0.4 },
  { icon: BarChart3, label: 'Đơn chốt', value: '1.185', d: 23.8 },
  { icon: Percent, label: 'Tỷ lệ chốt', value: '69,7%', d: -1.1 },
  { icon: Sparkles, label: 'Tự upsell', value: '932 đơn', d: 12.2 },
  { icon: Users, label: 'Từ MKT', value: '253 đơn', d: 5.6 },
];

export function StickPreview() {
  const [lists, setLists] = useState<{ idle: List; reveal: List } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [run, setRun] = useState(0);
  const [on, setOn] = useState('');
  const [playing, setPlaying] = useState('');
  const timer = useRef(0);
  useEffect(() => {
    loadStickman().then((m) => { m.watchAct(setPlaying); setLists({ idle: m.IDLE.map(({ id, name }) => ({ id, name })), reveal: m.REVEAL.map(({ id, name }) => ({ id, name })) }); }, () => undefined);
    return () => { window.clearTimeout(timer.current); void loadStickman().then((m) => m.watchAct(null), () => undefined); };
  }, []);
  const reload = () => { window.clearTimeout(timer.current); setLoaded(false); setRun((x) => x + 1); };
  const idle = async (id: string) => {
    setOn(id);
    const m = await loadStickman();
    m.force({ idle: id });
    if (loaded) reload();
  };
  const reveal = async (id: string) => {
    setOn(id);
    const m = await loadStickman();
    m.force({ reveal: id });
    window.clearTimeout(timer.current);
    if (loaded) { reload(); timer.current = window.setTimeout(() => setLoaded(true), 1600); } else setLoaded(true);
  };
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <PageHeader eyebrow="Bản demo · chỉ chủ hệ thống" title="Xem thử người que chờ tải" subtitle={`Ô đang tải: người que chơi ngẫu nhiên ${lists ? lists.idle.length : '…'} trò; số về: một trong ${lists ? lists.reveal.length : '…'} trò đưa số. Số liệu ảo.`} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn primary" onClick={reload}>Đang tải (chơi ngẫu nhiên)</button>
        <button type="button" className="btn" onClick={() => setLoaded(true)} disabled={loaded}>Số về</button>
        {playing && <span className="self-center text-[12.5px] text-ink-2" data-playing="">Đang chơi: <b>{playing}</b></span>}
      </div>
      {loaded ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-6">
          {CARDS.map((c) => <KpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} delta={c.d} />)}
        </div>
      ) : <SkeletonKpis key={run} count={6} className="xl:grid-cols-6" />}
      {lists && (
        <>
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold text-ink-2">Đưa số khi số về ({lists.reveal.length})</h2>
            <div className="flex flex-wrap gap-1.5">{lists.reveal.map((x) => <button key={x.id} type="button" className={`btn ${on === x.id ? 'primary' : ''}`} onClick={() => void reveal(x.id)}>{x.name}</button>)}</div>
          </section>
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold text-ink-2">Lúc chờ ({lists.idle.length})</h2>
            <div className="flex flex-wrap gap-1.5">{lists.idle.map((x) => <button key={x.id} type="button" className={`btn ${on === x.id ? 'primary' : ''}`} onClick={() => void idle(x.id)}>{x.name}</button>)}</div>
          </section>
        </>
      )}
      <p className="text-[12px] text-ink-3">Người que tắt theo Cấu hình › Con vật chờ tải = Tắt, và khi máy bật giảm chuyển động.</p>
    </main>
  );
}
