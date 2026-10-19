import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import { askClaude, AskError, askHistory, ASK_TOOLS } from '../lib/ai-ask';
import { buildAskPack, hoursCsv, limitAskPack, peopleCsv, runAskTool, todayAskPack } from '../lib/ai-ask-pack';
import { readSpend } from '../lib/claude';
import { GET, POST } from '../app/api/ai/ask/route';
import { emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { parseAccess, scopeApi } from '../lib/access';
import { addDays, todayVn, vnDayStartUtc } from '../lib/report-time';
import { POS } from '../lib/report-model';

function seed(raw: ReturnType<typeof emptyDb>['raw'], today: string) {
  const pos = POS[0].id;
  for (const [id,name] of [['NV_A','TEN_GIA_LAP SALE'],['NV_B','TEN_KHAC MKT'],['NV_X','KHONG_TINH']]) {
    raw.prepare('INSERT INTO pos_users(id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)').run(id,pos,id,name,today);
    for (let i=-56;i<=0;i++) {
      const day=addDays(today,i);
      raw.prepare('INSERT INTO stats_daily(id,pos_id,day,seller_id,assigned_orders,assigned_closed_orders,closed_orders,closed_net,returned_orders,updated_at) VALUES (?,?,?,?,10,3,4,1500000,1,?)').run(`${id}:${day}`,pos,day,id,today);
    }
    const at=vnDayStartUtc(addDays(today,-1));
    raw.prepare('INSERT INTO raw_pos_orders(id,pos_id,shop_id,source_order_id,seller_id,seller_assigned_at,first_closed_at,status_code,net_total,fetched_at,raw_json) VALUES (?,?,?,?,?,?,?,0,1500000,?,?)').run(id,pos,'demo',id,id,at,at,today,JSON.stringify({ name: 'KHACH_GIA_LAP',note:'GHI_CHU_GIA_LAP gia cao',email: 'demo@'+'example.invalid',phone: '0'.repeat(10) }));
  }
  raw.prepare('INSERT INTO ad_costs(id,day,marketer_id,amount,note,created_at,updated_at) VALUES (?,?,?,250000,?,?,?)').run('demo',addDays(today,-1),'NV_B','GHI_CHU_CHI_PHI',today,today);
  raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_forecast:${today}`,JSON.stringify({ points:[{ t:'10:30',actual:1000000,today:2000000,week:7000000 }],name:'KHACH_GIA_LAP',note:'GHI_CHU_GIA_LAP' }),today);
}
const clientOf = (create: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<unknown>) => ({ messages: { create } }) as unknown as Pick<Anthropic,'messages'>;
const response = (reason='end_turn', content: unknown[]=[{ type:'text',text:'[[nv:NV_A]]' }]) => ({ stop_reason:reason,content,usage:{ input_tokens:100,output_tokens:20,cache_read_input_tokens:10,cache_creation_input_tokens:30 } });
void test('Ask pack: byte ổn định, counted, tiền cố định, nguồn giờ/lý do/chi phí và không lộ dữ liệu cá nhân',async t => {
  t.mock.method(globalThis,'fetch',() => { throw new Error('Không gọi mạng'); });
  const {raw,db}=emptyDb({DEMO_MODE:'1'});
  try {
    const today=todayVn(); seed(raw,today);
    const a=await buildAskPack(db,today),b=await buildAskPack(db,today);
    assert.deepEqual(Buffer.from(a),Buffer.from(b));
    for (const forbidden of ['TEN_GIA_LAP','TEN_KHAC','KHACH_GIA_LAP','GHI_CHU_GIA_LAP','GHI_CHU_CHI_PHI','example.invalid','0'.repeat(10),'NV_X']) assert.ok(!a.includes(forbidden),forbidden);
    assert.match(a,/NV_A;other;;10;3;4;1\.5;1/);
    assert.match(a,/NV_A;Giá cao;1/); assert.match(a,/;0\.3/);
    const hours=await hoursCsv(db,addDays(today,-1),addDays(today,-1),null);
    assert.match(hours,/;0;2;0;0\.0/); // trạng thái mới không phải chốt trong số chia
    assert.ok(!(await hoursCsv(db,addDays(today,-1),addDays(today,-1),['NV_X'])).includes(';0;'));
    const current=await todayAskPack(db,today);
    assert.match(current,/10:30;1\.0;2\.0;7\.0/); assert.ok(!current.includes('KHACH_GIA_LAP'));
    const all=await peopleCsv(db,addDays(today,-1),today,['NV_A'],'ca_ky'); assert.match(all,/ca_ky;NV_A;other;;20;6;8;3\.0;2/);
    const demo=await askClaude(db,'So sánh số được chia',{userId:'OWNER_DEMO'},{mode:'demo'});
    assert.match(demo.answer,/^\(Trả lời mẫu/); assert.equal(demo.usd,0);
    assert.equal((await readSpend(db,today.slice(0,7))).calls,0);
    t.diagnostic(`Demo local SQLite: pack=${a.length} ký tự; ${JSON.stringify(demo)}`);
  } finally {raw.close();}
});
void test('Ask pack lớn: bỏ tuần cũ nhất, có thông báo; phần còn lại quá lớn thì báo lỗi',() => {
  const weeks=Array.from({length:8},(_,i)=>({week:`W${i}`,csv:`W${i}\n${'x'.repeat(30000)}`}));
  const pack=limitAskPack(weeks,'NGAY');
  assert.match(pack,/đã bỏ tuần W0 vì gói quá lớn/); assert.ok(!pack.includes('W0\n')); assert.ok(pack.includes('W7\n')); assert.ok(pack.length<=200000);
  assert.throws(()=>limitAskPack([], 'x'.repeat(200001)),/quá lớn/);
});
void test('Công cụ: schema strict, khoảng quá dài, ngày sai, mã và thuộc tính sai; không chạy SQL khi sai',async () => {
  for (const tool of ASK_TOOLS) {assert.equal(tool.strict,true); assert.equal(tool.input_schema.additionalProperties,false);}
  const db={prepare:()=>{throw new Error('Không được đọc');}} as unknown as D1Database;
  for (const [name,input] of [
    ['so_lieu_nguoi',{tu:'2026-01-01',den:'2026-05-01',ma_nv:null,gom:'ngay'}],
    ['gio_vang',{tu:'2026-01-01',den:'2026-02-01',ma_nv:null}],
    ['gio_vang',{tu:'2026-02-30',den:'2026-03-01',ma_nv:null}],
    ['gio_vang',{tu:'2025-02-28',den:'2025-03-01',ma_nv:null}],
    ['gio_vang',{tu:'2026-10-19',den:'2026-10-20',ma_nv:null}],
    ['gio_vang',{tu:'2026-10-01',den:'2026-10-02',ma_nv:['x;injection']}],
    ['gio_vang',{tu:'2026-10-01',den:'2026-10-02',ma_nv:null,extra:1}],
    ['unknown',{}],
  ] as const) assert.equal((await runAskTool(db,'2026-10-19',name,input)).is_error,true);
});
void test('Vòng công cụ giả: giữ thinking, mọi kết quả trong một tin, cache tách hôm nay, cộng mọi usage và lưu mã',async t => {
  t.mock.method(globalThis,'fetch',()=>{throw new Error('Không gọi mạng');});
  const {raw,db}=emptyDb({DEMO_MODE:'1'});
  try {
    const today=todayVn();seed(raw,today);let calls=0;
    const content=[{type:'thinking',thinking:'SUY_NGHI_GIA',signature:'GIA'},{type:'tool_use',id:'T1',name:'so_lieu_nguoi',input:{tu:today,den:today,ma_nv:null,gom:'ngay'}},{type:'tool_use',id:'T2',name:'gio_vang',input:{tu:addDays(today,-1),den:today,ma_nv:['NV_A']}}];
    const client=clientOf(async params=>{
      calls++;
      assert.equal(params.max_tokens,8000);assert.deepEqual(params.tool_choice,{type:'auto'});assert.equal(params.output_config?.effort,'medium');
      const system=params.system as Anthropic.TextBlockParam[];assert.equal(system.length,2);assert.deepEqual(system[1].cache_control,{type:'ephemeral'});assert.ok(!system[1].text.includes('10:30'));
      assert.ok(!JSON.stringify(params).includes('TEN_GIA_LAP'));
      if(calls===1)return response('tool_use',content);
      assert.equal(params.messages.length,3);assert.deepEqual(params.messages[1].content,content);
      const results=params.messages[2].content as Anthropic.ToolResultBlockParam[];
      assert.equal(results.length,2);assert.deepEqual(results.map(r=>r.tool_use_id),['T1','T2']);assert.ok(results.every(r=>!r.is_error));
      return response();
    });
    const r=await askClaude(db,'TEN_GIA_LAP SALE so sánh số',{userId:'OWNER_DEMO'},{mode:'live',client});
    assert.equal(calls,2);assert.equal(r.answer,'TEN_GIA_LAP SALE');assert.equal(r.usd,0.000954);
    const history=await askHistory(db);assert.equal(history.spend.calls,2);assert.equal(history.history.length,1);assert.equal(history.history[0].usage.input,200);
    const saved=raw.prepare("SELECT value FROM app_settings WHERE key GLOB 'ai_ask:*'").get()!;
    assert.match(String(saved.value),/\[\[nv:NV_A\]\]/);assert.ok(!String(saved.value).includes('TEN_GIA_LAP'));
  }finally{raw.close();}
});
void test('Vòng công cụ: dừng ở 4, refusal không đọc text, max_tokens, lỗi SDK không lộ nội dung',async () => {
  const {raw,db}=emptyDb({DEMO_MODE:'1'});
  try {
    seed(raw,todayVn());let calls=0;
    const looping=clientOf(async()=>{calls++;return response('tool_use',[{type:'tool_use',id:`T${calls}`,name:'unknown',input:{}}]);});
    const r=await askClaude(db,'Câu hẹp',{userId:'OWNER_DEMO'},{mode:'live',client:looping});assert.equal(calls,4);assert.match(r.answer,/anh hỏi hẹp/);
    await assert.rejects(askClaude(db,'Câu hẹp',{userId:'OWNER_DEMO'},{mode:'live',client:clientOf(async()=>response('refusal',[{type:'text',text:'KHONG_DUOC_DOC'}]))}),/Claude từ chối/);
    const cut=await askClaude(db,'Câu hẹp',{userId:'OWNER_DEMO'},{mode:'live',client:clientOf(async()=>response('max_tokens'))});assert.match(cut.answer,/bị cắt/);
    await assert.rejects(askClaude(db,'Câu hẹp',{userId:'OWNER_DEMO'},{mode:'live',client:clientOf(async()=>{throw new Error('NOI_DUNG_RIENG');})}),/Không thể trả lời/);
    assert.equal((await readSpend(db,todayVn().slice(0,7))).calls,6);
    assert.ok(!(await askHistory(db)).history.some(r=>r.a.includes('KHONG_DUOC_DOC')||r.a.includes('NOI_DUNG_RIENG')));
  }finally{raw.close();}
});
void test('Trần 40 câu, tiền, off, câu hỏi sai và liên hệ cá nhân',async () => {
  const {raw,db}=emptyDb({DEMO_MODE:'1'});
  try {
    const today=todayVn();seed(raw,today);
    for (const q of [null,{},'', 'x'.repeat(1001),'demo@'+'example.invalid','0'.repeat(10)]) await assert.rejects(askClaude(db,q,{userId:'OWNER_DEMO'}),e=>e instanceof AskError && e.status===400);
    await assert.rejects(askClaude(db,'Câu hợp lệ',{userId:'OWNER_DEMO'},{mode:'off'}),e=>e instanceof AskError && e.status===503);
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_spend:${today.slice(0,7)}`,JSON.stringify({usd:30,calls:1}),today);
    await assert.rejects(askClaude(db,'Câu hợp lệ',{userId:'OWNER_DEMO'},{mode:'demo'}),e=>e instanceof AskError && e.status===429 && /chi phí/.test(e.message));
    raw.prepare('DELETE FROM app_settings WHERE key GLOB ?').run('ai_spend:*');
    assert.equal(raw.prepare('SELECT value FROM app_settings WHERE key=?').get(`ai_ask_count:${today}`), undefined);
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_ask_count:${today}`,'39',today);
    assert.equal((await askClaude(db,'Câu hợp lệ',{userId:'OWNER_DEMO'},{mode:'demo'})).used,40);
    await assert.rejects(askClaude(db,'Câu hợp lệ',{userId:'OWNER_DEMO'},{mode:'demo'}),/đủ 40 câu/);
  }finally{raw.close();}
});
void test('Route ask: 403 các vai trò khác, owner POST demo và GET lịch sử 20 câu trong 7 ngày',async () => {
  const {raw,db}=emptyDb({DEMO_MODE:'1'});
  try {
    const today=todayVn();seed(raw,today);
    for(const role of ['director','lead','staff'] as const){
      await loginAs(raw,role,{views:['center']});
      for(const method of ['GET','POST'])assert.ok(scopeApi(parseAccess({role,views_json:'["center"]'}),method,new URL('http://localhost/api/ai/ask')).blocked);
      assert.equal((await GET()).status,403);assert.equal((await POST(new Request('http://localhost/api/ai/ask',{method:'POST',body:'{}'}))).status,403);
    }
    await loginAs(raw,'owner');
    assert.equal((await POST(new Request('http://localhost/api/ai/ask',{method:'POST',body:'null'}))).status,400);
    const r=await POST(new Request('http://localhost/api/ai/ask',{method:'POST',body:JSON.stringify({question:'Số được chia hôm qua?'})}));assert.equal(r.status,200);assert.match((await r.json() as {answer:string}).answer,/Trả lời mẫu/);
    const record={q:'Câu hỏi',a:'[[nv:UNKNOWN]]',usage:{input:0,output:0,cacheRead:0,cacheWrite:0},usd:0,at:today,by:'OWNER_DEMO',mode:'demo'};
    for(let n=2;n<=25;n++)raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_ask:${today}:${String(n).padStart(3,'0')}`,JSON.stringify(record),today);
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_ask:${addDays(today,-7)}:001`,JSON.stringify(record),today);
    const history=await askHistory(db);assert.equal(history.history.length,20);assert.ok(history.history.every(r=>r.a==='nhân viên không rõ'));
    const get=await GET();assert.equal(get.status,200);assert.equal(get.headers.get('Cache-Control'),'no-store');
  }finally{raw.close();}
});

void test('Demo world local: gói số và câu hỏi mẫu từ bộ dữ liệu demo hiện có',async t => {
  t.mock.method(globalThis,'fetch',()=>{throw new Error('Không gọi mạng');});
  const { demoWorld } = await import('./support/d1-sqlite');
  const today=todayVn(), yesterday=addDays(today,-1);
  const {raw,db}=await demoWorld([yesterday,today],Date.parse(`${today}T10:00:00+07:00`));
  try {
    const started=performance.now(), pack=await buildAskPack(db,today), elapsed=performance.now()-started;
    const result=await askClaude(db,'Giờ nào số về nhiều mà chốt ít?',{userId:'OWNER_DEMO'},{mode:'demo'});
    assert.match(result.answer,/Trả lời mẫu/);assert.equal(result.usd,0);assert.ok(pack.length>0 && pack.length<=200000);
    t.diagnostic(`Bộ demo world local (hôm qua + hôm nay): pack=${pack.length} ký tự, ${Math.round(elapsed)} ms; ${JSON.stringify(result)}`);
  }finally{raw.close();}
});

void test('Công cụ giới hạn 3.000 dòng nhưng gói tuần lớn vẫn được đọc để cắt theo tuần',async () => {
  const {raw,db}=emptyDb();
  try {
    const today=todayVn();
    for(let n=0;n<34;n++){
      const id=`NV_${n}`;
      raw.prepare('INSERT INTO pos_users(id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)').run(id,POS[0].id,id,'TEN_GIA_LAP SALE',today);
      for(let d=0;d<92;d++)raw.prepare('INSERT INTO stats_daily(id,pos_id,day,seller_id,assigned_orders,updated_at) VALUES (?,?,?,?,1,?)').run(`${id}:${d}`,POS[0].id,addDays(today,-d),id,today);
    }
    const result=await runAskTool(db,today,'so_lieu_nguoi',{tu:addDays(today,-91),den:today,ma_nv:null,gom:'ngay'});
    assert.equal(result.is_error,true);assert.match(result.content,/3.000/);
    assert.equal((await peopleCsv(db,addDays(today,-91),today,null,'ngay')).split('\n').length,3129);
  }finally{raw.close();}
});
void test('Trần tiền được kiểm lại giữa các lượt công cụ và vẫn lưu usage đã phát sinh',async () => {
  const {raw,db}=emptyDb({DEMO_MODE:'1'});
  try {
    const today=todayVn();seed(raw,today);let calls=0;
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_spend:${today.slice(0,7)}`,JSON.stringify({usd:29.9999,calls:0,input:0,output:0,cacheRead:0,cacheWrite:0}),today);
    const client=clientOf(async()=>{calls++;return response('tool_use',[{type:'tool_use',id:'T1',name:'unknown',input:{}}]);});
    await assert.rejects(askClaude(db,'Câu hợp lệ',{userId:'OWNER_DEMO'},{mode:'live',client}),/chi phí/);
    assert.equal(calls,1);const history=await askHistory(db);assert.equal(history.history[0].usage.input,100);assert.equal(history.spend.calls,1);
  }finally{raw.close();}
});
