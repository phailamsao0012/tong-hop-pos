import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { PancakeError } from '@/lib/pancake/pancake';
import { autoMapShops } from '@/lib/pancake/shop-map';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

// Kiểm tra API key, lấy danh sách cửa hàng và tự ghép Shop ID cho POS chưa có.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized('Đăng nhập để kiểm tra kết nối.');
  if (!isOwner(user)) return forbidden(); // Đợt 0, QA L2
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (!apiKey)
    return Response.json({
      status: 'missing_key', shops: [], mapped: [], unmatched: [],
      message: 'Web chưa có API key Pancake POS trong cấu hình bí mật.',
    }, noStore);
  try {
    const { shops, mapped, unmatched } = await autoMapShops(env.DB, apiKey);
    return Response.json({
      status: 'verified', shops, mapped, unmatched,
      message: `API key hợp lệ; tìm thấy ${shops.length} cửa hàng.`
        + (mapped.length ? ` Đã tự ghép ${mapped.length} POS.` : '')
        + (unmatched.length ? ` Chưa ghép được: ${unmatched.join(', ')} — chọn thủ công bên dưới.` : ''),
    }, noStore);
  } catch (error) {
    const status = error instanceof PancakeError ? error.status : undefined;
    return Response.json({
      status: status ? 'api_error' : 'network_error', shops: [], mapped: [], unmatched: [],
      message: status === 401 || status === 403
        ? 'API key bị từ chối hoặc chưa có quyền xem cửa hàng.'
        : status ? `Pancake POS trả về lỗi HTTP ${status}.` : 'Không gọi được Pancake POS. Vui lòng thử lại.',
    }, noStore);
  }
}
