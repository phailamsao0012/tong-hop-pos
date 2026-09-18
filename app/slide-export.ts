'use client';

// Xuất báo cáo thành một file HTML trình chiếu tự chứa: số liệu, biểu đồ (Chart.js nhúng sẵn), bảng.
// Mở ngoại tuyến, rê chuột vẫn có tooltip; ← → hoặc phím cách chuyển slide, F toàn màn hình, P in / lưu PDF.
export type SlideBlock =
  | { type: 'kpis'; items: { label: string; value: string; delta?: number | null; deltaLabel?: string; note?: string; tone?: string }[]; columns?: number }
  | { type: 'chart'; config: Record<string, unknown>; height?: number; note?: string }
  | { type: 'table'; columns: { label: string; align?: 'left' | 'right' }[]; rows: (string | number)[][]; total?: (string | number)[]; note?: string }
  | { type: 'list'; items: { label: string; value: string; tone?: string }[] }
  | { type: 'text'; html: string };
export type Slide = { title: string; subtitle?: string; blocks: SlideBlock[]; layout?: 'one' | 'two' };
export type Deck = { title: string; subtitle: string; meta: { label: string; value: string }[]; slides: Slide[]; brand?: string };

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TONES: Record<string, string> = { green: '#e4f5ea|#17684b', blue: '#e6f0fb|#2a78d6', orange: '#fdeee4|#d85f2a', teal: '#e1f5f0|#0f8f74', red: '#fdeaea|#c8403f', purple: '#ede9f9|#5b48b8', gray: '#eef1ee|#5d7266', lime: '#f1f8d6|#5a7a12' };
const deltaHtml = (d: number | null | undefined, label?: string) => {
  if (d === null || d === undefined) return '';
  const up = d === Infinity || d >= 0;
  const text = d === Infinity ? 'mới' : `${Math.abs(d).toFixed(1).replace('.', ',')}%`;
  return `<span class="pill ${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${text}</span>${label ? `<span class="muted"> ${esc(label)}</span>` : ''}`;
};

function blockHtml(b: SlideBlock, id: string, charts: { id: string; config: Record<string, unknown> }[]) {
  if (b.type === 'kpis') {
    return `<div class="kpis" style="--cols:${b.columns ?? Math.min(4, b.items.length)}">${b.items.map((k) => {
      const [bg, fg] = (TONES[k.tone ?? 'green'] ?? TONES.green).split('|');
      return `<div class="kpi"><span class="dot" style="background:${bg};color:${fg}">●</span><div><div class="label">${esc(k.label)}</div><div class="value">${esc(k.value)}</div>${k.delta !== undefined ? `<div class="sub">${deltaHtml(k.delta, k.deltaLabel)}</div>` : ''}${k.note ? `<div class="sub muted">${esc(k.note)}</div>` : ''}</div></div>`;
    }).join('')}</div>`;
  }
  if (b.type === 'chart') { charts.push({ id, config: b.config }); return `<div class="chart" style="height:${b.height ?? 360}px"><canvas id="${id}"></canvas></div>${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}`; }
  if (b.type === 'table') {
    return `<div class="tablewrap"><table><thead><tr>${b.columns.map((c) => `<th class="${c.align ?? 'left'}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((v, i) => `<td class="${b.columns[i]?.align ?? 'left'}">${esc(v)}</td>`).join('')}</tr>`).join('')}${b.total ? `<tr class="total">${b.total.map((v, i) => `<td class="${b.columns[i]?.align ?? 'left'}">${esc(v)}</td>`).join('')}</tr>` : ''}</tbody></table></div>${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}`;
  }
  if (b.type === 'list') return `<ul class="list">${b.items.map((i) => { const [bg, fg] = (TONES[i.tone ?? 'gray'] ?? TONES.gray).split('|'); return `<li><span>${esc(i.label)}</span><strong style="background:${bg};color:${fg}">${esc(i.value)}</strong></li>`; }).join('')}</ul>`;
  return `<div class="text">${b.html}</div>`;
}

export async function buildDeckHtml(deck: Deck) {
  const chartLib = (await import('chart.js/dist/chart.umd.js?raw')).default as string;
  const charts: { id: string; config: Record<string, unknown> }[] = [];
  const slides = deck.slides.map((s, i) => `<section class="slide ${s.layout === 'two' ? 'two' : ''}" id="s${i + 1}"><header><h2>${esc(s.title)}</h2>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}</header><div class="body">${s.blocks.map((b, j) => `<div class="block">${blockHtml(b, `c${i + 1}_${j}`, charts)}</div>`).join('')}</div><footer><span>${esc(deck.brand ?? 'MEGATECH · Tổng hợp POS')}</span><span>${i + 1} / ${deck.slides.length}</span></footer></section>`).join('');
  const cover = `<section class="slide cover" id="s0"><div class="coverbox"><div class="brand">${esc(deck.brand ?? 'MEGATECH · Tổng hợp POS')}</div><h1>${esc(deck.title)}</h1><p>${esc(deck.subtitle)}</p><dl>${deck.meta.map((m) => `<div><dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd></div>`).join('')}</dl><p class="hint">Bấm → hoặc phím cách để bắt đầu · F: toàn màn hình · P: in / lưu PDF · M: mục lục</p></div></section>`;
  const toc = `<nav id="toc"><h3>Mục lục</h3><ol>${deck.slides.map((s, i) => `<li><a href="#s${i + 1}">${esc(s.title)}</a></li>`).join('')}</ol></nav>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(deck.title)}</title>
<style>
:root{--bg:#f5f7f3;--ink:#17342b;--muted:#6a8575;--line:#dce5dc;--green:#17684b;--card:#fff}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
#deck{height:100vh;overflow-y:auto;scroll-snap-type:y mandatory;scroll-behavior:smooth}
.slide{min-height:100vh;scroll-snap-align:start;padding:34px 48px 26px;display:flex;flex-direction:column;gap:14px}
.slide header h2{margin:0;font-size:28px;letter-spacing:-.01em}.slide header p{margin:4px 0 0;color:var(--muted)}
.slide .body{flex:1;display:grid;gap:16px;align-content:start}.slide.two .body{grid-template-columns:1fr 1fr}
.block{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 4px 18px rgba(25,65,46,.04);min-width:0}
footer{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:8px}
.cover{justify-content:center;align-items:center;background:linear-gradient(135deg,#0f3328,#1b5a45)}.coverbox{color:#fff;max-width:760px;width:100%}
.cover .brand{font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.75}.cover h1{font-size:44px;margin:10px 0 6px;letter-spacing:-.02em}.cover p{opacity:.85;margin:0}
.cover dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:26px 0 0}.cover dt{font-size:12px;opacity:.7}.cover dd{margin:2px 0 0;font-weight:600;font-size:17px}.cover .hint{margin-top:28px;font-size:12px;opacity:.6}
.kpis{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:12px}.kpi{display:flex;gap:10px;border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff}
.kpi .dot{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-size:14px;flex:none}.kpi .label{font-size:12px;color:var(--muted)}.kpi .value{font-size:22px;font-weight:650;letter-spacing:-.01em}.kpi .sub{font-size:12px;margin-top:2px}
.pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600}.pill.up{background:#e4f5ea;color:#1a7a48}.pill.down{background:#fdeaea;color:#c23a3a}.muted{color:var(--muted)}
.chart{position:relative;width:100%}.note{font-size:12px;color:var(--muted);margin:8px 0 0}
.tablewrap{overflow:auto;max-height:64vh}table{width:100%;border-collapse:collapse;font-size:13px}th{position:sticky;top:0;background:#fff;color:var(--muted);font-weight:600;font-size:11px;text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:6px 8px;border-top:1px solid #eef1ee;white-space:nowrap}tr:hover td{background:#f5faf5}.right{text-align:right}tr.total td{font-weight:700;background:#f8faf8}
.list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.list li{display:flex;justify-content:space-between;align-items:center;border:1px solid var(--line);border-radius:12px;padding:8px 12px}.list strong{padding:2px 8px;border-radius:999px;font-size:12px}
#toc{position:fixed;left:0;top:0;bottom:0;width:280px;background:#0f3328;color:#e8f5ec;padding:20px;overflow:auto;transform:translateX(-100%);transition:.2s;z-index:5}#toc.open{transform:none}#toc h3{margin:0 0 10px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.7}#toc a{color:#e8f5ec;text-decoration:none;display:block;padding:6px 0;font-size:14px}#toc ol{padding-left:18px;margin:0}
#bar{position:fixed;right:16px;bottom:14px;display:flex;gap:6px;z-index:6}#bar button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;color:var(--ink)}
@media print{#deck{height:auto;overflow:visible}.slide{min-height:auto;page-break-after:always;padding:16px}#bar,#toc{display:none}.tablewrap{max-height:none;overflow:visible}}
@media (max-width:900px){.slide{padding:18px}.slide.two .body{grid-template-columns:1fr}.kpis{--cols:2 !important}}
</style></head><body>
${toc}<div id="deck">${cover}${slides}</div>
<div id="bar"><button onclick="go(-1)">‹ Trước</button><button onclick="go(1)">Sau ›</button><button onclick="document.getElementById('toc').classList.toggle('open')">Mục lục</button><button onclick="fs()">Toàn màn hình</button><button onclick="window.print()">In / PDF</button></div>
<script>${chartLib}</script>
<script>
const CHARTS=${JSON.stringify(charts)};
const money=(v)=>new Intl.NumberFormat('vi-VN').format(Math.round(v));
Chart.defaults.font.family=getComputedStyle(document.body).fontFamily;Chart.defaults.color='#6a8575';Chart.defaults.borderColor='#eef1ee';
for(const c of CHARTS){const el=document.getElementById(c.id);if(!el)continue;const cfg=c.config;cfg.options=cfg.options||{};cfg.options.maintainAspectRatio=false;cfg.options.responsive=true;
 cfg.options.plugins=cfg.options.plugins||{};cfg.options.plugins.tooltip=Object.assign({callbacks:{label:(ctx)=>{const ds=ctx.dataset;const v=ctx.parsed.y!==undefined&&ctx.parsed.y!==null?ctx.parsed.y:(ctx.parsed.x!==undefined?ctx.parsed.x:ctx.parsed);const unit=ds.unit||'';return (ds.label?ds.label+': ':'')+(typeof v==='number'?money(v):v)+(unit?' '+unit:'');}}},cfg.options.plugins.tooltip||{});
 new Chart(el,cfg);}
const n=${deck.slides.length};let cur=0;const deck=document.getElementById('deck');
function go(d){cur=Math.max(0,Math.min(n,cur+d));document.getElementById('s'+cur).scrollIntoView({behavior:'smooth'});}
function fs(){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}
document.addEventListener('keydown',(e)=>{if(['ArrowRight','ArrowDown',' ','PageDown'].includes(e.key)){e.preventDefault();go(1);}else if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();go(-1);}else if(e.key==='f'||e.key==='F'){fs();}else if(e.key==='p'||e.key==='P'){window.print();}else if(e.key==='m'||e.key==='M'){document.getElementById('toc').classList.toggle('open');}});
deck.addEventListener('scroll',()=>{const i=Math.round(deck.scrollTop/deck.clientHeight);if(i!==cur)cur=i;});
document.querySelectorAll('#toc a').forEach(a=>a.addEventListener('click',()=>document.getElementById('toc').classList.remove('open')));
</script></body></html>`;
}

export async function downloadDeck(deck: Deck, filename: string) {
  const html = await buildDeckHtml(deck);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename.endsWith('.html') ? filename : `${filename}.html`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Bảng màu và tiện ích dùng chung khi dựng cấu hình Chart.js từ báo cáo.
export const SLIDE_COLORS = { green: '#17684b', light: '#8fbfa5', gray: '#c3c2b7', blue: '#2a78d6', orange: '#eb6834', red: '#d24b4b', amber: '#eda100', purple: '#5b48b8' };
export const vnMoney = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} ₫`;
export const vnNum = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n));
export const pctText = (n: number | null | undefined, digits = 1) => n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(digits).replace('.', ',')}%`;
export const trieu = (n: number) => Math.round(n / 1e4) / 100;
