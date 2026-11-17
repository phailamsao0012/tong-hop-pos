import { ImageResponse } from 'next/og';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { todayVn } from '@/lib/shared/report-time';
import { bossReportData } from '@/lib/zalo/boss-data';
import type { BossImage } from '@/lib/zalo/boss-report';
import { BOSS_IMAGE_WIDTH, BossImageView, bossImageHeight } from '@/app/zalo-boss-image';
import { loadZaloFonts } from '@/app/zalo-fonts';

// Xem trước ảnh báo cáo tổng quan gửi sếp với số lúc này (anh Vũ 14/11/2026). Chỉ chủ hệ thống / giám đốc.
// ?part=1|2, ?sang=1 = kiểu báo cáo sáng (số trọn ngày hôm qua).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== 'owner' && user.role !== 'director') return Response.json({ error: 'Chỉ chủ hệ thống / giám đốc xem được.' }, { status: 403 });
  const p = new URL(request.url).searchParams;
  const part = p.get('part') === '2' ? 2 : 1, morning = p.get('sang') === '1';
  const now = Date.now(), hour = new Date(now + 7 * 3600000).toISOString().slice(11, 13);
  const img: BossImage = { kind: 'bossReport', part, data: await bossReportData(todayVn(now), morning ? '08' : hour, morning, now) };
  return new ImageResponse(<BossImageView img={img} />, { width: BOSS_IMAGE_WIDTH, height: bossImageHeight(img), fonts: await loadZaloFonts(), headers: { 'Cache-Control': 'private, no-store' } });
}
