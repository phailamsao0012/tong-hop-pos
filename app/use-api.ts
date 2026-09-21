'use client';

// Số liệu "lần cuối" trong trình duyệt: mỗi lần API báo cáo trả về, kết quả được lưu (IndexedDB, theo tài khoản).
// Lần mở web sau, trang hiện ngay số đã lưu kèm nhãn "số lúc HH:MM · đang cập nhật", rồi thay bằng số mới khi máy chủ trả về.
// Dùng IndexedDB (không phải localStorage) vì một báo cáo tổng quan tháng nặng ~800 KB; localStorage chỉ có ~5 MB.
// Dùng: const { data, stale, at, loading, error, reload } = useApi<Report>(url, { refreshMs: 5 * 60000 });
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const DB_NAME = 'thp-reports';
const STORE = 'api';
const MAX_ENTRY_BYTES = 6_000_000;
const MAX_AGE_MS = 7 * 24 * 3600000;
const MAX_ENTRIES = 150;
let scope = 'anon';
let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Gọi một lần ở Dashboard: số lưu theo tài khoản, tài khoản khác không thấy số của nhau trên cùng máy. */
export function setSnapshotScope(userId: string) { scope = userId || 'anon'; }
const keyOf = (url: string) => `${scope}:${url}`;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE).createIndex('at', 'at'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}
function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve) => {
    if (!db) { resolve(undefined); return; }
    try {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export type Snapshot<T> = { data: T; at: string };
type Row = { key: string; at: number; data: unknown; scope: string };

export async function readSnapshot<T>(url: string): Promise<Snapshot<T> | null> {
  const row = await tx<Row | undefined>('readonly', (s) => s.get(keyOf(url)) as IDBRequest<Row | undefined>);
  if (!row || typeof row.at !== 'number') return null;
  if (Date.now() - row.at > MAX_AGE_MS) { void tx('readwrite', (s) => { s.delete(keyOf(url)); }); return null; }
  return { data: row.data as T, at: new Date(row.at).toISOString() };
}
let writesSinceTrim = 0;
export async function writeSnapshot<T>(url: string, data: T) {
  try {
    // Ước lượng cỡ để không lưu kết quả quá lớn (danh sách "xem toàn bộ" hàng nghìn dòng).
    const size = JSON.stringify(data).length;
    if (size > MAX_ENTRY_BYTES) return;
    await tx('readwrite', (s) => { s.put({ key: keyOf(url), at: Date.now(), data, scope } satisfies Row, keyOf(url)); });
    if (++writesSinceTrim >= 20) { writesSinceTrim = 0; void trim(); }
  } catch { /* hết chỗ hoặc bị chặn: bỏ qua, web vẫn chạy bình thường */ }
}
/** Bỏ các bản cũ nhất khi vượt số lượng, và bản quá 7 ngày. */
async function trim() {
  const db = await openDb(); if (!db) return;
  try {
    const t = db.transaction(STORE, 'readwrite'); const s = t.objectStore(STORE);
    const keysReq = s.index('at').getAllKeys();
    keysReq.onsuccess = () => {
      const keys = keysReq.result; // theo at tăng dần (cũ nhất trước)
      const extra = Math.max(0, keys.length - MAX_ENTRIES);
      for (let i = 0; i < extra; i++) s.delete(keys[i]);
      const cutoff = Date.now() - MAX_AGE_MS;
      const old = s.index('at').openKeyCursor(IDBKeyRange.upperBound(cutoff));
      old.onsuccess = () => { const c = old.result; if (c) { s.delete(c.primaryKey); c.continue(); } };
    };
  } catch { /* bỏ qua */ }
}
/** Xóa toàn bộ số đã lưu (đăng xuất). */
export async function clearSnapshots() {
  await tx('readwrite', (s) => { s.clear(); });
}

// Trạng thái làm mới toàn trang: số API báo cáo đang tải + lần gần nhất có số mới.
// Dashboard dùng để hiện vạch chạy dưới thanh trên cùng, ô "Đang làm mới…", và làm mờ thẻ số đang chờ số mới.
type RefreshStatus = { busy: boolean; freshAt: string | null };
const inflight = new Set<string>();
let refreshStatus: RefreshStatus = { busy: false, freshAt: null };
const listeners = new Set<() => void>();
function setRefresh(patch: Partial<RefreshStatus>) {
  refreshStatus = { ...refreshStatus, ...patch };
  for (const fn of listeners) fn();
}
function beginRefresh(key: string) { inflight.add(key); if (!refreshStatus.busy) setRefresh({ busy: true }); }
function endRefresh(key: string, freshAt?: string) {
  inflight.delete(key);
  setRefresh({ busy: inflight.size > 0, ...(freshAt ? { freshAt } : {}) });
}
const subscribeRefresh = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const SERVER_STATUS: RefreshStatus = { busy: false, freshAt: null };
/** busy = có API báo cáo đang tải; freshAt = lần gần nhất máy chủ trả số mới (ISO). */
export function useRefreshStatus(): RefreshStatus {
  return useSyncExternalStore(subscribeRefresh, () => refreshStatus, () => SERVER_STATUS);
}

export type ApiState<T> = {
  data: T | null;
  /** Thời điểm lấy số đang hiện (ISO). */ at: string | null;
  /** true = đang hiện số lưu từ lần trước, máy chủ chưa trả số mới. */ stale: boolean;
  loading: boolean;
  error: string | null;
};
export type UseApi<T> = ApiState<T> & { reload: () => void };

/**
 * Tải một API báo cáo với số "lần cuối" hiện ngay. url = null → không tải (giữ data cũ).
 * Đổi url thì hiện số lưu của url mới (nếu có) và tải lại; refreshMs > 0 thì tự tải lại định kỳ (giữ số cũ trong lúc chờ).
 */
export function useApi<T>(url: string | null, options: { refreshMs?: number; keep?: boolean } = {}): UseApi<T> {
  const { refreshMs = 0, keep = true } = options;
  const [state, setState] = useState<ApiState<T>>({ data: null, at: null, stale: false, loading: !!url, error: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const urlRef = useRef(url);
  useEffect(() => {
    urlRef.current = url;
    if (!url) { setState((s) => ({ ...s, loading: false })); return; }
    const controller = new AbortController();
    let fresh = false;
    const key = `${url}#${tick}`;
    beginRefresh(key);
    setState((s) => ({ data: keep ? s.data : null, at: keep ? s.at : null, stale: !!(keep && s.data), loading: true, error: null }));
    // Số lưu từ lần trước: hiện ngay nếu máy chủ chưa kịp trả số mới.
    void readSnapshot<T>(url).then((snap) => {
      if (!snap || fresh || controller.signal.aborted || urlRef.current !== url) return;
      setState((s) => (s.stale || !s.data) ? { data: snap.data, at: snap.at, stale: true, loading: true, error: null } : s);
    });
    fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => ({})) as T & { error?: string };
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        fresh = true;
        const at = new Date().toISOString();
        void writeSnapshot(url, body);
        endRefresh(key, at);
        if (urlRef.current === url) setState({ data: body, at, stale: false, loading: false, error: null });
      })
      .catch((e: unknown) => {
        endRefresh(key);
        if (controller.signal.aborted) return;
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Không tải được.' }));
      });
    const timer = refreshMs > 0 ? window.setInterval(() => { if (document.visibilityState === 'visible') setTick((t) => t + 1); }, refreshMs) : 0;
    return () => { controller.abort(); endRefresh(key); if (timer) window.clearInterval(timer); };
  }, [url, tick, refreshMs, keep]);
  return { ...state, reload };
}
