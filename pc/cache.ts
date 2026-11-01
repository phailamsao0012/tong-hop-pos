// caches (Cache API) cho web tổng chạy bằng Node trên PC (N2). Cloudflare giữ cache theo trạm; trên PC chỉ một tiến trình
// nên bộ nhớ trong tiến trình là đủ. Hết hạn theo Cache-Control max-age như Cloudflare; giới hạn dung lượng để không phình RAM.
type Entry = { at: number; ttlMs: number; status: number; headers: [string, string][]; body: ArrayBuffer };

const keyOf = (req: RequestInfo | URL) => (typeof req === 'string' ? req : req instanceof URL ? req.href : req.url);
const maxAge = (h: Headers) => {
  const cc = h.get('cache-control') ?? '';
  if (/no-store|private/i.test(cc) && !/max-age/i.test(cc)) return 0;
  const m = /(?:s-maxage|max-age)=(\d+)/i.exec(cc);
  return m ? Number(m[1]) * 1000 : 0;
};

export class MemoryCache {
  private map = new Map<string, Entry>();
  private bytes = 0;
  constructor(private maxBytes: number) {}

  async match(req: RequestInfo | URL): Promise<Response | undefined> {
    const k = keyOf(req);
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() - e.at >= e.ttlMs) { this.drop(k); return undefined; }
    return new Response(e.body.slice(0), { status: e.status, headers: e.headers });
  }

  async put(req: RequestInfo | URL, res: Response): Promise<void> {
    const ttlMs = maxAge(res.headers);
    const k = keyOf(req);
    const body = await res.arrayBuffer();
    if (ttlMs <= 0 || body.byteLength > this.maxBytes / 4) return;
    this.drop(k);
    this.map.set(k, { at: Date.now(), ttlMs, status: res.status, headers: [...res.headers], body });
    this.bytes += body.byteLength;
    // Đầy thì bỏ mục cũ nhất trước (Map giữ thứ tự thêm vào).
    for (const old of this.map.keys()) {
      if (this.bytes <= this.maxBytes) break;
      this.drop(old);
    }
  }

  async delete(req: RequestInfo | URL): Promise<boolean> {
    return this.drop(keyOf(req));
  }

  private drop(k: string) {
    const e = this.map.get(k);
    if (!e) return false;
    this.bytes -= e.body.byteLength;
    this.map.delete(k);
    return true;
  }
}

/** Gắn globalThis.caches (open theo tên, default) nếu môi trường chưa có. */
export function installCaches(maxBytes = 256 * 1024 * 1024) {
  const named = new Map<string, MemoryCache>();
  const open = async (name: string) => {
    let c = named.get(name);
    if (!c) named.set(name, (c = new MemoryCache(maxBytes)));
    return c;
  };
  const storage = { open, default: new MemoryCache(maxBytes), has: async (n: string) => named.has(n), delete: async (n: string) => named.delete(n), keys: async () => [...named.keys()] };
  Object.defineProperty(globalThis, 'caches', { value: storage, configurable: true, writable: true });
  return storage;
}
