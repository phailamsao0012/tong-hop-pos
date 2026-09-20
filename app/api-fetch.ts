// Bọc fetch cho các lời gọi /api/ trên trình duyệt:
// - thời gian chờ tối đa, tự thử lại một lần khi rớt mạng hoặc máy chủ bận (502/503/504) để trang không treo vô hạn;
// - GỘP các lời gọi báo cáo phát ra cùng lúc (trang Điều khiển bắn 8 API) thành một request POST /api/reports/batch:
//   trên mạng chậm (mỗi vòng đi–về ~1 giây từ Việt Nam tới workers.dev) đây là khác biệt lớn nhất.
const TIMEOUT_MS = 45000;
const RETRY_DELAY_MS = 1500;
const BATCH_WINDOW_MS = 25;
const BATCH_MAX = 12;
const batchable = (url: string) => /^\/api\/(reports\/(?!batch)|sync\/pos(\?|$)|employees(\?|$))/.test(url);

type Pending = { url: string; signal: AbortSignal | null; resolve: (r: Response) => void; reject: (e: unknown) => void };
let queue: Pending[] = [];
let timer = 0;

export function installApiFetch() {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __thpFetch?: boolean };
  if (w.__thpFetch) return;
  w.__thpFetch = true;
  const original = window.fetch.bind(window);

  /** Gọi mạng với thời gian chờ, tôn trọng signal của người gọi; thử lại một lần khi rớt mạng / máy chủ bận (chỉ với request đọc). */
  const send = async (input: RequestInfo | URL, init: RequestInit | undefined, outer: AbortSignal | null, retry: boolean): Promise<Response> => {
    const attempt = async () => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(new DOMException('Máy chủ phản hồi quá lâu, hãy thử lại.', 'TimeoutError')), TIMEOUT_MS);
      const onAbort = () => controller.abort(outer?.reason);
      if (outer?.aborted) onAbort(); else outer?.addEventListener('abort', onAbort, { once: true });
      try { return await original(input, { ...init, signal: controller.signal }); }
      finally { clearTimeout(t); outer?.removeEventListener('abort', onAbort); }
    };
    try {
      const res = await attempt();
      if (retry && [502, 503, 504].includes(res.status) && !outer?.aborted) { await new Promise((r) => setTimeout(r, 1800)); return attempt(); }
      return res;
    } catch (error) {
      if (outer?.aborted || !retry) throw error;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return attempt();
    }
  };

  const flush = async () => {
    timer = 0;
    const items = queue.filter((p) => { if (p.signal?.aborted) { p.reject(p.signal.reason ?? new DOMException('Đã hủy.', 'AbortError')); return false; } return true; });
    queue = [];
    if (!items.length) return;
    if (items.length === 1) {
      const p = items[0];
      send(p.url, { cache: 'no-store' }, p.signal, true).then(p.resolve, p.reject);
      return;
    }
    // Nhiều hơn 12 thì chia lô.
    for (let i = 0; i < items.length; i += BATCH_MAX) {
      const chunk = items.slice(i, i + BATCH_MAX);
      const anyAlive = () => chunk.some((p) => !p.signal?.aborted);
      try {
        if (!anyAlive()) continue;
        const res = await send('/api/reports/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls: chunk.map((p) => p.url) }), cache: 'no-store' }, null, true);
        if (!res.ok) throw new Error(`batch HTTP ${res.status}`);
        const data = await res.json() as { results: { url: string; status: number; body: string }[] };
        for (const p of chunk) {
          const r = data.results.find((x) => x.url === p.url);
          if (!r) { p.reject(new Error('Thiếu kết quả gộp.')); continue; }
          p.resolve(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'x-thp-batched': '1' } }));
        }
      } catch {
        // Gộp lỗi (máy chủ cũ, mạng): gọi riêng từng URL như trước.
        for (const p of chunk) send(p.url, { cache: 'no-store' }, p.signal, true).then(p.resolve, p.reject);
      }
    }
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('/api/')) return original(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const outer = init?.signal ?? null;
    if (method === 'GET' && batchable(url)) {
      return new Promise<Response>((resolve, reject) => {
        queue.push({ url, signal: outer, resolve, reject });
        if (!timer) timer = window.setTimeout(() => { void flush(); }, BATCH_WINDOW_MS);
      });
    }
    return send(input, init, outer, method === 'GET');
  };
}
