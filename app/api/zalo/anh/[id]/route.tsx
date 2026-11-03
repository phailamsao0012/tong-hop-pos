import { env } from 'cloudflare:workers';
import { ImageResponse } from 'next/og';
import { loadMorningImage } from '@/lib/zalo/morning-store';
import {
  MORNING_IMAGE_WIDTH,
  MorningImage,
  morningImageHeight,
} from '@/app/zalo-morning-image';
import { BossSlotImage, SLOT_IMAGE_WIDTH, SlotImage, bossSlotImageHeight, slotImageHeight } from '@/app/zalo-slot-image';
import type { MorningReport } from '@/lib/zalo/morning-report';
import type { BossSlotReport, SlotReport } from '@/lib/zalo/slot-report';

// Ảnh báo cáo 8h cho Zalo tải (không đăng nhập; mã ngẫu nhiên, hết hạn sau 3 ngày — xem lib/zalo/morning-store.ts).
// Phông Be Vietnam Pro (giấy phép OFL) tải từ Google Fonts, giữ trong bộ nhớ của tiến trình.
const FONTS = [
  [
    400,
    'https://fonts.gstatic.com/s/bevietnampro/v12/QdVPSTAyLFyeg_IDWvOJmVES_Eww.ttf',
  ],
  [
    600,
    'https://fonts.gstatic.com/s/bevietnampro/v12/QdVMSTAyLFyeg_IDWvOJmVES_HToIV8y.ttf',
  ],
  [
    700,
    'https://fonts.gstatic.com/s/bevietnampro/v12/QdVMSTAyLFyeg_IDWvOJmVES_HSMIF8y.ttf',
  ],
] as const;
let fonts: Promise<
  {
    name: string;
    data: ArrayBuffer;
    weight: 400 | 600 | 700;
    style: 'normal';
  }[]
> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all(
    FONTS.map(async ([weight, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('font');
      return {
        name: 'Be Vietnam Pro',
        data: await res.arrayBuffer(),
        weight,
        style: 'normal' as const,
      };
    }),
  ).catch((e: unknown) => {
    fonts = null;
    throw e;
  }));

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const report = await loadMorningImage<MorningReport | SlotReport | BossSlotReport>(env.DB, (await params).id);
  if (!report) return new Response('Ảnh đã hết hạn.', { status: 404 });
  const opts = { fonts: await loadFonts(), headers: { 'Cache-Control': 'private, max-age=86400' } };
  if ('kind' in report && report.kind === 'slot') return new ImageResponse(<SlotImage r={report} />, { width: SLOT_IMAGE_WIDTH, height: slotImageHeight(report), ...opts });
  if ('kind' in report && report.kind === 'bossSlot') return new ImageResponse(<BossSlotImage r={report} />, { width: SLOT_IMAGE_WIDTH, height: bossSlotImageHeight(report), ...opts });
  return new ImageResponse(<MorningImage r={report as MorningReport} />, { width: MORNING_IMAGE_WIDTH, height: morningImageHeight(report as MorningReport), ...opts });
}
