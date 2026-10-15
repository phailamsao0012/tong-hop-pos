// Nguồn vẽ 4 cảnh con vật chờ tải (gà, bò, trứng, lợn) cho app/loading-critter/scenes.ts.
// Không chạy lúc dùng web: tools/critters/build.mjs dựng các chuỗi này, "lớp hoá" bằng trình duyệt rồi ghi kết quả vào scenes.ts.
// Mỗi con vẽ trong khung cao 64 đơn vị, đất ở y = 62. Nhóm cử động liên tục có class lc-wc, nhóm chỉ cử động ở pha xong/lỗi có lc-lx;
// gốc xoay viết theo toạ độ khung vẽ bằng o(x, y). "__ID" được thay bằng mã riêng của mỗi lần gắn (gradient, clipPath).
// Bản thử và lịch sử chỉnh: web-tong/2026-10-11-con-vat-cho-tai (plan.md mục 11).
const o = (x, y) => `style="transform-origin:${x}px ${y}px"`;
// Mắt: lòng trắng + con ngươi + chấm sáng (.ey-o); cười = cung (.ey-j); buồn = mí sụp (.ey-l, cùng màu da).
// blink: con mắt chớp là một lớp riêng (scaleY trên compositor, không vẽ lại SVG mỗi khung hình).
function eye(cx, cy, r, lid = 'lc-gf', white = true, blink = false) {
  const p = white ? r * .6 : r;
  return `<g class="ey"><g class="ey-o${blink ? ' lc-wc' : ''}" style="transform-origin:${cx}px ${cy}px">${white ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f4f9ef"/>` : ''}<g class="ey-p"><circle cx="${+(cx + r * .18).toFixed(2)}" cy="${cy}" r="${+p.toFixed(2)}" fill="#10261a"/><circle cx="${+(cx - r * .05).toFixed(2)}" cy="${+(cy - r * .28).toFixed(2)}" r="${+(r * .22).toFixed(2)}" fill="#fff"/></g></g>`
    + `<path class="ey-j" d="M${cx - r * .9} ${cy + r * .25}Q${cx} ${cy - r * 1.05} ${cx + r * .9} ${cy + r * .25}"/>`
    + `<path class="ey-l ${lid}" d="M${cx - r * 1.25} ${cy - r * 1.3}H${cx + r * 1.25}V${cy - r * .05}Q${cx} ${cy - r * .55} ${cx - r * 1.25} ${cy + r * .25}Z"/></g>`;
}

// ---------- 1. Gà mổ thóc (khung 64×64, đất y=62, nhìn sang phải) ----------
const CHICK = `<svg class="lc-cr c-ck" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
<g class="ck-lb lc-wc" ${o(30, 52.5)}><path class="ck-ft" style="stroke:var(--foot);opacity:.8" d="M30 52.5V61H33.4M30 61H28.6"/></g>
<g class="ck-lf lc-wc" ${o(35.5, 52.5)}><path class="ck-ft" d="M35.5 52.5V61H39.3M35.5 61H34"/></g>
<g class="ck-up lc-wc" ${o(33, 55)}>
 <g class="ck-tl lc-wc" ${o(21, 36)}><path class="lc-gf" d="M23 38.4C18 36.4 14.2 31.6 13.6 25.4C13.4 23.6 14.9 22.6 16.4 23.6C18 21.2 21.4 20.4 23.6 22.2C26 21.4 29 23.2 28.8 26.4C28.6 30.4 27.8 33.8 27 36.8Z"/></g>
 <path class="lc-gf" d="M15.6 33.6C20.6 31.6 28.2 31.2 35.6 31.2C44.6 31.2 50.8 37 50.8 44.2C50.8 51.6 43.4 56 33.2 56C22.6 56 14.4 50.8 13.4 42.6C13 38.6 13.6 35.4 15.6 33.6Z"/>
 <g class="ck-wg lc-wc" ${o(43.5, 40)}><path d="M45 40C41 36.8 31.4 37 24.6 43.4C29.4 45.4 33.2 48.4 38.2 48C42.8 47.6 46 44.2 45 40Z"/></g>
 <g class="ck-hd lc-wc" ${o(40, 37)}>
  <path class="lc-gf" d="M39.4 18C38.6 14.2 41 12.4 43.2 13.6C43.8 10.8 47.2 10.4 47.9 13C50.2 12 51.8 14.4 50.4 16.6L44 19Z"/>
  <path class="lc-gf" d="M36 38.5C35.2 31.6 37 25.8 40.4 21.8C42 16.6 47.2 14.2 51 16.6C54.4 18.8 55 23.8 52.8 27.4C51.2 30.2 48.4 31.6 47 34.2L46.6 38.5Z"/>
  <path class="lc-gf" d="M50.6 27.4C53.2 27.6 53.8 30.4 52.4 32C50.6 32.6 49.4 30.4 50 28.2Z"/>
  <path class="ck-bk" d="M52.6 20.4Q58.4 22.2 59 23.4Q58.6 24.6 52.8 26.2Z"/>
  ${eye(47.6, 21.6, 2.6, undefined, true, true)}
 </g>
</g></svg>`;
const sceneChick = () => `<div class="lc-sh"><i class="lc-gl"></i><i class="ck-gr ck-g1" style="--k:1"></i><i class="ck-gr ck-g2" style="--k:2"></i><i class="ck-gr ck-g3" style="--k:3"></i><div class="ck-mv lc-wc">${CHICK}</div></div>`;

// ---------- 2. Bò cày ruộng (khung 112×64, đất y=62) ----------
const LEG = (x, t = 35) => `M${x} ${t + 3}Q${x} ${t} ${x + 3.5} ${t}Q${x + 7} ${t} ${x + 7} ${t + 3}L${x + 6} 59.8Q${x + 5.9} 62 ${x + 4.2} 62H${x + 2.6}Q${x + 1} 62 ${x + .9} 59.8Z`;
// Chân xoay quanh khớp (x+3.5, 40); bàn chân cách khớp 22 đơn vị.
const leg = (cls, x, far) => `<g class="${cls} lc-wc" ${o(x + 3.5, 40)}><path class="lc-gf" d="${LEG(x)}"/>${far ? `<path class="cw-dk" d="${LEG(x)}"/>` : ''}</g>`;
// Dáng theo con bò trong logo: u vai, lưng hơi võng, mông thon, ngực sâu có yếm; đầu thấp, chúi về trước (tư thế kéo cày).
const COW_BODY = 'M31.5 25C32.2 21.6 35.4 20 39.4 20.4C46 21 52 23.4 58 23.2C64 23 69 19.6 74 17.8C77.4 16.6 80.6 17 82.6 19.2C84.6 21.4 86 25 87.4 28.6L89 33C89.4 37.4 88.6 41.4 86.6 44.6C85 47.2 82 48.6 78.6 48C72 47.2 64 46.4 56 46.2C50 46.2 46 45.4 43.2 44.2C40 42.8 37 40 35 36.6C33.2 33.6 31.2 29 31.5 25Z';
const COW = `<svg class="lc-cr c-cw" viewBox="0 0 112 64" aria-hidden="true" focusable="false">
<path class="cw-wd" d="M4.5 31.5L15 58M2.4 33.2L7.6 30.2M14.2 52.6L27.2 45.8"/><path class="cw-bl" d="M12.4 55.4L21.6 58.4L20.8 62.6L12.8 61.4Z"/>
${leg('cw-l3', 44, 1)}${leg('cw-l4', 79.6, 1)}
<g class="cw-bd lc-wc" ${o(60, 44)}>
 <g class="cw-tl lc-wc" ${o(33, 26)}><path class="lc-gf" d="M29.6 38.6C31.4 39.6 31.8 42 30.8 43.4C30 44.4 28.6 44.4 28 43.2C27.2 41.6 28 39.6 29.6 38.6Z"/><path class="cw-dk" d="M29.6 38.6C31.4 39.6 31.8 42 30.8 43.4C30 44.4 28.6 44.4 28 43.2C27.2 41.6 28 39.6 29.6 38.6Z"/><path class="cw-tls" d="M33 26C30.4 29 29.4 33.8 29.6 38.8"/></g>
 <path class="lc-gf" d="${COW_BODY}"/>
 <path class="cw-st" d="M77.6 18.6C79.8 26.2 80.4 36 79.2 47.6"/>
 <path class="cw-rp" d="M26.6 46.2Q53 43.2 79.6 39.2"/>
 <g class="cw-hd lc-wc" ${o(86, 28)}>
  <g class="cw-er lc-lx" ${o(88.6, 25.4)}><path class="lc-gf" d="M90 24.2C86.6 20.4 80.6 19.2 77 21.4C79.2 26 85.2 28.2 90.4 27Z"/><path class="cw-dk" d="M90 24.2C86.6 20.4 80.6 19.2 77 21.4C79.2 26 85.2 28.2 90.4 27Z"/><path class="cw-in" d="M88.2 24.6C85.6 22.4 82 21.6 79.6 22.4C81.4 25 84.8 26.2 88.4 25.8Z"/></g>
  <path class="cw-hn" d="M90.2 21.6C89 18 90 14.8 92.8 13.6C92.2 16 92.6 18.6 94 20.8Z"/>
  <path class="lc-gf" d="M86.4 23.4C89.4 20.2 94.6 19.6 97.8 22.2C100.4 24.4 103 29 105.4 33.6C107 36.8 106.2 40.6 102.6 41.6C99.6 42.4 96.2 41.6 94.2 39.6C91.4 36.8 88.6 33 87 29.6C86 27.4 85.6 25 86.4 23.4Z"/>
  <path class="cw-mz" d="M98.4 37.2C98.8 34.4 101.6 33 104.2 33.6C106.4 34.2 107.2 36.8 106.4 39.2C105.6 41.4 103.2 42.4 100.8 41.6C99.2 41 98.2 39.2 98.4 37.2Z"/>
  <ellipse cx="104.6" cy="37" rx=".75" ry="1.15" fill="#10261a" opacity=".45"/>
  ${eye(94.4, 26.4, 2.6, undefined, true, true)}
  <circle class="cw-pf" cx="109.4" cy="40.2" r="2.4"/><circle class="cw-pf" cx="110.2" cy="36.6" r="1.8"/>
 </g>
</g>
${leg('cw-l1', 38.6, 0)}${leg('cw-l2', 74, 0)}
</svg>`;
const sceneCow = () => `<div class="lc-sh"><i class="cw-fw lc-wc"></i><i class="lc-gl"></i><div class="cw-mv lc-wc"><i class="cw-cv"></i>${COW}</div></div>`;

// ---------- 3. Trứng nở (khung 64×64) ----------
const EGG_D = 'M32 19C41 19 46.5 33 46.5 42C46.5 51 40.5 57 32 57C23.5 57 17.5 51 17.5 42C17.5 33 23 19 32 19Z';
const ZIG = 'L21 37.4L24 40.6L27.5 37L31 40.4L34.5 37L38 40.4L41.5 37.2L44.6 40.2L46.46 39.4';
const EGG_SH = 'M38.2 22.6C43.6 26.4 46.5 35.2 46.5 42C46.5 50.6 41 56.6 32.4 57C38.8 53 42.4 46.2 42.4 39C42.4 32 40.8 26.6 38.2 22.6Z';
const eggPiece = (d, id) => `<clipPath id="${id}"><path d="${d}"/></clipPath><path class="eg-sh" d="${d}"/><path class="eg-sh2" clip-path="url(#${id})" d="${EGG_SH}"/><path class="eg-rim" d="${d}"/>`;
function EGG() {
  const top = `M17.56 40${ZIG}C46.1 31.4 40.8 19 32 19C23.2 19 17.9 31.4 17.56 40Z`, bot = `M17.56 40${ZIG}C46.5 41 46.5 42 46.5 42C46.5 51 40.5 57 32 57C23.5 57 17.5 51 17.5 42Z`;
  return `<svg class="lc-cr c-eg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
<g class="eg-w1 lc-wc" ${o(32, 57)}><g class="eg-w2 lc-wc" ${o(32, 57)}><g class="eg-w3 lc-wc" ${o(32, 57)}>
 <ellipse class="eg-nb" cx="32" cy="54.4" rx="20.4" ry="5.4"/>
 <g class="eg-bc lc-lx" ${o(32, 52)}>
  <circle class="lc-gf" cx="32" cy="42" r="10.4"/>
  <path class="eg-st2" style="stroke:#93c24c" d="M30.4 32.4Q30.4 29.2 32.4 30.2M32.6 31.8Q33.6 29 35.2 30.6"/>
  ${eye(28.4, 39.6, 1.9).replace('#f4f9ef', '#f4f9ef')}${eye(35.6, 39.6, 1.9)}
  <path class="eg-bk" d="M30.3 43Q32 41.8 33.7 43Q32 45.6 30.3 43Z"/>
  <ellipse class="eg-bl" cx="25.8" cy="44" rx="1.8" ry="1.1"/><ellipse class="eg-bl" cx="38.2" cy="44" rx="1.8" ry="1.1"/>
 </g>
 <g class="eg-pc">${eggPiece(bot, '__ID-egb')}</g>
 <g class="eg-whole">${eggPiece(EGG_D, '__ID-egw')}
  <path class="eg-cr eg-c1" d="M29.4 25.6L31.8 28.8L30.2 31.4M31.8 28.8L33.8 28"/>
  <path class="eg-cr eg-c2" d="M18.2 39.6L21 37.4L24 40.6L27.5 37"/>
  <path class="eg-cr eg-c3" d="M34.5 37L38 40.4L41.5 37.2L44.6 40.2L45.9 39.6"/>
  <path class="eg-cr eg-c4" d="M27.5 37L31 40.4L34.5 37M31 40.4L30.4 43"/>
 </g>
 <path class="eg-nf" d="M10.6 51C12.2 58.6 21 62 32 62C43 62 51.8 58.6 53.4 51C46 55.6 18 55.6 10.6 51Z"/>
 <g class="eg-pc eg-top lc-lx" ${o(30, 39)}>${eggPiece(top, '__ID-egt')}<path class="eg-cr" style="opacity:1" d="M29.4 25.6L31.8 28.8L30.2 31.4M31.8 28.8L33.8 28"/></g>
</g></g></g></svg>`;
}
const sceneEgg = () => `<div class="lc-sh"><i class="lc-gl"></i>${EGG()}</div>`;

// ---------- 4. Lợn con nhảy (khung 64×64, đất y=62) ----------
const PIG_BODY = 'M14 42C14 33.4 21.2 28.4 31 28.4C40.8 28.4 47.6 33.4 47.6 42C47.6 50.2 40.8 55 31 55C21.2 55 14 50.2 14 42Z';
const PIG_HEAD = 'M40.4 36.4C40.4 29 45.6 24.6 51.2 25C56.6 25.4 60 30 59.6 36C59.2 42 54.8 46 49.4 46C44 46 40.4 42.2 40.4 36.4Z';
// Chân: cặp xa (tông tối) + gần cùng một lớp, xoay chung một gốc.
const prect = (x, c) => `<rect class="pg-rim" x="${x}" y="50" width="5.4" height="11.6" rx="2.5"/><rect class="${c}" x="${x}" y="50" width="5.4" height="11.6" rx="2.5"/>`;
const ppair = (cls, xf, xn) => `<g class="${cls} lc-wc" ${o((xf + xn) / 2 + 2.7, 51)}>${prect(xf, 'pg-sh')}${prect(xn, 'pg-c')}</g>`;
const PIG_EAR = 'M45.8 29.2C46.4 24.6 49.6 21.4 53.6 21.6C55.8 21.8 57.4 23.4 57.8 25.8C58 27 57 27.6 56 27C54.4 26.2 52.6 26.4 51 27.4C49.4 28.4 47.6 29.4 45.8 29.2Z';
const PIG_FE = 'M24.8 25.6C21.6 22.6 16.6 21.6 13.8 23.8C12.4 25 12.6 27.4 14 28.8C15.8 30.6 18.6 31.4 21.6 31ZM39.2 25.6C42.4 22.6 47.4 21.6 50.2 23.8C51.6 25 51.4 27.4 50 28.8C48.2 30.6 45.4 31.4 42.4 31Z';
const PIG = `<svg class="lc-cr c-pg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
<g class="pg-sd lc-wc" style="transform-origin:33px 62.2px"><ellipse class="pg-sdf" cx="33" cy="62.2" rx="15" ry="1.9"/></g>
<g class="pg-hop lc-wc" ${o(33, 62)}>
 <g class="pg-sv lc-lx" ${o(34, 44)}><g class="pg-tilt lc-wc" ${o(33, 45)}>
  ${ppair('pg-lb', 18.2, 22.6)}${ppair('pg-lf', 38.2, 41.4)}
  <path class="pg-rim" d="${PIG_BODY}"/><path class="pg-rim" d="${PIG_HEAD}"/>
  <g class="pg-tl lc-wc" ${o(15.6, 36.4)}><path class="pg-tls" d="M17 36.6C14.6 36.6 12.4 35.8 11.6 33.8C10.9 32 12 30.4 13.6 30.7C15 31 15.1 32.9 13.6 33.3C12.6 33.6 11.8 33 11.6 32.4"/></g>
  <path class="pg-sh" d="M43.6 29C43.6 25 45.8 22.4 48.8 22.4C50.6 22.4 51.6 23.8 51.4 25.4L48 28.6Z"/>
  <path class="pg-c" d="${PIG_BODY}"/>
  <path class="pg-sh" d="M15.4 45.6C18 51.6 24 55 31 55C39.6 55 45.6 51.4 47.2 45.4C41.6 50 21.6 50.8 15.4 45.6Z"/>
  <path class="pg-c" d="${PIG_HEAD}"/>
  <path class="pg-pk2" d="M56.4 32.2C58.8 31.4 61 31.6 62.2 32.6L62.6 40.4C61.4 41.4 58.8 41.6 56.6 40.8Z"/>
  <ellipse class="pg-pk" cx="62" cy="36.5" rx="2.2" ry="4.1"/>
  <ellipse class="pg-ns" cx="61.25" cy="36.6" rx=".6" ry="1.2"/><ellipse class="pg-ns" cx="62.85" cy="36.6" rx=".6" ry="1.2"/>
  ${eye(52.2, 32.6, 1.9, 'pg-c', false, true)}
  <ellipse class="pg-bl" cx="52.4" cy="38.8" rx="2.4" ry="1.4"/>
  <g class="pg-er lc-wc" ${o(47.4, 28.4)}><path class="pg-rim" d="${PIG_EAR}"/><path class="pg-c" d="${PIG_EAR}"/><path class="pg-pk" style="opacity:.5" d="M48.4 27.4C49.2 24.8 51.4 23.2 53.8 23.4C55 23.6 55.8 24.4 56.2 25.4C54.2 24.8 51.8 25.6 48.4 27.4Z"/></g>
 </g></g>
 <g class="pg-fr lc-lx" ${o(32, 46)}>
  <g class="pg-ftl lc-lx" ${o(45, 48)}><path class="pg-tls" d="M45 48.4C48.2 48.8 49.6 46.4 48.2 44.8C46.8 43.4 44.8 45 46.2 46.6"/></g>
  <path class="pg-rim" d="M17 51C17 45 23.6 41.6 32 41.6C40.4 41.6 47 45 47 51C47 57 40.4 60.4 32 60.4C23.6 60.4 17 57 17 51Z"/>
  <path class="pg-c" d="M17 51C17 45 23.6 41.6 32 41.6C40.4 41.6 47 45 47 51C47 57 40.4 60.4 32 60.4C23.6 60.4 17 57 17 51Z"/>
  <rect class="pg-rim" x="23" y="52" width="6.2" height="9.6" rx="2.8"/><rect class="pg-sh" x="23" y="52" width="6.2" height="9.6" rx="2.8"/>
  <rect class="pg-rim" x="34.8" y="52" width="6.2" height="9.6" rx="2.8"/><rect class="pg-sh" x="34.8" y="52" width="6.2" height="9.6" rx="2.8"/>
  <path class="pg-rim" d="${PIG_FE}"/><path class="pg-c" d="${PIG_FE}"/>
  <path class="pg-pk" style="opacity:.5" d="M22.6 26.4C20.2 24.6 17.2 24.2 15.6 25.4C15 26.2 15.2 27.2 16 28C17.4 29.2 19.2 29.8 21 29.8ZM41.4 26.4C43.8 24.6 46.8 24.2 48.4 25.4C49 26.2 48.8 27.2 48 28C46.6 29.2 44.8 29.8 43 29.8Z"/>
  <ellipse class="pg-rim" cx="32" cy="36" rx="14.4" ry="12.4"/><ellipse class="pg-c" cx="32" cy="36" rx="14.4" ry="12.4"/>
  ${eye(26.8, 33.8, 1.9, 'pg-c', false)}${eye(37.2, 33.8, 1.9, 'pg-c', false)}
  <ellipse class="pg-pk" cx="32" cy="40.2" rx="5.8" ry="4"/><ellipse class="pg-ns" cx="29.9" cy="40.2" rx="1.05" ry="1.5"/><ellipse class="pg-ns" cx="34.1" cy="40.2" rx="1.05" ry="1.5"/>
  <ellipse class="pg-bl" cx="22.2" cy="40" rx="2.4" ry="1.4"/><ellipse class="pg-bl" cx="41.8" cy="40" rx="2.4" ry="1.4"/>
 </g>
</g></svg>`;
const scenePig = () => `<div class="lc-sh"><i class="lc-gl"></i><div class="pg-bars lc-wc">${Array.from({ length: 16 }, (_, k) => `<i style="--i:${k - 5}"></i>`).join('')}</div>${PIG}</div>`;

// Gradient thân (userSpaceOnUse theo khung vẽ của từng con): sáng = dải logo, tối = bản sáng hơn (≥ 4,5:1 trên nền thẻ tối).
const LOGO_L = ['#93c24c', '#5f9642', '#2e6a37'], LOGO_D = ['#b4dc6e', '#86bb55', '#5d9c4f'];
const grad = (id, x1, x2, stops) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" x2="${x2}" y1="0" y2="0">${stops.map((c, i) => `<stop offset="${stops.length === 3 ? [0, .55, 1][i] : i}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const defs = (x1, x2, l, d) => `<svg class="lc-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${grad('__ID-l', x1, x2, l)}${grad('__ID-d', x1, x2, d)}</defs></svg>`;

/** Chuỗi HTML chưa lớp hoá của từng cảnh. */
export const SOURCES = {
  ck: defs(10, 58, LOGO_L, LOGO_D) + sceneChick(),
  cw: defs(26, 107, LOGO_L, LOGO_D) + sceneCow(),
  eg: defs(21, 43, ['#c3df84', '#93c24c'], ['#cfe79a', '#a4cf5e']) + sceneEgg(),
  pg: scenePig(),
};
