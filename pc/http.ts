// Phần http của máy chủ Node trên PC (N2): đọc .dev.vars, _headers, trả tệp tĩnh, đổi http của Node sang Request/Response.
// Tách khỏi pc/server.ts để test được mà không bật máy chủ.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';

/** Đọc .dev.vars: KHOÁ=giá trị, bỏ dòng trống và #, bỏ ngoặc kép bao ngoài. */
export function parseVars(text: string) {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

// ---- tệp tĩnh (như "assets" của Cloudflare: có tệp thì trả tệp, không thì đến web) ----
const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
/** Luật _headers kiểu Cloudflare: dòng đường dẫn (có thể kết thúc bằng *), các dòng thụt vào là "Tên: giá trị". */
export function parseHeadersFile(text: string) {
  const rules: { prefix: string; exact: boolean; headers: [string, string][] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) { const p = line.trim(); rules.push({ prefix: p.replace(/\*$/, ''), exact: !p.endsWith('*'), headers: [] }); continue; }
    const i = line.indexOf(':');
    if (i > 0 && rules.length) rules[rules.length - 1].headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return (path: string) => rules.filter((r) => (r.exact ? path === r.prefix : path.startsWith(r.prefix))).flatMap((r) => r.headers);
}

/** Đường dẫn tệp trong thư mục client ứng với URL, hoặc null (không có, là thư mục, hoặc cố thoát ra ngoài bằng ..). */
export function staticFile(root: string, pathname: string): string | null {
  let rel: string;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  if (rel.includes('\0') || rel === '/_headers') return null;
  const file = normalize(join(root, rel));
  if (!file.startsWith(root + sep)) return null;
  try { return statSync(file).isFile() ? file : null; } catch { return null; }
}

export function sendStatic(req: IncomingMessage, res: ServerResponse, file: string, extra: [string, string][]) {
  const st = statSync(file);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  res.setHeader('content-type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('etag', etag);
  for (const [k, v] of extra) res.setHeader(k, v);
  if (!res.hasHeader('cache-control')) res.setHeader('cache-control', 'public, max-age=0, must-revalidate');
  if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }
  res.setHeader('content-length', st.size);
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

// ---- chuyển http của Node sang Request/Response chuẩn web ----
export function toRequest(req: IncomingMessage, port: number): Request {
  // Đứng sau Cloudflare Tunnel: máy chủ nhận http, giao thức thật nằm ở x-forwarded-proto (để worker.ts không chuyển hướng vòng).
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim();
  const host = req.headers.host ?? `localhost:${port}`;
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const ac = new AbortController();
  req.on('close', () => { if (!req.complete) ac.abort(); });
  return new Request(`${proto}://${host}${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    signal: ac.signal,
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit);
}

export async function writeResponse(res: ServerResponse, r: Response, head: boolean) {
  res.statusCode = r.status;
  const cookies = r.headers.getSetCookie();
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
  if (cookies.length) res.setHeader('set-cookie', cookies);
  if (!r.body || head) { res.end(); return; }
  const body = Readable.fromWeb(r.body as import('node:stream/web').ReadableStream);
  body.on('error', (e) => { console.error('response stream failed', e); res.destroy(e); });
  res.on('close', () => body.destroy());
  body.pipe(res);
}
