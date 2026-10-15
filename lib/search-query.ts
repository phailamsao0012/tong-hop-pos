/** Ký tự LIKE do người dùng nhập luôn được hiểu là ký tự nguyên văn. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/** Cùng một SĐT Việt Nam, theo thứ tự ổn định để dùng phone IN và chỉ mục POS × SĐT. */
export function phoneVariants(digits: string): string[] {
  const q = digits.trim();
  if (!/^\+?[\d\s().-]+$/.test(q)) return [];
  const n = q.replace(/\D/g, '');
  const local = /^\d{9}$/.test(n) ? `0${n}` : /^0\d{9}$/.test(n) ? n : /^84\d{9}$/.test(n) ? `0${n.slice(2)}` : '';
  if (!local) return [];
  return [local, `84${local.slice(1)}`, `+84${local.slice(1)}`];
}

/** Mã gồm số hoặc chữ kèm số; chữ thuần vẫn là tìm tên khách. */
export function orderKeys(q: string, posIds: readonly string[]): string[] {
  const code = q.trim().replace(/^#/, '');
  if (!/^[a-zA-Z0-9]+$/.test(code) || !/\d/.test(code)) return [];
  return [...new Set(posIds)].map((pos) => `${pos}:${code}`);
}

export const searchTermType = (q: string): 'phone' | 'order' | 'name' =>
  phoneVariants(q).length ? 'phone' : orderKeys(q, ['pos']).length ? 'order' : 'name';

/** Nhật ký không giữ SĐT, tên khách hoặc nguyên văn từ khoá. */
export function maskSearchTerm(q: string): string {
  const text = q.trim();
  if (!text) return '';
  if (phoneVariants(text).length) return `•••${text.replace(/\D/g, '').slice(-3)}`;
  const chars = Array.from(text);
  return `${chars[0]}… (${chars.length} ký tự)`;
}
