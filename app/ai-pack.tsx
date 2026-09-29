'use client';

// Gói phân tích AI (kế hoạch quản trị, giai đoạn 6a · 26/09/2026): chưa gắn API AI vào web, nên mỗi trang có nút gom số liệu đang xem
// thành một văn bản Markdown (bối cảnh công ty, định nghĩa chỉ số, bảng số, câu hỏi mẫu) để dán vào Gemini / ChatGPT / Claude.
// Không đưa SĐT, tên khách; tên nhân viên giữ nguyên (sếp cần biết ai), có thể bật che tên nhân viên.
import { useState } from 'react';
import { Check, Copy, Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from './ui-kit';

/** staffCol: số thứ tự cột chứa tên nhân viên (để che khi bật "Che tên nhân viên"). */
export type PackTable = { title: string; columns: string[]; rows: (string | number | null | undefined)[][]; staffCol?: number };
export type Pack = {
  page: string; period?: string; scope?: string;
  facts?: [string, string | number | null | undefined][];
  tables?: PackTable[]; definitions?: Record<string, string> | string[]; questions: string[];
  /** Tên nhân viên xuất hiện trong tiêu đề / số chính / câu chữ (vd. hồ sơ, việc cần xử lý) để che luôn. */
  staffNames?: string[];
};

const CONTEXT = 'MEGATECH bán thuốc thú y / thủy sản qua 6 cửa hàng Pancake POS (Siêu Vô Gạo, MGT - APEX, THỦY SẢN MEGATECH, BIO NANO, MEGAROOT, Oxytetra - Megatech). Bộ phận: Sale (chốt số mới do Marketing đưa về), CSKH (chăm sóc khách cũ, bán thêm / upsell), Marketing (chạy quảng cáo ra số). Nhóm sản phẩm chính: Kháng sinh (BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT), Combo (BIO NANO CLEAN, GODKILL, SK + GK — mua lẻ hay combo đều tính), Khác. Tiền tính bằng đồng (₫).';
const cell = (v: unknown) => v === null || v === undefined || v === '' ? '—' : String(v).replace(/\|/g, '/').replace(/\n/g, ' ');
/** Che số điện thoại (≥ 9 chữ số liền) phòng khi lọt vào tên / ghi chú. */
const scrub = (s: string) => s.replace(/(?:\+?84|\b0)\d{8,10}\b/g, (m) => `${m.slice(0, 3)}****${m.slice(-2)}`);

export function buildPack(p: Pack, maskStaff = false) {
  const staff = new Map<string, string>();
  const mask = (v: string) => { if (!maskStaff) return v; if (!staff.has(v)) staff.set(v, `NV${String(staff.size + 1).padStart(2, '0')}`); return staff.get(v)!; };
  const lines: string[] = [];
  lines.push(`# Số liệu "${p.page}" — MEGATECH`, '');
  lines.push('## Bối cảnh', CONTEXT, '');
  if (p.period || p.scope) lines.push(`Kỳ: ${p.period ?? '—'}${p.scope ? ` · Phạm vi: ${p.scope}` : ''}`, `Xuất lúc: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`, '');
  if (p.facts?.length) { lines.push('## Số chính'); for (const [k, v] of p.facts) lines.push(`- ${k}: ${cell(v)}`); lines.push(''); }
  for (const t of p.tables ?? []) {
    if (!t.rows.length) continue;
    lines.push(`## ${t.title}`, `| ${t.columns.join(' | ')} |`, `| ${t.columns.map(() => '---').join(' | ')} |`);
    for (const r of t.rows) lines.push(`| ${r.map((v, i) => i === t.staffCol && typeof v === 'string' ? cell(mask(v)) : cell(v)).join(' | ')} |`);
    lines.push('');
  }
  const defs = Array.isArray(p.definitions) ? p.definitions : Object.values(p.definitions ?? {});
  if (defs.length) { lines.push('## Định nghĩa chỉ số'); for (const d of defs) lines.push(`- ${d}`); lines.push(''); }
  lines.push('## Yêu cầu', 'Bạn là chuyên gia phân tích kinh doanh. Dựa CHỈ trên số liệu trên (không bịa thêm số), hãy trả lời bằng tiếng Việt, ngắn gọn, có số dẫn chứng:');
  p.questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  lines.push('Cuối cùng, nêu 3 việc nên làm ngay trong tuần này, mỗi việc một dòng.');
  let text = lines.join('\n');
  if (maskStaff) for (const n of p.staffNames ?? []) if (n.trim().length > 2) text = text.split(n).join(mask(n));
  // Tên đã gặp trong bảng cũng che ở mọi chỗ khác của văn bản.
  if (maskStaff) for (const [n, code] of staff) if (n.trim().length > 2) text = text.split(n).join(code);
  return scrub(text);
}

export function AiPackButton({ pack, disabled }: { pack: () => Pack | null; disabled?: boolean }) {
  const [maskStaff, setMaskStaff] = useState(false);
  const [copied, setCopied] = useState(false);
  const make = () => { const p = pack(); return p ? { p, text: buildPack(p, maskStaff) } : null; };
  const copy = async () => {
    const x = make(); if (!x) return;
    try { await navigator.clipboard.writeText(x.text); setCopied(true); setTimeout(() => setCopied(false), 2500); toast('Đã chép gói phân tích — dán vào Gemini / ChatGPT'); }
    catch { toast('Trình duyệt chặn chép, hãy dùng Tải file', { kind: 'error' }); }
  };
  const download = () => {
    const x = make(); if (!x) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([x.text], { type: 'text/markdown;charset=utf-8' }));
    a.download = `goi-phan-tich_${x.p.page.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-')}.md`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" disabled={disabled} />}><Sparkles size={14} />Gói phân tích AI</PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3 text-[13px]">
        <p className="m-0 font-semibold text-ink">Gửi số liệu trang này cho AI</p>
        <p className="m-0 text-[12px] text-ink-3">Chép một văn bản gồm bối cảnh công ty, số đang xem, định nghĩa và câu hỏi mẫu, rồi dán vào Gemini, ChatGPT hoặc Claude. Không kèm SĐT hay tên khách.</p>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-2"><input id="ai-mask" type="checkbox" checked={maskStaff} onChange={(e) => setMaskStaff(e.target.checked)} />Che tên nhân viên (NV01, NV02…)</label>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Đã chép' : 'Chép'}</Button>
          <Button size="sm" variant="outline" onClick={download}><Download size={14} />Tải file</Button>
        </div>
        <p className="m-0 text-[11px] text-ink-4">Gemini bản miễn phí / Gemini Pro đều dán được. Nên xem lại câu trả lời trước khi làm theo.</p>
      </PopoverContent>
    </Popover>
  );
}
