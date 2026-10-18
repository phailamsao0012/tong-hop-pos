import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { STUCK_DEFAULTS, buildStuckMessage, parseStuckConfig, readStuckConfig, runStuckAlert, shouldSendStuck } from '../lib/stuck-alert';
import { GET, PUT, POST } from '../app/api/stuck-alert/route';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
const now = Date.parse('2026-10-15T03:00:00Z');
const config = { ...STUCK_DEFAULTS, enabled: true, chatId: '-1000001' };
function fixture() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE pos_shops(id TEXT); INSERT INTO pos_shops VALUES ('demo');
    CREATE TABLE pos_users(pos_id TEXT,user_id TEXT,name TEXT); INSERT INTO pos_users VALUES ('demo','a','NV A');
    CREATE TABLE raw_pos_orders(id TEXT,pos_id TEXT,status_code INTEGER,created_at TEXT,seller_id TEXT,creator_id TEXT);
    CREATE INDEX idx_raw_orders_pos_status_origin ON raw_pos_orders(pos_id,status_code,created_at);`);
  const stmt = (sql: string, args: (string | number | null)[] = []): unknown => ({
    bind: (...a: (string | number | null)[]) => stmt(sql, a),
    first: async () => raw.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...args).changes) } }),
  });
  const db = { prepare: stmt } as unknown as D1Database;
  const insert = (id: string, hours: number, status = 0) => raw.prepare('INSERT INTO raw_pos_orders VALUES (?,?,?,?,?,?)').run(id, 'demo', status, new Date(now - hours * 3600000).toISOString().slice(0,19), 'a', null);
  insert('old', 25); insert('waiting', 49, 17); insert('boundary',24); insert('confirmed',50,1); insert('too-old',721);
  return { raw, db, insert };
}
void test('mặc định tắt; kiểm tra cấu hình chặt', async () => {
  const {raw,db} = fixture();
  assert.deepEqual(await readStuckConfig(db), STUCK_DEFAULTS);
  assert.equal((await runStuckAlert(db, { demo: false })).reason, 'disabled');
  for (const value of [null, {...config,hours:0}, {...config,chatId:''}, {...config,perSellerMax:0}, {...config,enabled:'yes'}]) assert.throws(() => parseStuckConfig(value));
  raw.close();
});
void test('tin chỉ tên NV và số lượng; không lộ tên khách, SĐT; escape HTML và giới hạn độ dài', () => {
  const row = {id:'o1',seller:'a',name:'NV A <A>',phone:'0900000001',customerName:'Khách A'};
  const message = buildStuckMessage([row],config);
  assert.ok(message.includes('NV A &lt;A&gt;: 1 đơn'));
  assert.ok(!message.includes(row.phone) && !message.includes(row.customerName) && !message.includes(row.id));
  assert.ok(buildStuckMessage(Array.from({length:200},(_,i) => ({id:String(i),seller:String(i),name:'NV A'.repeat(30)})),config).length < 4096);
});
void test('chống lặp đúng biên 3 giờ và cho phép danh sách đổi', () => {
  const last = {signature:'a',at:now};
  assert.equal(shouldSendStuck(last,'a',now+3*3600000-1),false);
  assert.equal(shouldSendStuck(last,'a',now+3*3600000),true);
  assert.equal(shouldSendStuck(last,'b',now),true);
});
void test('SQL đúng trạng thái, >24h, 30 ngày; gửi một tin; chống lặp và thử lại sau gửi lỗi', async () => {
  const {raw,db,insert} = fixture(); let calls=0;
  const send = async () => {calls++;};
  const opts = {demo:false,now,config,send};
  const first = await runStuckAlert(db,opts);
  assert.equal(first.sent,true); assert.ok(first.message.includes('Tổng: 2 đơn'));
  assert.equal((await runStuckAlert(db,opts)).reason,'duplicate'); assert.equal(calls,1);
  insert('changed',26);
  await assert.rejects(runStuckAlert(db,{...opts,send:async()=>{throw new Error('fake failure');}}));
  assert.equal((await runStuckAlert(db,opts)).sent,true); assert.equal(calls,2);
  raw.close();
});
void test('demo và dry chỉ xem trước, không gọi transport, không ghi dấu', async () => {
  const {raw,db} = fixture();
  const send = async () => {throw new Error('must not send');};
  for(const opts of [{demo:true},{demo:false,dry:true}]) {
    const result = await runStuckAlert(db,{...opts,config,now,send});
    assert.equal(result.sent,false); assert.ok(result.message.includes('NV A'));
  }
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM app_settings').get()!.n,0);
  raw.close();
});
void test('API owner only; demo xem trước 200, cấm lưu và POST không dry', async () => {
  const {raw} = emptyDb({DEMO_MODE:'1'});
  logout(); assert.equal((await GET()).status,401);
  for(const role of ['staff','lead','director'] as const) {
    await loginAs(raw,role);
    assert.equal((await GET()).status,403);
    assert.equal((await PUT(new Request('http://localhost/api/stuck-alert',{method:'PUT'}))).status,403);
    assert.equal((await POST(new Request('http://localhost/api/stuck-alert?dry=1',{method:'POST'}))).status,403);
  }
  await loginAs(raw,'owner'); assert.deepEqual(await (await GET()).json(),STUCK_DEFAULTS);
  assert.equal((await PUT(new Request('http://localhost/api/stuck-alert',{method:'PUT'}))).status,403);
  assert.equal((await POST(new Request('http://localhost/api/stuck-alert',{method:'POST'}))).status,400);
  const preview = await POST(new Request('http://localhost/api/stuck-alert?dry=1',{method:'POST'}));
  assert.equal(preview.status,200); assert.equal((await preview.json() as {reason:string}).reason,'demo');
  logout(); Object.assign(env,{DEMO_MODE:'0'}); raw.close();
});
