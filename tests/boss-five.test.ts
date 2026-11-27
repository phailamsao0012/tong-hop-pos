// Báo cáo sếp 5 ảnh (anh Vũ 27/11/2026: "gửi 4 ảnh, 1 ảnh sale, 1 ảnh cskh, 1 ảnh mkt, 1 ảnh tổng quan, nếu được thêm vận đơn nữa").
// Số ảo của thế giới demo; không có số thật, tên người thật.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoWorld, emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { saveContact } from '../lib/zalo/zalo-work';
import { BOSS_FIVE_KEY, BOSS_PAGES, bossImages, type BossData } from '../lib/zalo/boss-report';

const vn = (s: string) => Date.parse(`${s}+07:00`);
const blank = (day: string, hour: string, morning: boolean): BossData => ({ day, until: morning ? null : `${Number(hour)}h`, title: 't', range: 'r', company: { net: 0, orders: 0, yesterday: 0 },
  sale: { kpi: { goal: null, monthNet: 0, todayNet: 0 }, base: 0, closed: 0, prevBase: 0, prevClosed: 0, packed: 0, returned: 0, cancelled: 0, teams: [], people: [] },
  cskh: { kpi: { goal: null, monthNet: 0, todayNet: 0 }, orders: 0, prevOrders: 0, base: 0, closed: 0, prevBase: 0, prevClosed: 0, teams: [], people: [] },
  mkt: { kpi: { goal: null, monthNet: 0, todayNet: 0 }, leads: 0, monthLeads: 0, leadsGoal: null, cost: 0, teams: [], people: [] },
  pos: [], ship: { packed: 0, closed: 0, vtp: 0, spx: 0 }, overdueTasks: 0 });

void test('5 ảnh: thứ tự Tổng quan, Sale, CSKH, MKT, Vận đơn; chưa bật thì 2 ảnh kiểu cũ', () => {
  const d = blank('2026-11-27', '12', false);
  const five = bossImages(d, true);
  assert.deepEqual(five.map((x) => x.img.page), ['tong', 'sale', 'cskh', 'mkt', 'vandon']);
  assert.match(five[0].text, /Báo cáo tổng quan/);
  assert.deepEqual(five.slice(1).map((x) => x.text.slice(0, 3)), ['2/5', '3/5', '4/5', '5/5']);
  assert.equal(new Set(five.map((x) => x.label)).size, 5, 'nhãn hàng chờ gửi lại khác nhau');
  const old = bossImages(d, false);
  assert.deepEqual(old.map((x) => [x.img.part, x.img.page]), [[1, undefined], [2, undefined]]);
});

void test('5 ảnh vẽ được với số demo và số rỗng; chiều cao đủ cho số dòng; tổng POS ảnh Tổng quan = doanh thu công ty', async () => {
  const { raw, db } = await demoWorld(['2026-10-15', '2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  try {
    await loginAs(raw, 'owner');
    const { bossReportData } = await import('../lib/zalo/boss-data');
    const { BossImageView, bossImageHeight } = await import('../app/zalo-boss-image');
    const d = await bossReportData('2026-10-16', '17', false, vn('2026-10-16T17:00:00'), db);
    assert.equal(d.pos.reduce((a, p) => a + p.net, 0), d.company.net);
    for (const data of [d, blank('2026-10-16', '17', false)]) {
      for (const { img } of bossImages(data, true)) {
        const html = renderToStaticMarkup(React.createElement(BossImageView, { img }));
        const label = BOSS_PAGES.find((p) => p.page === img.page)!.label;
        assert.ok(html.includes(label === 'Tổng quan' ? 'Tổng quan' : label), `${img.page}: có tiêu đề`);
        assert.ok(bossImageHeight(img) > 600 && bossImageHeight(img) < 4000, `${img.page}: chiều cao ${bossImageHeight(img)}`);
      }
    }
    // Ảnh Sale có bảng theo team và top người khi có số; nhiều dòng thì cao hơn ảnh rỗng.
    const sale = bossImages(d, true)[1].img, empty = bossImages(blank('2026-10-16', '17', false), true)[1].img;
    const html = renderToStaticMarkup(React.createElement(BossImageView, { img: sale }));
    assert.match(html, /SALE THEO TEAM/); assert.match(html, /TOP 5 SALE/);
    assert.ok(bossImageHeight(sale) >= bossImageHeight(empty));
    // Ảnh kiểu cũ vẫn vẽ (ảnh đang chờ gửi lại sau khi đổi bản).
    for (const { img } of bossImages(d, false)) assert.ok(renderToStaticMarkup(React.createElement(BossImageView, { img })).length > 100);
  } finally { raw.close(); }
});

void test('gửi thử 5 ảnh chỉ cho một người ("to"), sếp không nhận; bật BOSS_FIVE_KEY thì lịch gửi sếp 5 ảnh', async () => {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  const boss = await saveContact(db, { name: 'Sếp demo', kind: 'boss' });
  // Người nhận thử: một liên hệ không phải sếp (leader ảo, đủ trường hợp lệ như tests/zalo-tick.test.ts).
  const owner = await saveContact(db, { name: 'Leader demo', kind: 'leader', team_id: 'team-demo', team_name: 'Team demo', dept: 'sale' });
  raw.prepare('UPDATE zalo_contacts SET chat_id=id').run();
  const photos: { chat: string; caption: string }[] = [];
  const sendPhoto = async (chat: string, _url: string, caption: string) => { photos.push({ chat, caption }); return true; };
  const send = async () => {};
  const bossData = async (day: string, hour: string, morning: boolean) => blank(day, hour, morning);
  const { sendBossReportNow, maybeZaloTick } = await import('../lib/zalo/zalo-tick');
  const out = await sendBossReportNow(db, '2026-11-27', '12', { sendPhoto, send, bossData, five: true, to: owner.id });
  assert.equal(out.length, 5);
  assert.ok(photos.every((p) => p.chat === owner.id), 'chỉ người được gửi thử');
  assert.ok(!photos.some((p) => p.chat === boss.id));
  assert.equal(new Set(photos.map((p) => p.chat)).size, 1, 'không liên hệ nào khác nhận');
  // Chưa bật: gửi ngay cho sếp vẫn 2 ảnh.
  photos.length = 0;
  assert.equal((await sendBossReportNow(db, '2026-11-27', '12', { sendPhoto, send, bossData })).length, 2);
  // Chưa bật khoá: lịch 12h gửi sếp 2 ảnh kiểu cũ.
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('zalo_tick_v1','{\"morningTest\":\"anh-1\"}','2026-11-27T00:00:00Z')").run();
  const snapshot = async () => ({ total: 0, orders: 0, people: {} });
  photos.length = 0;
  await maybeZaloTick(vn('2026-11-27T12:00:00'), { db, send, sendPhoto, bossData, snapshot });
  assert.equal(photos.filter((p) => p.chat === boss.id).length, 2, 'chưa bật: 2 ảnh');
  // Bật khoá: lịch 17h gửi sếp 5 ảnh.
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES (?, '1', '2026-11-27T00:00:00Z')").run(BOSS_FIVE_KEY);
  photos.length = 0;
  await maybeZaloTick(vn('2026-11-27T17:00:00'), { db, send, sendPhoto, bossData, snapshot });
  const toBoss = photos.filter((p) => p.chat === boss.id);
  assert.equal(toBoss.length, 5);
  assert.match(toBoss[4].caption, /^5\/5 · Vận đơn/);
  raw.close();
});
