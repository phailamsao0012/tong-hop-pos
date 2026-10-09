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

type Staff = { id: string; name: string; mkt: boolean };
type Status = { hasKey: boolean; keyCreatedAt: string | null; sources: SheetSource[]; staff?: Staff[] };
const ROLE_LABEL: Record<string, string> = { day: 'Ngày', amount: 'Số tiền', marketer: 'Người', campaign: 'Chiến dịch', note: 'Ghi chú' };
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };

export function SheetCostLink({ owner, onChanged }: { owner: boolean; onChanged?: () => void }) {
  const { data, reload, stale, at, error, loading } = useApi<Status>('/api/marketing/sheet', { keep: true });
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
              <li>Bấm dấu <b>+</b> cạnh <b>Tệp</b> → <b>Tập lệnh</b>, đặt tên (vd TongHopPOS), dán đoạn này vào tệp mới, bấm <b>Lưu</b>. Không xoá code có sẵn ở tệp khác.</li>
              <li>Chọn hàm <b>thpCaiDat</b> ở thanh trên → <b>Chạy</b> → cấp quyền cho tài khoản đang giữ file. Xong, số tự lên web.</li>
            </ol>
            <div className="flex gap-2"><Button size="sm" onClick={() => void copy()}><Copy size={14} />Sao chép đoạn script</Button></div>
            <textarea readOnly value={script} aria-label="Đoạn Apps Script" className="h-40 w-full rounded-md border border-line bg-surface p-2 font-mono text-[11px] text-ink-2" onFocus={(e) => e.currentTarget.select()} />
          </div>
        ) : !data?.hasKey ? (
          <p className="text-ink-2">{owner ? 'Chưa nối. Bấm "Tạo mã nối" để lấy đoạn script dán vào file Google Sheet.' : 'Chưa nối. Chủ hệ thống tạo mã nối ở đây.'}</p>
        ) : !src.length ? (
          <p className="text-ink-2">Đã tạo mã {data.keyCreatedAt ? ago(data.keyCreatedAt) : ''}, web chưa nhận lần gửi nào. Kiểm tra người giữ file đã chạy hàm thpCaiDat chưa.</p>
        ) : null}
        {/* Số lưu trong trình duyệt hiện trước; lấy số mới lỗi thì nói rõ để không tưởng lần gửi mới chưa tới. */}
        {stale && at && (error ? (
          <p className="flex flex-wrap items-center gap-2 text-bad">Không tải được tình trạng mới ({error}), đang hiện bản lúc {new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.
            <Button size="sm" variant="outline" onClick={() => reload()}>Tải lại</Button></p>
        ) : loading ? <p className="text-ink-3">Đang cập nhật tình trạng mới…</p> : null)}
        {src.map((s) => (
          <div key={s.fileId} className="flex flex-col gap-1.5 rounded-xl border border-line p-3">
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <b className="text-ink">{s.fileName || 'Google Sheet'}</b>
              <span className="text-ink-3">nhận {ago(s.receivedAt)}</span>
            </p>
            <p className="num text-ink-2"><b className="text-ink">{vi.format(s.rows)}</b> dòng · <b className="text-ink">{money(s.amount)}</b>{s.firstDay && s.lastDay ? ` · ${dmy(s.firstDay)} – ${dmy(s.lastDay)}` : ''}</p>
            {/* Web tự đọc cấu trúc từng tab (dọc / ngang, hàng tiêu đề, cột nào là gì); mở từng tab để xem vài dòng đầu đã nhận. */}
            {s.layouts.map((l) => (
              <details key={l.tab} className="rounded-lg border border-line/70 px-2.5 py-1.5">
                <summary className="cursor-pointer text-ink-2">
                  <b className="text-ink">{l.tab}</b> · {l.layout === 'bo-qua' ? <span className="text-ink-3">bỏ qua ({l.reason})</span>
                    : <>{l.layout === 'ngang' ? 'mỗi cột một ngày' : 'mỗi dòng một khoản'} · <span className="num">{vi.format(l.rows)}</span> khoản · <span className="num">{money(l.amount)}</span>
                      <span className="text-ink-3"> · {Object.entries(l.columns).filter(([, h]) => h).map(([k, h]) => `${ROLE_LABEL[k] ?? k} = “${h}”`).join(' · ')}</span></>}
                </summary>
                <div className="mt-2 max-h-64 overflow-auto">
                  <table className="text-[11px]"><tbody>{l.sample.map((r, i) => (
                    <tr key={i} className={i === l.headerRow ? 'font-semibold text-ink' : 'text-ink-2'}>
                      <td className="pr-2 text-right text-ink-4">{i + 1}</td>{r.map((c, j) => <td key={j} className="max-w-40 truncate border border-line/50 px-1.5 py-0.5">{c}</td>)}
                    </tr>
                  ))}</tbody></table>
                </div>
              </details>
            ))}
            {s.unmatched.length > 0 && (owner && data?.staff?.length ? (
              <div className="flex flex-col gap-1.5 rounded-lg border border-warn/40 bg-warn/5 p-2.5">
                <p className="text-warn">Tên chưa khớp nhân viên POS (vẫn cộng vào tổng chi phí, chưa tính ROAS từng người). Chọn đúng người rồi bấm Lưu, chi phí cũ chuyển theo luôn:</p>
                {s.unmatched.map((u) => <AliasRow key={u.name} name={u.name} amount={u.amount} guess={u.guess ?? null} staff={data.staff!} onSaved={() => { reload(); onChanged?.(); }} />)}
              </div>
            ) : (
              <p className="text-warn">Chưa khớp tên nhân viên POS (vẫn cộng vào tổng chi phí, chưa tính ROAS từng người): {s.unmatched.slice(0, 8).map((u) => `${u.name} ${money(u.amount)}`).join(', ')}{s.unmatched.length > 8 ? '…' : ''}</p>
            ))}
            {s.problems.map((p) => <p key={p} className="text-ink-3">{p}</p>)}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/** Một tên trên sheet chưa khớp: chọn nhân viên POS (chọn sẵn người web đoán), Lưu thì web nhớ cho các lần gửi sau. */
function AliasRow({ name, amount, guess, staff, onSaved }: { name: string; amount: number; guess: string | null; staff: Staff[]; onSaved: () => void }) {
  const [pick, setPick] = useState(guess ?? '');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await fetch('/api/marketing/sheet', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, userId: pick }) });
      const j = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? 'Không lưu được.');
      toast(`Đã ghép "${name}".`, { kind: 'ok' }); onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : 'Không lưu được.', { kind: 'error' }); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <b className="min-w-28 text-ink">{name}</b>
      <span className="num w-28 text-ink-2">{money(amount)}</span>
      <select aria-label={`Nhân viên cho ${name}`} value={pick} onChange={(e) => setPick(e.target.value)}
        className="h-8 min-w-0 max-w-64 flex-1 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink">
        <option value="">Chọn nhân viên…</option>
        <option value="__mkt_da_nghi">MKT đã nghỉ, không có trên POS</option>
        <optgroup label="Nhân viên MKT">{staff.filter((p) => p.mkt).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        <optgroup label="Người khác">{staff.filter((p) => !p.mkt).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
      </select>
      <Button size="sm" disabled={!pick || busy} onClick={() => void save()}>Lưu</Button>
    </div>
  );
}
