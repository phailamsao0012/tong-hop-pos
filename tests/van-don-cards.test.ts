import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVanDon, isPacked, isWhConfirmed, PACKED_SQL, WH_CONFIRMED_SQL, type VdRow } from '../lib/van-don';
import { returnTone } from '../lib/return-tone';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { POS } from '../lib/report-model';
import { SENT_AT_READY_KEY } from '../lib/stats';

// Dưới 5% tô xanh từ 21/10/2026 (anh Vũ: "từ 7% lên là tô đỏ, 5% là vàng, dưới 5% là xanh").
void test('returnTone: biên 4,99 / 5 / 6,99 / 7 và không có mẫu', () => {
  assert.deepEqual([null, 0, 4.99, 5, 6.99, 7, 100].map(returnTone), ['none', 'green', 'green', 'amber', 'amber', 'red', 'red']);
});

void test('van-don-cards: đã qua bước, đang ở bước, giá trị và nhóm ngày gửi riêng', () => {
  const row = (status_code: number, packed?: number): VdRow => ({ seller_id: 's', confirm_by: 'v', cancel_by: null, confirmed: Number(isWhConfirmed({ status_code, first_confirmed_at: null })), packed, status_code, reason: null, n: 1, net: 100 });
  const rows = [17, 1, 11, 12, 13, 20, 8, 9, 2, 3, 16, 4, 15, 5].map((s) => row(s));
  rows.push({ ...row(6, 1), confirmed: 1 });
  const t = buildVanDon(rows, new Map()).total;
  assert.deepEqual([t.confirmed, t.packed, t.sent, t.delivered, t.returned], [14, 9, 6, 2, 3]);
  assert.deepEqual([t.confirmedNet, t.packedNet, t.sentNet, t.deliveredNet, t.returnedNet], [1400, 900, 600, 200, 300]);
  assert.deepEqual([t.atConfirmed, t.atPacked, t.atSent, t.atDelivered, t.atReturned], [5, 2, 1, 2, 3]);
  assert.equal(t.waiting, 1);
  const sent = buildVanDon(rows, new Map(), [{ ...row(3), n: 20, net: 4000 }]).total;
  assert.equal(sent.confirmed, t.confirmed);
  assert.equal(sent.packed, t.packed);
  assert.deepEqual([sent.sent, sent.sentNet, sent.delivered, sent.deliveredNet, sent.atDelivered], [20, 4000, 20, 4000, 20]);
  assert.equal(buildVanDon([], new Map()).total.returnRate, null);
});

void test('van-don-cards: API và danh sách khớp số, POS/kỳ/team, SQL qua chỉ mục', async () => {
  const { raw, db } = emptyDb();
  try {
    await loginAs(raw, 'owner');
    const pos = POS[0].id;
    const at = '2026-10-17T03:00:00';
    for (const [i, status] of [17, 1, 8, 9, 2, 3, 16, 4, 15, 5, 6].entries()) {
      const history = status === 6 ? '[{"status":8}]' : '[]';
      raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,status_code,status_history_json,net_total,created_at,first_closed_at,first_confirmed_at,first_sent_at,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(`o${i}`, pos, pos, `o${i}`, 's', status, history, 100, at, at, status === 17 ? null : at, [2,3,16,4,15,5].includes(status) ? at : null, at);
      const packed = raw.prepare(`SELECT ${PACKED_SQL()} AS packed FROM raw_pos_orders o WHERE id=?`).get(`o${i}`) as { packed: number };
      assert.equal(Boolean(packed.packed), isPacked({ status_code: status, status_history_json: history }));
    }
    const { GET } = await import('../app/api/reports/van-don/route');
    const base = `http://localhost/api/reports/van-don?start=2026-10-17&end=2026-10-17&posIds=${pos}`;
    for (const bySent of [false, true]) {
      if (bySent) await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').bind(SENT_AT_READY_KEY, '1', at).run();
      const report = await (await GET(new Request(base))).json() as { total: ReturnType<typeof buildVanDon>['total'] };
      for (const [card, count, net] of [
        ['confirmed', report.total.confirmed, report.total.confirmedNet], ['packed', report.total.packed, report.total.packedNet],
        ['sent', report.total.sent, report.total.sentNet], ['delivered', report.total.delivered, report.total.deliveredNet],
        ['returned', report.total.returned, report.total.returnedNet], ['waiting', report.total.waiting, 100], ['failed', report.total.failed, 0],
      ] as const) {
        const res = await GET(new Request(`${base}&card=${card}`));
        assert.equal(res.status, 200);
        const list = await res.json() as { orders: { net: number }[] };
        assert.equal(list.orders.length, count, card);
        assert.equal(list.orders.reduce((s, o) => s + o.net, 0), net, card);
      }
    }
    raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,department,fetched_at) VALUES (?,?,?,?,?,?)').run('s', pos, 's', 'NV A SALE', 'Sale', at);
    raw.prepare('INSERT INTO hr_departments (id,name,kind,active) VALUES (?,?,?,1)').run('team-a', 'Team Sale 1', 'team');
    raw.prepare('INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,department_id,status) VALUES (?,?,?,?,?,?)').run('s', 'nv-a', 'NV A', 'sale', 'team-a', 'dang_lam');
    const scoped = `${base}&hrTeam=team-a`;
    const list = async (url: string) => await (await GET(new Request(url))).json() as { orders: { id: string; net: number }[]; more: boolean };
    const before = await list(`${scoped}&card=packed`);
    raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,status_code,net_total,first_closed_at,fetched_at) VALUES (?,?,?,?,?,8,100,?,?)')
      .run('outsider', pos, pos, 'outsider', 'other', at, at);
    assert.deepEqual(await list(`${scoped}&card=packed`), before);
    assert.equal((await list(`${scoped.replace('2026-10-17&end=2026-10-17', '2026-10-18&end=2026-10-18')}&card=packed`)).orders.length, 0);
    assert.equal((await list(`${scoped.replace(pos, POS[1].id)}&card=packed`)).orders.length, 0);
    for (let i = 0; i < 105; i++) raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,status_code,net_total,first_closed_at,fetched_at) VALUES (?,?,?,?,?,8,100,?,?)')
      .run(`page${i}`, pos, pos, `page${i}`, 's', at, at);
    const first = await list(`${scoped}&card=packed`), second = await list(`${scoped}&card=packed&offset=100`);
    assert.equal(first.orders.length, 100);
    assert.equal(first.more, true);
    assert.equal(second.more, false);
    assert.equal(new Set([...first.orders, ...second.orders].map((o) => o.id)).size, before.orders.length + 105);
    assert.equal((await GET(new Request(`${base}&card=__proto__`))).status, 400);
    for (const time of ['first_closed_at', 'first_sent_at']) {
      const plan = raw.prepare(`EXPLAIN QUERY PLAN SELECT o.id, ${PACKED_SQL()} FROM raw_pos_orders o WHERE o.pos_id=? AND o.${time}>=? AND o.${time}<? AND ${WH_CONFIRMED_SQL()} ORDER BY o.${time},o.id LIMIT 101`).all(pos, at, '2026-10-18T00:00:00');
      const index = time === 'first_closed_at' ? 'idx_raw_orders_pos_closed_status_money' : 'idx_raw_orders_pos_sent_status_money';
      assert.ok(JSON.stringify(plan).includes(index));
      console.log('EXPLAIN QUERY PLAN', time, plan);
    }
  } finally { logout(); raw.close(); }
});
