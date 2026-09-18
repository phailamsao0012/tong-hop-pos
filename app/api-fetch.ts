// Bọc fetch cho các lời gọi /api/ trên trình duyệt: có thời gian chờ tối đa và tự thử lại một lần
// khi rớt mạng, để trang không treo vô hạn và người dùng thấy thông báo rõ ràng thay vì màn hình trắng.
const TIMEOUT_MS = 45000;
const RETRY_DELAY_MS = 1500;

export function installApiFetch() {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __thpFetch?: boolean };
  if (w.__thpFetch) return;
  w.__thpFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('/api/')) return original(input, init);
    const outer = init?.signal ?? null;
    const attempt = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new DOMException('Máy chủ phản hồi quá lâu, hãy thử lại.', 'TimeoutError')), TIMEOUT_MS);
      const onAbort = () => controller.abort(outer?.reason);
      if (outer?.aborted) onAbort(); else outer?.addEventListener('abort', onAbort, { once: true });
      try { return await original(input, { ...init, signal: controller.signal }); }
      finally { clearTimeout(timer); outer?.removeEventListener('abort', onAbort); }
    };
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    try { return await attempt(); }
    catch (error) {
      // Người dùng đổi trang/bộ lọc (hủy chủ động) hoặc request có ghi: không thử lại.
      if (outer?.aborted || method !== 'GET') throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return attempt();
    }
  };
}
