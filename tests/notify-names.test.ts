import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { NAMES, OLD_NAMES } from '../lib/notify/names';
import { METRIC_DEFS } from '../lib/reports/metrics';

void test('tên số trên Telegram trùng tên web', () => {
  assert.equal(NAMES.orders, METRIC_DEFS.orders.name);
  assert.equal(NAMES.closed, METRIC_DEFS.closed.name);
  assert.equal(NAMES.revenue, METRIC_DEFS.revenue.name);
  assert.equal(NAMES.shipped, 'Đơn chuyển đi');
  assert.equal(NAMES.assigned, 'Số được chia');
  for (const v of Object.values(NAMES)) assert.ok(!OLD_NAMES.some((o) => v.includes(o)), v);
});

// File gửi tin đã chuyển sang bảng tên chung; file nào chuyển xong (bước 3 trở đi) thì thêm vào đây.
const DA_CHUYEN = ['lib/bot/bot.ts', 'lib/bot/bot-menu.ts', 'lib/bot/bot-charts.ts'];
void test('file gửi tin đã chuyển không còn tên cũ', () => {
  for (const f of DA_CHUYEN) {
    const text = readFileSync(join(import.meta.dirname, '..', f), 'utf8');
    for (const o of OLD_NAMES) assert.ok(!text.includes(o), `${f} còn "${o}"`);
  }
});
