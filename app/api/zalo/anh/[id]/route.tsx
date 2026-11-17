import { env } from 'cloudflare:workers';
import { ImageResponse } from 'next/og';
import { loadMorningImage } from '@/lib/zalo/morning-store';
import {
  MORNING_IMAGE_WIDTH,
  MorningImage,
  morningImageHeight,
} from '@/app/zalo-morning-image';
import { BossSlotImage, SLOT_IMAGE_WIDTH, bossSlotImageHeight } from '@/app/zalo-slot-image';
import { BOSS_IMAGE_WIDTH, BossImageView, bossImageHeight } from '@/app/zalo-boss-image';
import type { MorningReport } from '@/lib/zalo/morning-report';
import type { BossSlotReport } from '@/lib/zalo/slot-report';
import type { BossImage } from '@/lib/zalo/boss-report';

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

// Ảnh đã vẽ giữ trong bộ nhớ 30 phút (17/11/2026): lúc 12h / 17h web bận, Zalo tải ảnh quá lâu nên từ chối và chỉ còn tin chữ.
// Bot gọi trước một lần để vẽ sẵn (lib/zalo/zalo.ts sendZaloPhoto), lúc Zalo tải thì trả ngay. Mã ảnh ngẫu nhiên, nội dung không đổi.
const PNG_TTL = 30 * 60000, PNG_MAX = 40;
const drawn = new Map<string, { png: ArrayBuffer; at: number }>();
const png = (body: ArrayBuffer) => new Response(body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400' } });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id, now = Date.now();
  const hit = drawn.get(id);
  if (hit && now - hit.at < PNG_TTL) return png(hit.png);
  const report = await loadMorningImage<MorningReport | BossSlotReport | BossImage>(env.DB, id);
  if (!report) return new Response('Ảnh đã hết hạn.', { status: 404 });
  const opts = { fonts: await loadFonts() };
  const image = 'kind' in report && report.kind === 'bossReport' ? new ImageResponse(<BossImageView img={report} />, { width: BOSS_IMAGE_WIDTH, height: bossImageHeight(report), ...opts })
    : 'kind' in report && report.kind === 'bossSlot' ? new ImageResponse(<BossSlotImage r={report} />, { width: SLOT_IMAGE_WIDTH, height: bossSlotImageHeight(report), ...opts })
    : new ImageResponse(<MorningImage r={report as MorningReport} />, { width: MORNING_IMAGE_WIDTH, height: morningImageHeight(report as MorningReport), ...opts });
  const body = await image.arrayBuffer();
  for (const [k, v] of drawn) if (now - v.at >= PNG_TTL) drawn.delete(k);
  while (drawn.size >= PNG_MAX) drawn.delete(drawn.keys().next().value!);
  drawn.set(id, { png: body, at: now });
  return png(body);
}
