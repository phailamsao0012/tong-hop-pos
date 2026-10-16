// Máy thu kênh Threads cho plan Demo 2 (16/10/2026), bước R0. Chạy từ chay.mjs, không phải Codex.
// Chạy: NODE_PATH=<pw>/node_modules node thu-kenh.cjs <thư mục ra> <tên kênh không @>
// Chỉ đọc trang công khai, không đăng nhập. Ghi: trang-*.png, bai.json, tieu-su.json, anh/*.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.argv[2];
const KENH = process.argv[3] || 'imimran004';
if (!OUT) { console.error('Thiếu thư mục ra.'); process.exit(2); }
fs.mkdirSync(path.join(OUT, 'anh'), { recursive: true });
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

async function dongHop(p) {
  await p.keyboard.press('Escape').catch(() => {});
  for (const ten of ['Close', 'Đóng', 'Not now', 'Lúc khác']) {
    const b = p.getByRole('button', { name: ten }).first();
    if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
  }
}

/** Đọc các bài đang có trên trang (link, giờ, chữ, ảnh). */
const docBai = (p) => p.evaluate((kenh) => {
  const res = [];
  const boxes = document.querySelectorAll('div[data-pressable-container="true"]');
  for (const box of boxes) {
    const a = [...box.querySelectorAll('a[href*="/post/"]')].map((x) => x.href).find((h) => h.includes(`/@${kenh}/post/`));
    if (!a) continue;
    const t = box.querySelector('time')?.getAttribute('datetime') || '';
    const imgs = [...box.querySelectorAll('img')]
      .filter((i) => !/profile picture|ảnh đại diện/i.test(i.alt || '') && (i.naturalWidth || i.width) >= 300)
      .map((i) => i.currentSrc || i.src);
    const vids = [...box.querySelectorAll('video')].map((v) => v.poster).filter(Boolean);
    res.push({ link: a.split('?')[0], gio: t, chu: (box.innerText || '').slice(0, 3000), anh: [...new Set([...imgs, ...vids])] });
  }
  return res;
}, KENH);

async function thuTrang(ctx, url, nhan, bai) {
  const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await ngu(4000); await dongHop(p);
    let dung = 0, lan = 0;
    for (; lan < 80 && dung < 4; lan++) {
      const truoc = bai.size;
      for (const b of await docBai(p)) {
        const cu = bai.get(b.link);
        bai.set(b.link, cu ? { ...cu, anh: [...new Set([...cu.anh, ...b.anh])], chu: cu.chu.length >= b.chu.length ? cu.chu : b.chu } : b);
      }
      if (lan % 4 === 0) await p.screenshot({ path: path.join(OUT, `trang-${nhan}-${String(lan).padStart(2, '0')}.png`) });
      dung = bai.size === truoc ? dung + 1 : 0;
      await p.mouse.wheel(0, 1800); await ngu(1800); await dongHop(p);
    }
    const tieuSu = await p.evaluate(() => ({
      tieuDe: document.title,
      moTa: document.querySelector('meta[name="description"]')?.content || '',
      anhDaiDien: document.querySelector('meta[property="og:image"]')?.content || '',
      link: [...document.querySelectorAll('a[href^="http"]')].map((a) => a.href).filter((h) => !/threads\.(com|net)|instagram\.com\/accounts|facebook\.com\/privacy|help\./.test(h)).slice(0, 20),
    }));
    return { tieuSu, lan };
  } finally { await p.close(); }
}

(async () => {
  const b = await chromium.launch();
  const bai = new Map();
  let tieuSu = {};
  const lam = [];
  for (const [w, h, nhan] of [[1440, 900, '1440'], [390, 844, '390']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'en-US', userAgent: w < 500 ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' : undefined });
    for (const host of ['www.threads.com', 'www.threads.net']) {
      if (host === 'www.threads.net' && bai.size >= 3) break;
      try { const r = await thuTrang(ctx, `https://${host}/@${KENH}`, `${nhan}-${host.split('.')[1]}`, bai); tieuSu = { ...r.tieuSu, ...tieuSu }; lam.push(`${host} ${nhan}: ${r.lan} lượt cuộn`); }
      catch (e) { lam.push(`${host} ${nhan}: lỗi ${e.message.slice(0, 120)}`); }
    }
    // Mở riêng tối đa 25 bài nhiều ảnh nhất (carousel chỉ hiện đủ ảnh ở trang bài).
    if (w === 1440) {
      const top = [...bai.values()].sort((x, y) => y.anh.length - x.anh.length).slice(0, 25);
      for (const t of top) {
        const p = await ctx.newPage();
        try {
          await p.goto(t.link, { waitUntil: 'domcontentloaded', timeout: 45000 }); await ngu(3000); await dongHop(p);
          for (let i = 0; i < 8; i++) {
            const more = await p.evaluate(() => [...document.querySelectorAll('img')].filter((x) => (x.naturalWidth || x.width) >= 300 && !/profile picture/i.test(x.alt || '')).map((x) => x.currentSrc || x.src));
            t.anh = [...new Set([...t.anh, ...more])];
            const next = p.getByRole('button', { name: /next|tiếp/i }).first();
            if (!(await next.isVisible().catch(() => false))) break;
            await next.click().catch(() => {}); await ngu(800);
          }
        } catch (e) { lam.push(`bài ${t.link}: lỗi ${e.message.slice(0, 80)}`); }
        finally { await p.close(); }
      }
    }
    await ctx.close();
  }
  // Tải ảnh (tối đa 150), tên theo thứ tự bài.
  const ctx = await b.newContext();
  const ds = [...bai.values()].sort((x, y) => (y.gio || '').localeCompare(x.gio || ''));
  let n = 0;
  for (const [i, t] of ds.entries()) {
    t.tep = [];
    for (const [j, src] of t.anh.entries()) {
      if (n >= 150) break;
      try {
        const r = await ctx.request.get(src, { timeout: 30000 });
        if (!r.ok()) continue;
        const ct = r.headers()['content-type'] || '';
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
        const ten = `bai${String(i + 1).padStart(3, '0')}-${j + 1}.${ext}`;
        fs.writeFileSync(path.join(OUT, 'anh', ten), await r.body());
        t.tep.push(`anh/${ten}`); n++;
      } catch {}
    }
  }
  if (tieuSu.anhDaiDien) {
    try { const r = await ctx.request.get(tieuSu.anhDaiDien); if (r.ok()) fs.writeFileSync(path.join(OUT, 'anh', 'anh-dai-dien.jpg'), await r.body()); } catch {}
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'bai.json'), JSON.stringify(ds, null, 2));
  fs.writeFileSync(path.join(OUT, 'tieu-su.json'), JSON.stringify({ kenh: `@${KENH}`, ...tieuSu, soBai: ds.length, soAnh: n, thuLuc: new Date().toISOString(), nhatKy: lam }, null, 2));
  console.log(`Thu được ${ds.length} bài, ${n} ảnh. ${lam.join(' | ')}`);
  process.exit(ds.length || fs.readdirSync(OUT).some((f) => f.startsWith('trang-')) ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
