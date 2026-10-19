'use client';

import { useState } from 'react';
import { addDays, todayVn } from '@/lib/report-time';
import { useApi } from './use-api';
import { AiMarkdown, ForecastReview } from './forecast-card';

type History = { history: { q: string; a: string; at: string }[]; spend: { usd: number; cap: number; calls: number }; used: number; cap: number };
const suggestions = ['Tuần này sale nào chốt kém nhất, vì sao?', 'So sánh tỷ lệ chốt các team Sale 4 tuần gần đây', 'CSKH nào tăng doanh thu tốt nhất tháng này?', 'Giờ nào số về nhiều mà chốt ít?'];
export function AiAskView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const api = useApi<History>('/api/ai/ask');
  const [question, setQuestion] = useState(''), [answer, setAnswer] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<{ used: number; cap: number } | null>(null);
  const today = todayVn(), lastMonday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) - 7);
  async function ask() {
    if (busy || !question.trim()) return;
    setBusy(true); setError(''); setAnswer('');
    try {
      const res = await fetch('/api/ai/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question.trim() }) });
      const body = await res.json() as { error?: string; answer: string; used: number; cap: number };
      if (!res.ok) throw new Error(body.error || 'Không thể hỏi AI');
      setAnswer(body.answer); setLatest({ used: body.used, cap: body.cap }); api.reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể hỏi AI'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-semibold">Hỏi AI</h1><p className="text-sm text-ink-3">Code tính số · Claude giải thích · toàn công ty, mọi POS · MKT / CSKH / SALE</p><nav className="mt-2 flex gap-4 text-sm"><a className="link" href="#ai-yesterday">Hôm qua</a><a className="link" href="#ai-last-week">Tuần trước</a></nav></header>
    <section className="card space-y-3 p-4">
      <form onSubmit={e => { e.preventDefault(); void ask(); }} className="space-y-2">
        <label htmlFor="ai-question" className="block text-sm font-medium">Câu hỏi</label>
        <textarea id="ai-question" className="field min-h-28 w-full" maxLength={1000} value={question} onChange={e => setQuestion(e.target.value)} disabled={busy} />
        <div className="flex items-center justify-between"><span className="text-xs text-ink-3">{question.length}/1000 ký tự</span><button className="btn" disabled={busy || !question.trim()} type="submit">Hỏi</button></div>
      </form>
      <div className="grid gap-2 sm:grid-cols-2">{suggestions.map(q => <button type="button" key={q} className="btn h-auto whitespace-normal text-left" disabled={busy} onClick={() => setQuestion(q)}>{q}</button>)}</div>
      {busy && <output>Claude đang đọc số…</output>}{error && <p role="alert">{error}</p>}
      {answer && <div aria-live="polite"><AiMarkdown text={answer} /></div>}
    </section>
    <div className="card p-3 text-sm">{api.data ? <>Chi phí tháng này: ~{api.data.spend.usd.toLocaleString('vi-VN', { maximumFractionDigits: 6 })} USD / trần {api.data.spend.cap} USD · hôm nay đã hỏi {latest?.used ?? api.data.used}/{latest?.cap ?? api.data.cap}</> : 'Đang tải chi phí và lượt hỏi…'}{api.error && <p role="alert">{api.error} <button className="link" onClick={api.reload}>Thử lại</button></p>}</div>
    <details className="card p-4"><summary className="cursor-pointer font-medium">20 câu gần nhất</summary><div className="mt-3 space-y-4">{api.data?.history.map((h, i) => <article key={`${h.at}-${i}`} className="space-y-2 border-b border-line pb-3"><p className="font-medium break-words">{h.q}</p><time className="text-xs text-ink-3">{new Date(h.at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</time><AiMarkdown text={h.a} /></article>)}{!api.data?.history.length && <p>Chưa có lịch sử hỏi đáp.</p>}</div></details>
    <ForecastReview onNavigate={onNavigate} />
    <ForecastReview week={lastMonday} title="Tuần trước" onNavigate={onNavigate} />
  </div>;
}
