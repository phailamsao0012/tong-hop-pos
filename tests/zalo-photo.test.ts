import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { photoRetry, sendZaloPhoto } from '../lib/zalo/zalo';

// 16–17/11/2026: ảnh báo cáo sếp không tới Zalo, chỉ còn tin chữ. Đường ảnh trên tên miền cũ trả 307 sang tên miền mới.
// Bot tự tải ảnh trước (vẽ sẵn + lấy đường cuối sau chuyển hướng), đưa Zalo đường đó; Zalo từ chối thì ghi lý do, gửi lại 1 lần.
const OLD = 'https://ten-mien-cu.test/api/zalo/anh/abc', NEW = 'https://ten-mien-moi.test/api/zalo/anh/abc';
const imageResponse = (url: string) => {
  const r = new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
  Object.defineProperty(r, 'url', { value: url });
  return r;
};

void test('gửi ảnh Zalo: tải ảnh trước, đưa Zalo đường sau chuyển hướng; lần 1 bị từ chối thì ghi lý do và gửi lại; 2 lần lỗi thì trả false', async () => {
  const { raw } = emptyDb();
  const original = globalThis.fetch, errors: string[] = [], originalError = console.error;
  photoRetry.ms = 0;
  console.error = (...a: unknown[]) => { errors.push(a.join(' ')); };
  try {
    const calls: string[] = [], sentPhotos: string[] = [];
    let zaloCalls = 0, failFirst = 1;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (!u.includes('zaloplatforms')) { calls.push('anh'); return imageResponse(NEW); }
      calls.push('zalo'); zaloCalls++;
      sentPhotos.push((JSON.parse(init?.body as string) as { photo: string }).photo);
      return zaloCalls <= failFirst ? Response.json({ ok: false, error_code: 408, description: 'Không tải được ảnh' }, { status: 400 }) : Response.json({ ok: true, result: {} });
    }) as typeof fetch;
    assert.equal(await sendZaloPhoto('khoa-gia', 'chat-1', OLD, 'chú thích'), true);
    assert.deepEqual(calls, ['anh', 'zalo', 'zalo'], 'tải ảnh trước rồi mới gọi Zalo; lần 1 lỗi thì gửi lại');
    assert.deepEqual(sentPhotos, [NEW, NEW], 'Zalo nhận đường trên tên miền mới (sau chuyển hướng)');
    assert.ok(errors.some((e) => e.includes('HTTP 400') && e.includes('mã 408') && e.includes('Không tải được ảnh')), 'log có lý do');
    assert.ok(!errors.some((e) => e.includes('khoa-gia')), 'log không có khoá bot');
    calls.length = 0; sentPhotos.length = 0; zaloCalls = 0; failFirst = 2;
    assert.equal(await sendZaloPhoto('khoa-gia', 'chat-1', OLD, 'chú thích'), false, '2 lần lỗi: nơi gọi gửi bản chữ');
    assert.deepEqual(calls, ['anh', 'zalo', 'zalo'], 'chỉ gửi lại 1 lần');
    // Tải ảnh trước bị lỗi (không phải ảnh): vẫn gửi Zalo đường gốc như cũ.
    sentPhotos.length = 0;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      if (!String(url).includes('zaloplatforms')) return new Response('lỗi', { status: 500 });
      sentPhotos.push((JSON.parse(init?.body as string) as { photo: string }).photo);
      return Response.json({ ok: true, result: {} });
    }) as typeof fetch;
    assert.equal(await sendZaloPhoto('khoa-gia', 'chat-1', OLD, 'chú thích'), true);
    assert.deepEqual(sentPhotos, [OLD]);
    assert.ok(errors.some((e) => e.includes('zalo photo warm: HTTP 500')));
  } finally { globalThis.fetch = original; console.error = originalError; photoRetry.ms = 20000; raw.close(); }
});
