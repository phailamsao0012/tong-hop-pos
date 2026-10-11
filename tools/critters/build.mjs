// Dựng sẵn markup 4 cảnh con vật chờ tải (gà, bò, trứng, lợn) rồi ghi vào app/loading-critter/scenes.ts.
// Chạy: node tools/critters/build.mjs   (cần Playwright + Chromium, như scripts/kiem-trinh-duyet.cjs;
// có thể chỉ đường tới gói playwright bằng biến PLAYWRIGHT_MODULE).
//
// "Lớp hoá": mỗi nhóm SVG cử động (class lc-wc / lc-lx) thành một <div class="lc-lp …"> vừa khít hộp bao nội dung của nó,
// bên trong là <svg> riêng có viewBox = hộp đó; hình đứng yên liền nhau gom chung một <svg class="lc-ly">. Gốc xoay đổi px → %.
// Lý do: transform trên phần tử bên trong SVG làm trình duyệt vẽ lại SVG trên luồng chính mỗi khung hình;
// transform trên <div> chạy trên compositor. Cần trình duyệt để đo hộp bao (getBBox), nên làm một lần ở đây, không làm lúc chạy.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './scenes-src.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const OUT = fileURLToPath(new URL('../../app/loading-critter/scenes.ts', import.meta.url));
const START = '// @generated-start (tools/critters/build.mjs — đừng sửa tay)', END = '// @generated-end';

function layerize(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const v = svg.viewBox.baseVal, FULL = { x: v.x, y: v.y, w: v.width, h: v.height };
  const root = document.createElement('div');
  root.className = svg.getAttribute('class');
  const SHAPES = 'path,circle,ellipse,rect,line,polyline,polygon';
  const isPart = (n) => n.classList.contains('lc-wc') || n.classList.contains('lc-lx');
  // Hộp bao nội dung "của riêng" một bộ phận (không tính bộ phận con), nới 2 đơn vị cho nét.
  const own = (g) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const list = [...g.querySelectorAll(SHAPES)].filter((e) => !e.closest('clipPath') && e.parentElement.closest('.lc-wc, .lc-lx, svg') === g);
    for (const e of list) { const b = e.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
    return x0 < Infinity ? { x: x0 - 2, y: y0 - 2, w: x1 - x0 + 4, h: y1 - y0 + 4 } : null;
  };
  const r = (n) => +n.toFixed(3);
  const P = (a, b) => r(a / b * 100) + '%';
  const layer = (dst, f) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `${r(f.x)} ${r(f.y)} ${r(f.w)} ${r(f.h)}`);
    s.setAttribute('class', 'lc-ly');
    dst.appendChild(s);
    return s;
  };
  const build = (src, dst, f) => {
    let ly = null;
    for (const n of Array.from(src.children)) {
      const part = isPart(n), host = !part && n.tagName === 'g' && n.querySelector('.lc-wc, .lc-lx');
      if (!part && !host) { (ly ||= layer(dst, f)).appendChild(n); continue; }
      if (part && n.tagName !== 'g') throw new Error('bộ phận cử động phải là <g>: ' + n.outerHTML.slice(0, 80));
      ly = null;
      const b = (part && own(n)) || f, d = document.createElement('div');
      d.className = 'lc-lp ' + (n.getAttribute('class') || '');
      d.setAttribute('style', `left:${P(b.x - f.x, f.w)};top:${P(b.y - f.y, f.h)};width:${P(b.w, f.w)};height:${P(b.h, f.h)}`);
      const m = (n.getAttribute('style') || '').match(/transform-origin:\s*([-\d.]+)px ([-\d.]+)px/);
      if (m) d.style.transformOrigin = `${P(m[1] - b.x, b.w)} ${P(m[2] - b.y, b.h)}`;
      build(n, d, b);
      dst.appendChild(d);
    }
  };
  build(svg, root, FULL);
  svg.replaceWith(root);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
await page.addScriptTag({ content: `window.layerize = ${layerize.toString()};` });
const out = {};
for (const [id, html] of Object.entries(SOURCES)) {
  out[id] = await page.evaluate((h) => {
    const d = document.createElement('div');
    d.innerHTML = h;
    document.body.appendChild(d);
    d.querySelectorAll('svg.lc-cr').forEach(window.layerize);
    const s = d.innerHTML;
    d.remove();
    return s;
  }, html);
}
await browser.close();

const block = `${START}\n/** Markup đã lớp hoá của từng cảnh; "__ID" = mã riêng của mỗi lần gắn. */\nconst MARKUP: Record<Exclude<SceneId, 'mg'>, string> = {\n${Object.entries(out).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n')}\n};\n${END}`;
const ts = readFileSync(OUT, 'utf8');
const a = ts.indexOf(START), b = ts.indexOf(END);
if (a < 0 || b < a) throw new Error('scenes.ts thiếu dấu @generated-start / @generated-end');
writeFileSync(OUT, ts.slice(0, a) + block + ts.slice(b + END.length));
for (const [k, v] of Object.entries(out)) console.log(k, v.length, 'B,', gzipSync(v).length, 'B gzip');
