// Pre-G7 catalog upserts for synthetic comparisons.
import { listUsers, listVariationsPage } from '../../lib/pancake/pancake';
import { toIso } from '../../lib/teams/hr-link';
import type { ShopRow } from '../../lib/pancake/sync';
async function writeBatched(db: D1Database, statements: D1PreparedStatement[]) {
 let writes = 0;
 for (let i=0;i<statements.length;i+=60) for (const r of await db.batch(statements.slice(i,i+60))) writes += Number(r.meta.rows_written ?? 0);
 return writes;
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export async function syncUsers(db: D1Database, shop: ShopRow, apiKey: string) {
  const now = new Date().toISOString();
  const rows = await listUsers(shop.shop_id!, apiKey);
  const statements = rows.flatMap((row) => {
    const id = row.user_id ?? row.user?.id;
    if (!id) return [];
    return [db.prepare(
      'INSERT INTO pos_users (id,pos_id,user_id,name,email,phone,is_active,fetched_at,department,sale_group,source_created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,is_active=excluded.is_active,fetched_at=excluded.fetched_at,department=excluded.department,sale_group=excluded.sale_group,source_created_at=COALESCE(excluded.source_created_at,pos_users.source_created_at)',
    ).bind(`${shop.id}:${id}`, shop.id, id, row.user?.name?.trim() ?? '', str(row.user?.email), str(row.user?.phone_number), row.is_active === false ? 0 : 1, now,
      str(row.department?.name?.trim()), str(row.sale_group?.name?.trim()), toIso(row.inserted_at ?? row.created_at ?? row.user?.inserted_at))];
  });
  statements.push(db.prepare('UPDATE pos_shops SET users_synced_at=? WHERE id=?').bind(now, shop.id));
  const writes = await writeBatched(db, statements);
  return { records: statements.length - 1, writes };
}

export async function syncProducts(db: D1Database, shop: ShopRow, apiKey: string, maxPages = 20) {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let records = 0;
  for (let page = 1; page <= maxPages; page++) {
    const result = await listVariationsPage(shop.shop_id!, apiKey, page);
    for (const v of result.data!) {
      const variationId = str(v.id);
      const productId = str(v.product_id) ?? str(v.product?.id);
      if (!variationId || !productId) continue;
      const fields = (v.fields ?? []).map((f) => f.value).filter(Boolean).join(' / ');
      statements.push(db.prepare(
        'INSERT INTO pos_products (id,pos_id,product_id,variation_id,product_name,variation_name,sku,retail_price,category_json,is_hidden,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET product_name=excluded.product_name,variation_name=excluded.variation_name,sku=excluded.sku,retail_price=excluded.retail_price,category_json=excluded.category_json,is_hidden=excluded.is_hidden,fetched_at=excluded.fetched_at',
      ).bind(
        `${shop.id}:${variationId}`, shop.id, productId, variationId,
        v.product?.name?.trim() ?? v.name?.trim() ?? '', fields || (v.name?.trim() ?? ''),
        str(v.display_id) ?? str(v.product?.display_id), num(v.retail_price),
        JSON.stringify((v.product?.categories ?? []).map((c) => c.name).filter(Boolean)),
        v.is_hidden || v.product?.is_hidden || v.is_removed ? 1 : 0, now,
      ));
      records++;
    }
    const total = typeof result.total_entries === 'number' ? result.total_entries : null;
    const hasMore = total !== null ? page * 100 < total : result.data!.length === 100;
    if (!hasMore) break;
  }
  statements.push(db.prepare('UPDATE pos_shops SET products_synced_at=? WHERE id=?').bind(now, shop.id));
  const writes = await writeBatched(db, statements);
  return { records, writes };
}

