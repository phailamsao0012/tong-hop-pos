import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReason, returnReasons, packReturns, returnsQuery } from '../lib/return-reasons';
const row = (reason: string | null, net = 100) => ({reason,net,pos:'POS A',seller:'NV A',product:'Sản phẩm A'});
void test('return-reasons: gom trống, hoa thường, khoảng trắng và Unicode',()=>{
  assert.equal(normalizeReason(null),'Không ghi lý do');
  const groups=returnReasons([row('  Khách   Đổi Ý '),row('khách đổi ý'.normalize('NFD')),row(' '),row(null)]);
  assert.equal(groups.length,2); assert.ok(groups.every(g=>g.orders===2 && g.rate===50 && g.net===200));
});
void test('return-reasons: nhóm POS, người lên đơn, sản phẩm và tập rỗng',()=>{
  for(const dim of ['pos','seller','product'] as const) assert.equal(returnReasons([row('A'),row('B')],dim)[0].orders,2);
  assert.deepEqual(returnReasons([]),[]);
});
void test('return-reasons: giới hạn 5000 và không báo giới hạn khi vừa đủ',()=>{
  assert.equal(packReturns(Array.from({length:5000},()=>row('A'))).limited,false);
  const report=packReturns(Array.from({length:5001},()=>row('A')));
  assert.equal(report.total,5000);assert.equal(report.limited,true);assert.equal(report.reasons[0].net,500000);
});
void test('return-reasons: query giới hạn trước đọc JSON, ngày VN và trạng thái hoàn',()=>{
  const query=returnsQuery(['POS A'],'2026-10-01','2026-10-15','all');
  assert.deepEqual(query.binds,['POS A','2026-08-01T17:00:00','2026-10-15T17:00:00','2026-09-30T17:00:00','2026-10-15T17:00:00']);
  assert.match(query.sql,/MATERIALIZED/);assert.match(query.sql,/IN \(4,15,5\)/);
  assert.ok(query.sql.indexOf('LIMIT 5001')<query.sql.indexOf('json_extract'));
});

void test('return-reasons: giữ nhãn đầu tiên khi gom hoa thường và khoảng trắng', () => {
  const groups = returnReasons([row('Khách đổi ý'), row(' khách  đổi ý ')]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Khách đổi ý');
  assert.equal(groups[0].orders, 2);
  assert.equal(returnReasons([row(' '), row(null)])[0].label, 'Không ghi lý do');
});
