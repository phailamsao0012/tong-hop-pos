import { listShops } from '@/lib/pancake';
import { POS } from '@/lib/report-model';

/** Bỏ dấu, chữ thường, chỉ giữ chữ và số để so tên cửa hàng. */
export const normalizeName = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

/** Ghép tên cửa hàng Pancake với POS trong phạm vi; ưu tiên khớp đúng, sau đó khớp chứa. */
export function matchShops(shops: { id: string; name: string }[]) {
  const result = new Map<string, { id: string; name: string }>();
  const taken = new Set<string>();
  const normalized = shops.map((s) => ({ ...s, key: normalizeName(s.name) }));
  for (const pos of POS) {
    const key = normalizeName(pos.name);
    const exact = normalized.find((s) => s.key === key && !taken.has(s.id));
    if (exact) { result.set(pos.id, exact); taken.add(exact.id); }
  }
  for (const pos of POS) {
    if (result.has(pos.id)) continue;
    const key = normalizeName(pos.name);
    const candidates = normalized.filter((s) => !taken.has(s.id) && s.key.length >= 5 && key.length >= 5 &&
      (s.key.includes(key) || key.includes(s.key)));
    if (candidates.length === 1) { result.set(pos.id, candidates[0]); taken.add(candidates[0].id); }
  }
  return result;
}

/** Điền shop_id cho POS chưa có; trả về danh sách cửa hàng và POS chưa ghép được. */
export async function autoMapShops(db: D1Database, apiKey: string) {
  const shops = await listShops(apiKey);
  const rows = await db.prepare('SELECT id,shop_id FROM pos_shops').all<{ id: string; shop_id: string | null }>();
  const existing = new Map(rows.results.map((r) => [r.id, r.shop_id]));
  const matched = matchShops(shops);
  const statements: D1PreparedStatement[] = [];
  const mapped: { posId: string; shopId: string; shopName: string }[] = [];
  for (const pos of POS) {
    const current = existing.get(pos.id);
    if (current && /^\d+$/.test(current)) continue;
    const shop = matched.get(pos.id);
    if (!shop) continue;
    statements.push(db.prepare(
      "INSERT INTO pos_shops (id,name,shop_id,status) VALUES (?,?,?,'pending') ON CONFLICT(id) DO UPDATE SET shop_id=excluded.shop_id,status='pending',last_error=NULL",
    ).bind(pos.id, pos.name, shop.id));
    mapped.push({ posId: pos.id, shopId: shop.id, shopName: shop.name });
  }
  if (statements.length) await db.batch(statements);
  const unmatched = POS.filter((p) => !matched.get(p.id) && !/^\d+$/.test(existing.get(p.id) ?? '')).map((p) => p.id);
  return { shops, mapped, unmatched };
}
