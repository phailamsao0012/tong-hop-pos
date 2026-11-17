// Ký hiệu và tên ngắn của POS (anh Vũ 12/11/2026 duyệt: SVG, APEX, TS, BN, ROOT, OXY).
// Dùng cho chip cạnh tên nhân viên và cột POS trong bảng gọn. POS lạ thì trả lại mã / tên gốc.
export const POS_SHORT: Record<string, { code: string; name: string }> = {
  'sieu-vo-gao': { code: 'SVG', name: 'Siêu Vô Gạo' },
  'mgt-apex': { code: 'APEX', name: 'Apex' },
  'thuy-san': { code: 'TS', name: 'Thủy sản' },
  'bio-nano': { code: 'BN', name: 'Bio Nano' },
  megaroot: { code: 'ROOT', name: 'Megaroot' },
  oxytetra: { code: 'OXY', name: 'Oxytetra' },
};
export const posCode = (posId: string) => POS_SHORT[posId]?.code ?? posId.toUpperCase().slice(0, 4);
export const posShortName = (posId: string, fallback?: string) => POS_SHORT[posId]?.name ?? fallback ?? posId;
