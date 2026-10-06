// Đăng nhập bằng tài khoản Google (06/10/2026, anh Vũ: "đăng nhập bằng google đc k, tài khoản gg có sẵn trong máy").
// Nút Google chuyển sang trang chọn tài khoản của Google (hiện sẵn các tài khoản đang đăng nhập trên máy), Google trả ID token
// về /login; máy chủ tự kiểm chữ ký bằng khoá công khai của Google rồi khớp email với tài khoản web tổng đã có.
// Không lưu gì của Google, chỉ xin email và tên. Cần biến GOOGLE_CLIENT_ID (OAuth client loại Web trên Google Cloud).
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export type GoogleClaims = { iss: string; aud: string; sub: string; email: string; email_verified?: boolean | string; exp: number; iat?: number; name?: string; nonce?: string };
type Jwk = JsonWebKey & { kid?: string };
export type FetchKeys = () => Promise<{ keys: Jwk[]; maxAge: number }>;

const b64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s))) as Record<string, unknown>;

export const fetchGoogleKeys: FetchKeys = async () => {
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error(`Google certs ${r.status}`);
  const age = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  return { keys: ((await r.json()) as { keys: Jwk[] }).keys, maxAge: Math.min(Math.max(age, 60), 86400) };
};

// Khoá Google đổi định kỳ: giữ trong bộ nhớ Worker theo max-age; gặp kid lạ thì tải lại một lần.
let cache: { keys: Jwk[]; until: number } | null = null;
async function keyFor(kid: string, fetchKeys: FetchKeys, now: number) {
  for (let pass = 0; pass < 2; pass++) {
    if (!cache || cache.until <= now || pass === 1) { const k = await fetchKeys(); cache = { keys: k.keys, until: now + k.maxAge * 1000 }; }
    const jwk = cache.keys.find((k) => k.kid === kid);
    if (jwk) return crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  return null;
}
export const resetGoogleKeyCache = () => { cache = null; };

/**
 * Kiểm ID token Google: chữ ký RS256, nơi phát hành, đúng client ID của web, còn hạn, email đã được Google xác minh,
 * và nonce khớp mã máy chủ đã phát cho trình duyệt này (chống dùng lại token của phiên khác). Sai trả null.
 */
export async function verifyGoogleIdToken(token: string, clientId: string, opts: { nonce: string; now?: number; fetchKeys?: FetchKeys }): Promise<GoogleClaims | null> {
  const now = opts.now ?? Date.now();
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || !clientId) return null;
  try {
    const head = json(parts[0]);
    if (head.alg !== 'RS256' || typeof head.kid !== 'string') return null;
    const key = await keyFor(head.kid, opts.fetchKeys ?? fetchGoogleKeys, now);
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const c = json(parts[1]) as unknown as GoogleClaims;
    if (!ISSUERS.has(c.iss) || c.aud !== clientId || typeof c.exp !== 'number' || c.exp * 1000 < now - 60_000) return null;
    if (typeof c.iat === 'number' && c.iat * 1000 > now + 300_000) return null;
    if (!opts.nonce || c.nonce !== opts.nonce) return null;
    if (typeof c.email !== 'string' || !(c.email_verified === true || c.email_verified === 'true')) return null;
    return c;
  } catch {
    return null;
  }
}

/** Trang chọn tài khoản Google (OpenID Connect, trả ID token về redirectUri qua #fragment). */
export function googleAuthUrl(clientId: string, redirectUri: string, nonce: string, state: string) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'id_token', scope: 'openid email profile', nonce, state, prompt: 'select_account' });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
