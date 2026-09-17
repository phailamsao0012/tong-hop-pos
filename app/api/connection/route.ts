import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';

type PancakeShopsResponse = {
  success?: boolean;
  shops?: { id?: number; name?: string }[];
};

export async function GET() {
  if (!(await getSessionUser()))
    return Response.json({ error: 'Đăng nhập để kiểm tra kết nối.' }, { status: 401 });

  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (!apiKey)
    return Response.json({
      status: 'missing_key',
      shops: [],
      message: 'Web chưa có API key Pancake POS trong cấu hình bí mật.',
    }, { headers: { 'Cache-Control': 'no-store' } });

  // Pancake POS Open API specifies a numeric Shop ID and api_key query auth.
  // Only the server uses the key; the response never includes it.
  const url = new URL('https://pos.pages.fm/api/v1/shops');
  url.searchParams.set('api_key', apiKey);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    if (!response.ok)
      return Response.json({
        status: 'api_error',
        shops: [],
        message: response.status === 401 || response.status === 403
          ? 'API key bị từ chối hoặc chưa có quyền xem cửa hàng.'
          : `Pancake POS trả về lỗi HTTP ${response.status}.`,
      }, { headers: { 'Cache-Control': 'no-store' } });
    const result = await response.json() as PancakeShopsResponse;
    if (!result.success || !Array.isArray(result.shops))
      return Response.json({
        status: 'api_error',
        shops: [],
        message: 'Pancake POS chưa trả về danh sách cửa hàng hợp lệ.',
      }, { headers: { 'Cache-Control': 'no-store' } });
    return Response.json({
      status: 'verified',
      shops: result.shops
        .filter((s) => Number.isSafeInteger(s.id) && typeof s.name === 'string')
        .map((s) => ({ id: String(s.id), name: s.name })),
      message: `API key hợp lệ; tìm thấy ${result.shops.length} cửa hàng. Chưa đồng bộ dữ liệu báo cáo.`,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({
      status: 'network_error',
      shops: [],
      message: 'Không gọi được Pancake POS. Vui lòng thử lại.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
