'use client';

// Nối Google Sheet chi phí MKT (anh Vũ 09/10/2026): file riêng tư không share thêm được, nên người giữ file dán Apps Script vào
// chính file đó. Chủ hệ thống bấm "Tạo mã nối" → web hiện đoạn script đã điền sẵn địa chỉ và mã (chỉ hiện một lần) để sao chép.
// Phía dưới là tình trạng lần nhận gần nhất: bao nhiêu dòng, cột nào đã nhận ra, tên người chưa khớp nhân viên POS.
import { useState } from 'react';
import { Copy, FileSpreadsheet, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sheetCostScript } from '@/lib/sheet-cost-script';
import type { SheetSource } from '@/lib/sheet-costs';
import { useApi } from './use-api';
import { ChartCard, dmy, money, toast, vi } from './ui-kit';

type Status = { hasKey: boolean; keyCreatedAt: string | null; sources: SheetSource[] };
const ROLE_LABEL: Record<string, string> = { day: 'Ngày', amount: 'Số tiền', marketer: 'Người', campaign: 'Chiến dịch', note: 'Ghi chú' };
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };

export function SheetCostLink({ owner, onChanged }: { owner: boolean; onChanged?: () => void }) {
  const { data, reload } = useApi<Status>('/api/marketing/sheet', { keep: true });
  const [script, setScript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function makeKey() {
    if (data?.hasKey && !window.confirm('Tạo mã mới thì script đang dán trong file sẽ ngừng gửi được cho tới khi dán lại bản mới. Tiếp tục?')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/marketing/sheet', { method: 'POST' });
      const j = await r.json() as { key?: string; error?: string };
      if (!r.ok || !j.key) throw new Error(j.error ?? 'Không tạo được mã.');
      setScript(sheetCostScript(`${window.location.origin}/api/marketing/sheet-webhook`, j.key));
      reload(); onChanged?.();
    } catch (e) { toast(e instanceof Error ? e.message : 'Không tạo được mã.', { kind: 'error' }); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!script) return;
    try { await navigator.clipboard.writeText(script); toast('Đã sao chép đoạn script.', { kind: 'ok' }); }
    catch { toast('Trình duyệt chặn sao chép: bôi đen ô bên dưới rồi Ctrl/Cmd + C.', { kind: 'error' }); }
  }

  const src = data?.sources ?? [];
  return (
    <ChartCard icon={FileSpreadsheet} title="Nối Google Sheet chi phí" subtitle="File vẫn riêng tư: script trong file tự gửi chi phí lên web mỗi giờ và khi sửa, gửi lại không bị cộng trùng"
      action={owner ? <Button size="sm" variant={data?.hasKey ? 'outline' : 'default'} disabled={busy} onClick={() => void makeKey()}><KeyRound size={14} />{data?.hasKey ? 'Tạo mã mới' : 'Tạo mã nối'}</Button> : undefined}>
      <div className="flex flex-col gap-3 text-[12.5px]">
        {script ? (
          <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <p className="font-semibold text-ink">Mã chỉ hiện lần này. Gửi đoạn dưới cho người giữ file, họ làm 3 bước:</p>
            <ol className="ml-4 list-decimal text-ink-2">
              <li>Mở file Google Sheet chi phí → menu <b>Tiện ích mở rộng → Apps Script</b>.</li>
              <li>Xóa hết chữ có sẵn, dán đoạn này vào, bấm <b>Lưu</b>.</li>
              <li>Chọn hàm <b>caiDat</b> ở thanh trên → <b>Chạy</b> → cấp quyền cho tài khoản đang giữ file. Xong, số tự lên web.</li>
            </ol>
            <div className="flex gap-2"><Button size="sm" onClick={() => void copy()}><Copy size={14} />Sao chép đoạn script</Button></div>
            <textarea readOnly value={script} aria-label="Đoạn Apps Script" className="h-40 w-full rounded-md border border-line bg-surface p-2 font-mono text-[11px] text-ink-2" onFocus={(e) => e.currentTarget.select()} />
          </div>
        ) : !data?.hasKey ? (
          <p className="text-ink-2">{owner ? 'Chưa nối. Bấm "Tạo mã nối" để lấy đoạn script dán vào file Google Sheet.' : 'Chưa nối. Chủ hệ thống tạo mã nối ở đây.'}</p>
        ) : !src.length ? (
          <p className="text-ink-2">Đã tạo mã {data.keyCreatedAt ? ago(data.keyCreatedAt) : ''}, web chưa nhận lần gửi nào. Kiểm tra người giữ file đã chạy hàm caiDat chưa.</p>
        ) : null}
        {src.map((s) => (
          <div key={s.fileId} className="flex flex-col gap-1.5 rounded-xl border border-line p-3">
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <b className="text-ink">{s.fileName || 'Google Sheet'}</b>
              <span className="text-ink-3">nhận {ago(s.receivedAt)}</span>
            </p>
            <p className="num text-ink-2"><b className="text-ink">{vi.format(s.rows)}</b> dòng · <b className="text-ink">{money(s.amount)}</b>{s.firstDay && s.lastDay ? ` · ${dmy(s.firstDay)} – ${dmy(s.lastDay)}` : ''}</p>
            {Object.entries(s.columns).filter(([, cols]) => Object.keys(cols).length).map(([tab, cols]) => (
              <p key={tab} className="text-ink-3">Tab “{tab}”: {Object.entries(cols).map(([k, h]) => `${ROLE_LABEL[k] ?? k} = “${h}”`).join(' · ')}</p>
            ))}
            {s.unmatched.length > 0 && (
              <p className="text-warn">Chưa khớp tên nhân viên POS (vẫn cộng vào tổng chi phí, chưa tính ROAS từng người): {s.unmatched.slice(0, 8).map((u) => `${u.name} ${money(u.amount)}`).join(', ')}{s.unmatched.length > 8 ? '…' : ''}</p>
            )}
            {s.problems.map((p) => <p key={p} className="text-ink-3">{p}</p>)}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
