// Biểu tượng riêng từng POS (duyệt 25/09/2026): nét 1.7 trên khung 24×24, chỉ dùng <path> để dùng chung cho
// web (SVG), iPhone (ảnh SVG trong Assets) và Android (VectorDrawable) — chạy `node scripts/gen-pos-icons.mjs` sau khi sửa.
// Màu giữ đúng 6 màu POS đang dùng (ui-kit POS_COLORS) để biểu đồ, bảng, Excel, bot không phải đổi.
const circle = (cx: number, cy: number, r: number) => `M${cx + r} ${cy}a${r} ${r} 0 1 1 ${-2 * r} 0a${r} ${r} 0 1 1 ${2 * r} 0Z`;

export type PosIcon = { id: string; short: string; color: string; meaning: string; paths: string[] };
export const POS_ICONS: PosIcon[] = [
  { id: 'sieu-vo-gao', short: 'Vô Gạo', color: '#2a78d6', meaning: 'Bông lúa', paths: [
    'M12 22V9', 'M12 13c-2.5 0-4-1.8-4-4 2.5 0 4 1.8 4 4Z', 'M12 13c2.5 0 4-1.8 4-4-2.5 0-4 1.8-4 4Z',
    'M12 9c-2.2 0-3.4-1.6-3.4-3.5 2.2 0 3.4 1.6 3.4 3.5Z', 'M12 9c2.2 0 3.4-1.6 3.4-3.5-2.2 0-3.4 1.6-3.4 3.5Z', 'M12 5.2c0-1.4.6-2.4 1.6-3.2',
    'M12 18c-2.8 0-4.5-2-4.5-4.4 2.8 0 4.5 2 4.5 4.4Z', 'M12 18c2.8 0 4.5-2 4.5-4.4-2.8 0-4.5 2-4.5 4.4Z'] },
  { id: 'mgt-apex', short: 'APEX', color: '#eb6834', meaning: 'Đỉnh núi', paths: [
    'M3 20l6.5-11 3.5 5.5 2.5-3.5L21 20Z', 'M9.5 9l1.8 2.8', 'M15 4.5L16 3l1 1.5', 'M16 3v4'] },
  { id: 'thuy-san', short: 'Thủy sản', color: '#1baf7a', meaning: 'Cá và sóng nước', paths: [
    'M3 12c2.8-4.2 7.5-5.5 11.5-3.6L19 5.5v13l-4.5-2.9C10.5 17.5 5.8 16.2 3 12Z', circle(8.5, 11, 0.6),
    'M2.5 20.5c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0'] },
  { id: 'bio-nano', short: 'BIO', color: '#eda100', meaning: 'Phân tử sinh học', paths: [
    circle(12, 12, 2.6), circle(5, 6, 1.8), circle(19, 6, 1.8), circle(12, 20.5, 1.8),
    'M6.5 7.2L10 10.4M17.5 7.2L14 10.4M12 14.6v4.1', 'M5 11.5c-1.8 1.8-1.8 4.6 0 6.5M19 11.5c1.8 1.8 1.8 4.6 0 6.5'] },
  { id: 'megaroot', short: 'ROOT', color: '#e87ba4', meaning: 'Mầm cây có rễ', paths: [
    'M12 12V3.5', 'M12 7c0-2.2 1.8-3.8 4.5-3.8 0 2.4-1.8 4-4.5 3.8Z', 'M12 9.5C12 7.6 10.4 6 8 6c0 2.1 1.6 3.6 4 3.5Z', 'M3 12h18',
    'M12 12v4.5c0 1.5-1 2.5-2.5 3.5', 'M12 15c1.5 0 3 1 3.5 3M12 17c.8 1.3.8 2.8 0 4.2M9.5 20L8 21.5M15.5 18l1.2 1.5'] },
  { id: 'oxytetra', short: 'Oxytetra', color: '#4a3aa7', meaning: 'Viên thuốc', paths: [
    'M10.31 18.38L18.58 11.44A3.8 3.8 0 0 0 13.69 5.62L5.42 12.56A3.8 3.8 0 0 0 10.31 18.38Z', 'M9.3 8.9l5.5 6.3', 'M16.8 7.6c.9.4 1.4 1 1.7 1.8'] },
];
export const posIcon = (id: string) => POS_ICONS.find((p) => p.id === id);
