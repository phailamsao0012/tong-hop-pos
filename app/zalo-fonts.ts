// Phông Be Vietnam Pro (giấy phép OFL) cho ảnh báo cáo Zalo, tải từ Google Fonts, giữ trong bộ nhớ của tiến trình.
// Dùng chung cho /api/zalo/anh/<mã> và /api/zalo/xem-bao-cao-sep.
const FONTS = [
  [400, 'https://fonts.gstatic.com/s/bevietnampro/v12/QdVPSTAyLFyeg_IDWvOJmVES_Eww.ttf'],
  [600, 'https://fonts.gstatic.com/s/bevietnampro/v12/QdVMSTAyLFyeg_IDWvOJmVES_HToIV8y.ttf'],
  [700, 'https://fonts.gstatic.com/s/bevietnampro/v12/QdVMSTAyLFyeg_IDWvOJmVES_HSMIF8y.ttf'],
] as const;
type Font = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: 'normal' };
let fonts: Promise<Font[]> | null = null;
export const loadZaloFonts = () =>
  (fonts ??= Promise.all(FONTS.map(async ([weight, url]) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('font');
    return { name: 'Be Vietnam Pro', data: await res.arrayBuffer(), weight, style: 'normal' as const };
  })).catch((e: unknown) => { fonts = null; throw e; }));
