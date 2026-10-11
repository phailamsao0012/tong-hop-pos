'use client';

// Trang xem thử con vật chờ tải (?xem-thu=con-vat). Chỉ bản demo, chỉ chủ hệ thống: app/page.tsx chặn ở máy chủ (QA A7).
// Dùng đúng SkeletonKpis, KpiCard, ChartCard của web để thấy y như trang thật: chọn con, giả tải nhanh / thường / lâu / lỗi.
import { useEffect, useRef, useState } from 'react';
import { BarChart3, CircleDollarSign, Package, Percent, ShoppingCart, Truck } from 'lucide-react';
import { ChartCard, ErrorBox, KpiCard, PageHeader, SegmentedControl, SkeletonKpis } from '../ui-kit';
import { SCENES, SCENE_LABELS, setCritterOverride, type SceneId } from './pick';

type Run = 'idle' | 'loading' | 'done' | 'error';
const RUNS: { id: string; label: string; ms: number; fail?: boolean }[] = [
  { id: 'normal', label: 'Tải 3 giây', ms: 3000 },
  { id: 'quick', label: 'Tải nhanh 0,4 giây', ms: 400 },
  { id: 'long', label: 'Tải lâu 10 giây', ms: 10000 },
  { id: 'fail', label: 'Lỗi sau 3 giây', ms: 3000, fail: true },
];
const BARS = [42, 58, 51, 66, 49, 73, 61];

export function CritterPreview() {
  const [scene, setScene] = useState<SceneId>('ck');
  const [state, setState] = useState<Run>('idle');
  const [run, setRun] = useState(0);
  const timer = useRef(0);
  useEffect(() => { setCritterOverride(scene); return () => setCritterOverride(null); }, [scene]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const start = (r: (typeof RUNS)[number]) => {
    window.clearTimeout(timer.current);
    setRun((x) => x + 1);
    setState('loading');
    timer.current = window.setTimeout(() => setState(r.fail ? 'error' : 'done'), r.ms);
  };
  const loading = state === 'loading';
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <PageHeader eyebrow="Bản demo · chỉ chủ hệ thống" title="Xem thử con vật chờ tải" subtitle="Số liệu ảo. Chọn con rồi bấm một kiểu tải; ô số và thẻ biểu đồ bên dưới dùng đúng thành phần của web." />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<SceneId> ariaLabel="Chọn con" className="overflow-x-auto" value={scene} onChange={(s) => { setScene(s); setState('idle'); }}
          options={SCENES.map((s) => ({ value: s, label: SCENE_LABELS[s] }))} />
        <div className="flex flex-wrap gap-2">
          {RUNS.map((r) => <button key={r.id} type="button" className="btn" data-run={r.id} onClick={() => start(r)}>{r.label}</button>)}
        </div>
      </div>
      <div key={run} className="space-y-5" data-state={state}>
        {state === 'idle' ? <p className="text-[13px] text-ink-3">Bấm một kiểu tải để bắt đầu.</p> : loading ? <SkeletonKpis count={4} className="xl:grid-cols-4" /> : state === 'error'
          ? <ErrorBox error="mất kết nối (giả lập)" onRetry={() => start(RUNS[0])} />
          : (
            <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <KpiCard icon={CircleDollarSign} label="Doanh thu đơn chốt" value="1.248,6 tr" unit="₫" delta={8.4} />
              <KpiCard icon={ShoppingCart} tone="blue" label="Đơn chốt" value="3.482" delta={5.1} />
              <KpiCard icon={Percent} tone="purple" label="Tỷ lệ chốt" value="38,4%" delta={-1.2} />
              <KpiCard icon={Truck} tone="orange" label="Đơn chuyển đi" value="2.917" delta={2.7} />
            </div>
          )}
        {state !== 'idle' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard icon={BarChart3} title="Xu hướng 7 ngày" subtitle="Doanh thu (triệu ₫) · số ảo" loading={loading}>
              {state === 'error' ? <div className="h-44"><div className="notice error">Không tải được dữ liệu (giả lập)</div></div> : (
                <div className="flex h-44 items-end gap-2 pt-2">
                  {BARS.map((h, i) => <div key={i} className="chart-fade flex-1 rounded-t-[4px] bg-primary/80" style={{ height: `${h}%` }} />)}
                </div>
              )}
            </ChartCard>
            <ChartCard icon={Package} title="Sản phẩm bán chạy" subtitle="Top 5 · số ảo" loading={loading}>
              {state === 'error' ? <div className="h-44"><div className="notice error">Không tải được dữ liệu (giả lập)</div></div> : (
                <ul className="m-0 list-none space-y-2 p-0 text-[13px]">
                  {['Cám gà con', 'Cám heo thịt', 'Men vi sinh', 'Thuốc bổ bò', 'Cám vịt'].map((n, i) => <li key={n} className="flex justify-between border-b border-line pb-1.5"><span>{n}</span><b className="num">{(940 - i * 137).toLocaleString('vi-VN')}</b></li>)}
                </ul>
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </main>
  );
}
