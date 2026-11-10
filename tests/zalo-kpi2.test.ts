import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kpi2Rows, kpi2RowText, kpi2Text } from '../lib/zalo/kpi2-report';
import { maybeZaloTick } from '../lib/zalo/zalo-tick';
import { emptyDb } from './support/d1-sqlite';
import { saveContact, type Contact } from '../lib/zalo/zalo-work';

const got = { assigned: 300, closed: 120, orders: 150, upsellRate: 18, products: { gentadox: 40 } };

void test('dòng chỉ tiêu Sale: chỉ dòng đã đặt, so tiến độ theo ngày đã qua', () => {
  const rows = kpi2Rows({ assigned: 900, closed: 300, products: { gentadox: 200, oxy: 50 } }, got, 'sale', 10, 30);
  assert.deepEqual(rows.map((r) => r.label), ['Số nhận', 'Số chốt', 'Gentadox', 'Oxy']);
  assert.equal(rows[0].ahead, true); // 300 ≥ 900 × 10/30
  assert.equal(rows[1].ahead, true); // 120 ≥ 100
  assert.equal(rows[2].ahead, false); // 40 < 66,7
  assert.equal(kpi2RowText(rows[0]), 'Số nhận 300/900 (33%) ✓');
  assert.equal(rows[3].done, 0);
});

void test('dòng chỉ tiêu CSKH: tỷ lệ tự upsell so thẳng, không có số nhận / số chốt', () => {
  const rows = kpi2Rows({ assigned: 900, upsellRate: 20 }, got, 'cskh', 10, 30);
  assert.deepEqual(rows.map((r) => r.label), ['Tỷ lệ tự upsell']);
  assert.equal(kpi2RowText(rows[0]), 'Tỷ lệ tự upsell 18%/20% ✗');
  assert.equal(kpi2Text([]), '');
  assert.match(kpi2Text(rows), /^Chỉ tiêu tháng: Tỷ lệ tự upsell 18%\/20% ✗/);
  assert.deepEqual(kpi2Rows(undefined, got, 'sale', 1, 30), []);
});

void test('báo cáo ca Zalo có dòng chỉ tiêu tháng khi team đã đặt', async () => {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  await saveContact(db, { name: 'Leader demo', kind: 'leader', team_id: 'team-demo', team_name: 'Team demo', dept: 'sale' });
  raw.prepare('UPDATE zalo_contacts SET chat_id=id').run();
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('zalo_tick_v1','{\"morningTest\":\"anh-1\"}','2026-10-27T00:00:00Z')").run();
  const messages: string[] = [];
  const seen: string[] = [];
  const kpi2 = async (_c: Contact, toDay: string) => { seen.push(toDay); return kpi2Rows({ assigned: 900 }, got, 'sale', 27, 31); };
  const snapshot = async () => ({ total: 100, orders: 1, people: {} });
  await maybeZaloTick(Date.parse('2026-10-27T12:00:00+07:00'), { db, send: async (_chat, text) => { messages.push(text); }, snapshot, sendPhoto: async () => false, kpi2 });
  assert.deepEqual(seen, ['2026-10-27']);
  assert.match(messages[0], /Chỉ tiêu tháng: Số nhận 300\/900 \(33%\) ✗/);
});
