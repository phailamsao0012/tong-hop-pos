import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { photoRetry, sendZaloPhoto } from '../lib/zalo/zalo';

// 17/11/2026: ảnh báo cáo sếp 12h, 17h không tới Zalo (web bận). Vẽ sẵn ảnh trước, Zalo từ chối thì ghi lý do và gửi lại 1 lần.
void test('gửi ảnh Zalo: vẽ sẵn ảnh trước, lần 1 bị từ chối thì ghi lý do và gửi lại; 2 lần đều lỗi thì trả false', async () => {
  const { raw } = emptyDb();
  const original = globalThis.fetch, errors: string[] = [], originalError = console.error;
  photoRetry.ms = 0;
  console.error = (...a: unknown[]) => { errors.push(a.join(' ')); };
  try {
    const calls: string[] = [];
    let zaloCalls = 0, failFirst = 1;
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      calls.push(u.includes('zaloplatforms') ? 'zalo' : 'anh');
      if (!u.includes('zaloplatforms')) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
      zaloCalls++;
      return zaloCalls <= failFirst ? Response.json({ ok: false, error_code: 408, description: 'Không tải được ảnh' }, { status: 400 }) : Response.json({ ok: true, result: {} });
    }) as typeof fetch;
    assert.equal(await sendZaloPhoto('khoa-gia', 'chat-1', 'https://web.test/api/zalo/anh/abc', 'chú thích'), true);
    assert.deepEqual(calls, ['anh', 'zalo', 'zalo'], 'vẽ sẵn ảnh trước rồi mới gọi Zalo; lần 1 lỗi thì gửi lại');
    assert.ok(errors.some((e) => e.includes('HTTP 400') && e.includes('mã 408') && e.includes('Không tải được ảnh')), 'log có lý do');
    assert.ok(!errors.some((e) => e.includes('khoa-gia')), 'log không có khoá bot');
    calls.length = 0; zaloCalls = 0; failFirst = 2;
    assert.equal(await sendZaloPhoto('khoa-gia', 'chat-1', 'https://web.test/api/zalo/anh/abc', 'chú thích'), false, '2 lần lỗi: nơi gọi gửi bản chữ');
    assert.deepEqual(calls, ['anh', 'zalo', 'zalo'], 'chỉ gửi lại 1 lần');
  } finally { globalThis.fetch = original; console.error = originalError; photoRetry.ms = 20000; raw.close(); }
});
