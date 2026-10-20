'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Plus } from 'lucide-react';
import { addDays, todayVn } from '@/lib/report-time';
import { useApi } from './use-api';
import { takeNavHint } from './nav-focus';
import { AiMarkdown, ForecastReview } from './forecast-card';

type Spend = { usd: number; cap: number; left: number; calls: number; allTime: number };
type Turn = { id: string; q: string; a: string; at: string; usd: number; tokens: number; failed?: boolean };
type History = { history: Turn[]; spend: Spend; used: number; cap: number };
type Asked = Omit<Turn, 'q' | 'a'> & { answer: string; used: number; cap: number; spend: Spend };
type Tab = 'chat' | 'day' | 'week';
const suggestions = ['Tuần này sale nào chốt kém nhất, vì sao?', 'So sánh tỷ lệ chốt các team Sale 4 tuần gần đây', 'CSKH nào tăng doanh thu tốt nhất tháng này?', 'Giờ nào số về nhiều mà chốt ít?'];
const START_KEY = 'ai-ask-thread-start';
/** Số lượt trước gửi kèm câu nối tiếp; máy chủ cũng chỉ nhận tối đa ngần này. */
const PRIOR = 3;

export function formatMonthlySpend(usd: number) {
  return usd > 0 && usd < 0.01 ? 'dưới 0,01 USD' : `${usd.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}
/** Tiền một câu: nhỏ nên ghi 3 số lẻ. */
export function formatAnswerCost(usd: number, tokens: number) {
  const money = usd > 0 && usd < 0.001 ? 'dưới 0,001 USD' : `${usd.toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} USD`;
  return `${money} · ${tokens.toLocaleString('vi-VN')} token`;
}
const clock = (at: string) => new Date(at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
function readStart() { try { return localStorage.getItem(START_KEY) ?? ''; } catch { return ''; } }
function saveStart(at: string) { try { localStorage.setItem(START_KEY, at); } catch { /* chế độ riêng tư: chỉ giữ trong phiên */ } }

function Budget({ spend, used, cap }: { spend?: Spend; used?: number; cap?: number }) {
  if (!spend) return <div className="rounded-xl bg-surface-2 p-3 text-xs text-ink-3">Đang tải tiền còn lại…</div>;
  const share = spend.cap ? Math.min(100, spend.usd / spend.cap * 100) : 0, low = spend.left < spend.cap * 0.2;
  return <div className="space-y-1.5 rounded-xl bg-surface-2 p-3" aria-label="Tiền Claude còn lại">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p className="text-sm"><span className="text-ink-3">Còn </span><b className={`num tabular-nums ${low ? 'text-bad' : ''}`}>{formatMonthlySpend(spend.left)}</b><span className="text-ink-3"> / {spend.cap} USD tháng {Number(todayVn().slice(5, 7))}</span></p>
      <p className="num text-xs tabular-nums text-ink-3">Hôm nay {used ?? 0}/{cap ?? 40} câu</p>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${share}%`, background: low ? 'var(--bad)' : 'var(--primary)' }} /></div>
    <p className="text-[11px] text-ink-3">Đã dùng tháng này {formatMonthlySpend(spend.usd)} · từ đầu {formatMonthlySpend(spend.allTime)}</p>
  </div>;
}
const Avatar = () => <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tint text-[11px] font-bold text-primary" aria-hidden="true">AI</span>;
function Bubbles({ turn, onRetry }: { turn: Turn & { error?: string; pending?: boolean }; onRetry: (q: string) => void }) {
  const failed = turn.failed || !!turn.error;
  return <>
    <li className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-ink">{turn.q}</p></li>
    <li className="flex items-end gap-2">
      <Avatar />
      <div className="min-w-0 max-w-[90%] space-y-1">
        {turn.pending
          ? <output className="flex w-fit gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-3 py-3" aria-label="Claude đang đọc số">{[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 rounded-full bg-ink-3 motion-safe:animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}</output>
          : <div className={`rounded-2xl rounded-bl-md border px-3 py-2 ${failed ? 'border-bad/40 bg-bad-bg' : 'border-line bg-surface'}`}>{failed ? <p className="text-sm" role="alert">{turn.error || turn.a} <button type="button" className="link" onClick={() => onRetry(turn.q)}>Hỏi lại</button></p> : <AiMarkdown text={turn.a} />}</div>}
        {!turn.pending && !failed && <p className="num text-[11px] tabular-nums text-ink-3">{formatAnswerCost(turn.usd, turn.tokens)} · {clock(turn.at)}</p>}
      </div>
    </li>
  </>;
}

export function AiAskView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const api = useApi<History>('/api/ai/ask');
  const [tab, setTab] = useState<Tab>(() => (takeNavHint('ai-tab') as Tab | undefined) ?? 'chat');
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [pending, setPending] = useState('');
  const [local, setLocal] = useState<(Turn & { error?: string })[]>([]);
  const [latest, setLatest] = useState<{ spend: Spend; used: number; cap: number } | null>(null);
  const [start, setStart] = useState(readStart), [showOld, setShowOld] = useState(false);
  const end = useRef<HTMLLIElement>(null), input = useRef<HTMLTextAreaElement>(null), moved = useRef(false), composedAt = useRef(0);
  // Safari gửi phím Enter kết thúc gõ dấu (Telex) sau compositionend với isComposing=false: bỏ qua Enter ngay sau đó.
  const today = todayVn(), lastMonday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) - 7);
  // Lịch sử về mới nhất trước; đảo lại cho khung chat, gộp với câu vừa hỏi trong phiên.
  const { thread, older } = useMemo(() => {
    const all = [...(api.data?.history ?? [])].reverse();
    const seen = new Set(all.map(t => t.id));
    // Câu lỗi sau khi đã giữ lượt thì máy chủ cũng lưu (failed): bỏ bản tạm trong phiên để không hiện hai lần.
    const failedQs = new Set(all.filter(t => t.failed).map(t => t.q));
    // Bản tạm cũ hơn câu cũ nhất máy chủ còn trả thì bỏ (đã rơi khỏi 20 câu gần nhất); xếp lại theo giờ.
    const oldest = all[0]?.at ?? '';
    const merged = [...all, ...local.filter(t => (t.id ? !seen.has(t.id) : !failedQs.has(t.q)) && t.at >= oldest)].sort((a, b) => a.at.localeCompare(b.at));
    return { thread: merged.filter(t => !start || t.at > start), older: merged.filter(t => start && t.at <= start) };
  }, [api.data, local, start]);
  const shown = showOld ? [...older, ...thread] : thread;
  // Chỉ cuộn khi vừa hỏi hoặc vừa có trả lời, không cuộn lúc mới mở trang.
  useEffect(() => {
    if (!moved.current) { moved.current = true; return; }
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [local.length, pending]);
  useEffect(() => {
    const el = input.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; }
  }, [question]);

  async function ask(text = question) {
    const q = text.trim();
    if (busy || !q) return;
    setBusy(true); setPending(q); setQuestion('');
    const prior = thread.filter(t => t.id && !t.failed).slice(-PRIOR).map(t => t.id);
    try {
      const res = await fetch('/api/ai/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, prior }) });
      const body = await res.json() as Partial<Asked> & { error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || 'Không thể hỏi AI');
      setLocal(l => [...l, { id: body.id!, q, a: body.answer ?? '', at: body.at ?? new Date().toISOString(), usd: body.usd ?? 0, tokens: body.tokens ?? 0 }]);
      if (body.spend) setLatest({ spend: body.spend, used: body.used ?? 0, cap: body.cap ?? 40 });
      api.reload();
    } catch (e) {
      setLocal(l => [...l, { id: '', q, a: '', at: new Date().toISOString(), usd: 0, tokens: 0, error: e instanceof Error ? e.message : 'Không thể hỏi AI' }]);
      setLatest(null); api.reload();
    } finally { setBusy(false); setPending(''); input.current?.focus(); }
  }
  function newThread() {
    // Mốc là giờ máy chủ của câu mới nhất, không lấy giờ điện thoại (lệch giờ thì câu mới bị giấu).
    const at = [...thread, ...older].reduce((max, t) => t.at > max ? t.at : max, '') || new Date().toISOString();
    saveStart(at); setStart(at); setLocal([]); setShowOld(false); input.current?.focus();
  }
  const spend = latest?.spend ?? api.data?.spend, used = latest?.used ?? api.data?.used, cap = latest?.cap ?? api.data?.cap;
  const tabs: [Tab, string][] = [['chat', 'Chat'], ['day', 'Hôm qua lệch'], ['week', 'Tuần trước']];

  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0"><h1 className="text-2xl font-semibold">Hỏi AI</h1><p className="text-xs text-ink-3">Code tính số · Claude giải thích · toàn công ty, mọi POS · MKT / CSKH / SALE</p></div>
      {tab === 'chat' && <button type="button" className="btn" onClick={newThread} disabled={busy}><Plus size={16} aria-hidden="true" />Cuộc trò chuyện mới</button>}
    </header>
    <div className="flex gap-1 rounded-full bg-surface-2 p-1" role="tablist" aria-label="Hỏi AI">
      {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={`flex-1 whitespace-nowrap rounded-full px-2 py-1.5 text-sm ${tab === id ? 'bg-surface font-semibold shadow-sm' : 'text-ink-3'}`} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {tab === 'day' && <ForecastReview onNavigate={onNavigate} />}
    {tab === 'week' && <ForecastReview week={lastMonday} title="Tuần trước dự báo lệch bao nhiêu" onNavigate={onNavigate} />}
    {tab === 'chat' && <section className="card mx-auto flex w-full min-w-0 max-w-3xl flex-col p-0">
      <div className="border-b border-line p-3"><Budget spend={spend} used={used} cap={cap} /></div>
      {api.error && <p role="alert" className="px-4 pt-3 text-sm">{api.error} <button className="link" onClick={api.reload}>Thử lại</button></p>}
      <ol className="min-h-[45vh] space-y-3 p-4" aria-live="polite">
        {older.length > 0 && !showOld && <li className="text-center"><button type="button" className="link text-xs" onClick={() => setShowOld(true)}>Xem {older.length} câu trước</button></li>}
        {!shown.length && !pending && <li className="flex flex-col items-center gap-2 py-8 text-center"><Avatar /><p className="font-medium">Hỏi gì về số cũng được</p><p className="max-w-sm text-sm text-ink-3">Sale nào giảm, vì sao, so với người khác ra sao. Câu sau hiểu theo câu trước, muốn hỏi chuyện khác thì bấm Cuộc trò chuyện mới.</p></li>}
        {shown.map((t, i) => <Bubbles key={t.id || `local-${i}`} turn={t} onRetry={q => void ask(q)} />)}
        {pending && <Bubbles turn={{ id: '', q: pending, a: '', at: '', usd: 0, tokens: 0, pending: true }} onRetry={() => undefined} />}
        <li ref={end} className="scroll-mb-[220px] md:scroll-mb-[160px]" aria-hidden="true" />
      </ol>
      <div className="sticky bottom-[calc(60px+env(safe-area-inset-bottom,0px))] space-y-2 rounded-b-[inherit] border-t border-line bg-surface p-3 md:bottom-0">
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">{suggestions.map(q => <button type="button" key={q} className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs" disabled={busy} onClick={() => { setQuestion(q); input.current?.focus(); }}>{q}</button>)}</div>
        <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); void ask(); }}>
          <label htmlFor="ai-question" className="sr-only">Câu hỏi</label>
          <textarea id="ai-question" ref={input} rows={1} maxLength={1000} placeholder="Hỏi về số liệu…" className="field max-h-36 min-h-10 flex-1 resize-none rounded-2xl py-2" value={question} onChange={e => setQuestion(e.target.value)}
            onCompositionEnd={() => { composedAt.current = performance.now(); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && performance.now() - composedAt.current > 100) { e.preventDefault(); void ask(); } }} />
          <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-ink disabled:opacity-40" disabled={busy || !question.trim()} aria-label="Gửi"><ArrowUp size={18} aria-hidden="true" /></button>
        </form>
        <p className="text-[11px] text-ink-3">Mỗi câu khoảng 0,06 USD · Enter để gửi, Shift+Enter xuống dòng{question.length > 800 ? ` · ${question.length}/1000 ký tự` : ''}</p>
      </div>
    </section>}
  </div>;
}
