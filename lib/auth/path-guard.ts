// Đường dẫn phải ở dạng chuẩn trước khi kiểm quyền (worker.ts, scopeApi so theo tiền tố đường dẫn).
// Dạng khác với dạng chuẩn thì trả 404, không thử đoán: router có thể hiểu khác cổng kiểm quyền.

/** Ký tự hợp lệ trong đường dẫn API (theo RFC 3986, không gồm dấu \ và khoảng trắng). */
const API_PATH_CHARS = /^[A-Za-z0-9\-._~/%:@!$&'()*+,;=]*$/;
/** Dấu phân cách / dấu chấm viết dạng mã hoá, ký tự rỗng. */
const ENCODED_SEPARATOR = /%(?:2f|5c|2e|00)/i;

/** Dạng chuẩn của đường dẫn (đã bỏ //, không có phân cách mã hoá); trả null khi không có dạng chuẩn an toàn. */
export function canonicalPath(pathname: string): string | null {
  if (!pathname.startsWith('/') || pathname.includes('\\') || ENCODED_SEPARATOR.test(pathname)) return null;
  const collapsed = pathname.replace(/\/{2,}/g, '/');
  const lower = collapsed.toLowerCase();
  if (lower === '/api' || lower.startsWith('/api/')) {
    // Tiền tố API chỉ một kiểu viết, đúng chữ thường.
    if (!collapsed.startsWith('/api')) return null;
    if (!API_PATH_CHARS.test(collapsed)) return null;
    // Mã hoá phải giải được, và sau khi giải không ra khoảng trắng, ký tự điều khiển hay ký tự lạ.
    let decoded: string;
    try { decoded = decodeURIComponent(collapsed); } catch { return null; }
    for (let i = 0; i < decoded.length; i++) { const c = decoded.charCodeAt(i); if (c < 32 || c === 127) return null; }
    if (/[\s"<>\\`{}|^]/.test(decoded)) return null;
  }
  return collapsed;
}

/** Đường dẫn có được đi tiếp không: chỉ khi nó đã đúng dạng chuẩn. */
export const isCanonicalPath = (pathname: string) => canonicalPath(pathname) === pathname;
