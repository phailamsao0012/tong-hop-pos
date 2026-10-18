// Pre-G7 customer bindings and upsert for synthetic comparisons.
import { normalizePhone } from '../../lib/customer-stats';
import { noteStatements } from '../../lib/customers-sync';
import type { SourceCustomer } from '../../lib/pancake';
const str = (v: unknown) => v === null || v === undefined ? null : String(v as string | number | boolean);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isoFromMs = (v: unknown) => { const n = Number(v); if (!Number.isFinite(n) || !n) return null; return new Date(n > 1e12 ? n : n * 1000).toISOString().slice(0, 19); };
const isoOf = (v: unknown) => typeof v === 'number' ? isoFromMs(v) : typeof v === 'string' && v ? v.replace(/Z$/, '').slice(0, 19) : null;

export function customerStatements(db: D1Database, posId: string, c: SourceCustomer, now: string) {
  const customerId = str(c.id) ?? str(c.customer_id);
  if (!customerId) return [];
  const phones = (Array.isArray(c.phone_numbers) ? c.phone_numbers : []).map((p) => normalizePhone(String(p))).filter(Boolean);
  const phone = phones[0] ?? null;
  const tags = (Array.isArray(c.tags) ? c.tags : []).map((t) => (typeof t === 'string' ? t : (t as { name?: string; text?: string })?.name ?? (t as { text?: string })?.text ?? '')).filter(Boolean);
  const statements = [db.prepare(
    `INSERT INTO pos_customers (id,pos_id,customer_id,name,phone,phones_json,assigned_user_id,level,order_count,succeed_order_count,purchased_amount,last_order_at,inserted_at,updated_at,tags_json,note_count,last_note_at,fetched_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,phones_json=excluded.phones_json,assigned_user_id=excluded.assigned_user_id,level=excluded.level,
       order_count=excluded.order_count,succeed_order_count=excluded.succeed_order_count,purchased_amount=excluded.purchased_amount,last_order_at=excluded.last_order_at,
       inserted_at=COALESCE(pos_customers.inserted_at,excluded.inserted_at),updated_at=excluded.updated_at,tags_json=excluded.tags_json,note_count=excluded.note_count,last_note_at=excluded.last_note_at,fetched_at=excluded.fetched_at
     WHERE pos_customers.updated_at IS NOT excluded.updated_at OR pos_customers.assigned_user_id IS NOT excluded.assigned_user_id OR pos_customers.note_count<>excluded.note_count
       OR pos_customers.last_note_at IS NOT excluded.last_note_at OR pos_customers.succeed_order_count<>excluded.succeed_order_count OR pos_customers.purchased_amount<>excluded.purchased_amount
       OR pos_customers.order_count<>excluded.order_count OR pos_customers.name<>excluded.name OR pos_customers.phone IS NOT excluded.phone OR pos_customers.tags_json<>excluded.tags_json OR pos_customers.level IS NOT excluded.level`,
  ).bind(`${posId}:${customerId}`, posId, customerId, String(c.name ?? '').slice(0, 200), phone, JSON.stringify(phones), str(c.assigned_user_id), str(c.level ?? c.level_id),
    num(c.order_count) ?? 0, num(c.succeed_order_count) ?? 0, num(c.purchased_amount) ?? 0, isoOf(c.last_order_at), isoOf(c.inserted_at), isoOf(c.updated_at), JSON.stringify(tags),
    Array.isArray(c.notes) ? c.notes.filter((n) => !n.removed_at).length : 0,
    Array.isArray(c.notes) ? (c.notes.map((n) => isoFromMs(n.created_at)).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))).at(-1) ?? null) : null, now)];
  statements.push(...noteStatements(db, posId, customerId, phone, c.notes, now, 'customer'));
  return statements;
}

