import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { maybeForecastTick, readForecast, runForecast } from '../lib/kpi/forecast-run';
import { GET } from '../app/api/ai/forecast/route';
import { addDays } from '../lib/shared/report-time';
import { POS } from '../lib/shared/report-model';

void test('maybeForecastTick: 06:30 bỏ qua; 07:00/07:30 giữ morning, một dòng mỗi lượt, không lộ tên/ghi chú', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Không gọi mạng'); });
  let writes = 0, deletes = 0;
  const { raw, db } = emptyDb({ DEMO_MODE: '1' }, { onWrite(sql, rows) {
    if (sql.startsWith('INSERT INTO app_settings(key,value,updated_at)')) writes += rows;
    if (sql.startsWith('DELETE FROM app_settings')) deletes++;
  } });
  try {
    const date = '2026-10-19', pos = POS[0].id;
    raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)').run('demo', pos, 'NV_DEMO', 'TEN_GIA_LAP SALE', date);
    for (let i = -28; i <= 0; i++) {
      const day = addDays(date, i), net = i === 0 ? 30 : 240;
      raw.prepare(`INSERT INTO stats_daily (id,pos_id,day,seller_id,assigned_orders,closed_orders,closed_net,updated_at) VALUES (?,?,?,?,10,2,?,?)`)
        .run(day, pos, day, 'NV_DEMO', net, date);
      raw.prepare(`INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,status_code,first_closed_at,net_total,fetched_at,raw_json)
        VALUES (?,?,?,?,?,1,?,?,?,?)`).run(day, pos, 'demo', day, 'NV_DEMO', `${day}T00:00:00`, net, date, JSON.stringify({ name: 'TEN_GIA_LAP', note: 'GHI_CHU_GIA_LAP' }));
    }
    await maybeForecastTick(new Date(`${date}T06:30:00+07:00`));
    assert.equal(await readForecast(db, date), null); assert.equal(writes, 0);
    await maybeForecastTick(new Date(`${date}T07:00:00+07:00`));
    const first = await readForecast(db, date);
    assert.ok(first?.morning); assert.equal(first.points.length, 1); assert.equal(writes, 1); assert.equal(deletes, 6);
    await maybeForecastTick(new Date(`${date}T07:30:00+07:00`));
    const second = await readForecast(db, date);
    assert.equal(second?.points.length, 2); assert.deepEqual(second?.morning, first.morning); assert.equal(writes, 2); assert.equal(deletes, 6);
    await maybeForecastTick(new Date(`${date}T07:30:00+07:00`));
    assert.equal((await readForecast(db, date))?.points.length, 2); assert.equal(writes, 3);
    assert.ok(!JSON.stringify(second).includes('TEN_GIA_LAP'));
    assert.ok(!JSON.stringify(second).includes('GHI_CHU_GIA_LAP'));
    assert.equal(second?.points[0].actual, 30);
    assert.ok(second!.points.every((p) => p.today! >= p.actual && Number.isFinite(p.today) && Number.isFinite(p.week)));
    await loginAs(raw, 'director', { views: ['center'] });
    const request = new Request(`http://localhost/api/ai/forecast?date=${date}`);
    const response = await GET(request), display = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal('people' in display, false);
    t.diagnostic(`Mẫu SQLite demo: ${JSON.stringify(display)}`);
    await loginAs(raw, 'staff', { views: ['security'] });
    assert.equal((await GET(request)).status, 403);
    await loginAs(raw, 'owner');
    assert.ok('people' in (await (await GET(request)).json() as Record<string, unknown>));
    assert.equal((await GET(new Request('http://localhost/api/ai/forecast?date=2026-02-30'))).status, 400);
    // Ép lệch nguồn người bằng một POS ngoài phạm vi báo cáo: phần chênh phải được giữ lại.
    raw.prepare(`INSERT INTO stats_daily (id,pos_id,day,seller_id,assigned_orders,closed_orders,closed_net,updated_at) VALUES ('extra','DEMO_EXTRA',?,'NV_DEMO',0,1,10,?)`)
      .run(addDays(date, -1), date);
    raw.prepare('DELETE FROM app_settings WHERE key=?').run(`ai_forecast:${date}`);
    const reconciled = await runForecast(db, new Date(`${date}T08:00:00+07:00`));
    assert.ok(!reconciled.morning?.people.some((p) => p.id === '')); // POS ngoài phạm vi bị bỏ ở cả hai nguồn.
    const morning = reconciled.morning;
    for (let hour = 8; hour <= 23; hour++) {
      for (const minute of ['00', '30']) await maybeForecastTick(new Date(`${date}T${String(hour).padStart(2, '0')}:${minute}:00+07:00`));
    }
    const end = await readForecast(db, date);
    assert.ok(end!.points.length <= 34); assert.equal(end!.points.at(-1)?.t, '23:30');
    assert.deepEqual(end?.morning, morning);
    const count = writes;
    await maybeForecastTick(new Date(`${date}T23:35:00+07:00`));
    assert.equal(writes, count);
  } finally { raw.close(); }
});
