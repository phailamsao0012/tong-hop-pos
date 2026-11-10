import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceRoute, constantEqual, tokenHash, pairUsable, authorizeDevice, changePair, requestPair, type DevicePair } from '../lib/auth/device-pair';
const pair: DevicePair={id:'fake',device:'PC',tokenHash:'a'.repeat(64),code:'123456',created:1,expires:100,status:'pending'};
void test('device-pair: pending, duyệt, thu hồi và so hash', async () => {
 assert.equal(pairUsable(pair,50),false);
 assert.equal(pairUsable({...pair,status:'approved'},200),true);
 assert.equal(pairUsable({...pair,status:'revoked'},50),false);
 assert.equal(constantEqual(await tokenHash('a'),await tokenHash('a')),true);
 assert.equal(constantEqual('a'.repeat(64),'b'.repeat(64)),false);
});
void test('device-pair: sai khóa 401 ở route, chỉ cho đúng hai method/path', async () => {
 const db={prepare:()=>({all:async()=>({results:[]})})} as unknown as D1Database;
 assert.equal(await authorizeDevice(db,new Request('https://example.com/api/ai/pack',{headers:{Authorization:'Bearer '+ 'b'.repeat(64)}})),false);
 assert.equal(await authorizeDevice(db,new Request('https://example.com/api/users')),false);
});
void test('device-pair: duyệt hết hạn bị SQL chặn, quá rate bị từ chối', async () => {
 let binds: unknown[]=[];
 const db={prepare:(_sql:string)=>({bind:(...values:unknown[])=>{binds=values; return {run:async()=>({meta:{changes:0}}),first:async()=>({value:'4'})};}})} as unknown as D1Database;
 assert.equal(await changePair(db,'fake','approve',101),false);
 assert.deepEqual(binds,['approved','ai_pair:fake','approve',101]);
 await assert.rejects(requestPair(db,'a'.repeat(64),'local',10),/Quá giới hạn/);
});

void test('device-pair: SQLite duyệt, hết hạn, thu hồi, giới hạn 3 pending và 3 lần/IP', async () => {
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)');
 const db = { prepare(sql: string) {
   const statement = sqlite.prepare(sql);
   return { bind(...args: (string | number | null)[]) { return {
     first: async () => statement.get(...args) ?? null,
     run: async () => ({ meta: { changes: Number(statement.run(...args).changes) } }),
   }; }, all: async () => ({ results: statement.all() }) };
 } } as unknown as D1Database;
 try {
   const token = 'b'.repeat(64), hash = await tokenHash(token);
   const pending = await requestPair(db, hash, 'local', Date.now());
   const request = new Request('https://example.com/api/ai/pack', { headers: { Authorization: `Bearer ${token}` } });
   assert.equal(await authorizeDevice(db, request), false);
   assert.equal(await changePair(db, pending.id, 'approve'), true);
   assert.equal(await authorizeDevice(db, request), true);
   assert.equal(await changePair(db, pending.id, 'revoke'), true);
   assert.equal(await authorizeDevice(db, request), false);
   const expired = await requestPair(db, hash, 'expiry', 1);
   assert.equal(await changePair(db, expired.id, 'approve', 86400002), false);
   const now = Date.now();
   for (let i=0;i<3;i++) await requestPair(db, hash, 'limit', now);
   await assert.rejects(requestPair(db, hash, 'other-ip', now), /Đã có 3 yêu cầu chờ/);
   await assert.rejects(requestPair(db, hash, 'limit', now), /Quá giới hạn/);
 } finally { sqlite.close(); }
});

void test('S1: deviceRoute chỉ mở đúng ba method/path và Bearer đúng dạng', () => {
 const auth = 'Bearer ' + 'a'.repeat(64);
 for (const [method, path] of [['POST','pair'],['GET','pack'],['POST','insights']]) assert.equal(deviceRoute(method, '/api/ai/' + path, auth), true);
 assert.equal(deviceRoute('POST','/api/ai/pair',null),true);
 for (const [method,path] of [['PATCH','pair'],['GET','pair'],['GET','insights'],['POST','pack'],['GET','other']]) assert.equal(deviceRoute(method,'/api/ai/'+path,auth),false);
 for (const auth of [null,'','Basic abc','Bearer abc','Bearer '+'A'.repeat(64)]) {
  assert.equal(deviceRoute('GET','/api/ai/pack',auth),false);
  assert.equal(deviceRoute('POST','/api/ai/insights',auth),false);
 }
});
