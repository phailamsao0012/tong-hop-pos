// Pancake POS Open API client (https://docs.pancake.biz/pos/api/). Chỉ dùng phía server.

export const PANCAKE_BASE = 'https://pos.pages.fm/api/v1';

export type SourceOrder = {
  id?: number | string;
  bill_full_name?: string | null;
  bill_phone_number?: string | null;
  inserted_at?: string | null;
  updated_at?: string | null;
  status?: number | null;
  sub_status?: number | null;
  assigning_seller?: { id?: string; name?: string } | null;
  time_assign_seller?: string | null;
  assigning_care?: { id?: string } | null;
  assigning_care_id?: string | null;
  time_assign_care?: string | null;
  marketer?: { id?: string } | null;
  creator_id?: string | null;
  creator?: { id?: string } | null;
  last_editor_id?: string | null;
  last_editor?: { id?: string } | null;
  customer?: { id?: string; customer_id?: string; name?: string } | null;
  total_price?: number | null;
  total_discount?: number | null;
  shipping_fee?: number | null;
  cod?: number | null;
  money_to_collect?: number | null;
  total_quantity?: number | null;
  order_sources?: string | null;
  warehouse_id?: string | null;
  note?: string | null;
  tags?: { id?: number; name?: string }[] | null;
  status_history?: {
    old_status?: number;
    status?: number;
    editor_id?: string;
    updated_at?: string;
  }[];
  histories?: Record<string, unknown>[];
  items?: SourceItem[];
};
export type SourceItem = {
  product_id?: string;
  variation_id?: string;
  quantity?: number;
  returned_count?: number;
  discount_each_product?: number;
  is_discount_percent?: boolean;
  assigning_seller_id?: string | null;
  variation_info?: {
    name?: string;
    retail_price?: number;
    product_id?: string;
    display_id?: string;
    product_display_id?: string;
    fields?: { name?: string; value?: string }[];
  };
};
export type SourcePage = {
  success?: boolean;
  data?: SourceOrder[];
  total_entries?: number;
  page_size?: number;
  page_number?: number;
};
export type SourceUser = {
  user_id?: string;
  role?: number;
  is_active?: boolean;
  user?: { id?: string; name?: string; email?: string; phone_number?: string };
  department?: { id?: number; name?: string } | null;
  sale_group?: { id?: number; name?: string } | null;
};
export type SourceVariation = {
  id?: string;
  product_id?: string;
  retail_price?: number;
  display_id?: string;
  is_hidden?: boolean;
  fields?: { name?: string; value?: string }[];
  product?: { id?: string; name?: string; display_id?: string; is_hidden?: boolean; categories?: { id?: number; name?: string }[] };
  name?: string;
  is_removed?: boolean;
};

export class PancakeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export function sourceUrl(path: string, apiKey: string, params: Record<string, string> = {}) {
  const url = new URL(`${PANCAKE_BASE}${path}`);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

/** Gọi Pancake, tự thử lại khi lỗi mạng / 5xx / 429 (tối đa 3 lần). */
export async function pancakeGet<T>(path: string, apiKey: string, params: Record<string, string> = {}, timeoutMs = 20000): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(sourceUrl(path, apiKey, params), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
      if (response.ok) return await response.json() as T;
      if (response.status < 500 && response.status !== 429)
        throw new PancakeError(`Pancake POS trả về HTTP ${response.status}.`, response.status);
      lastError = new PancakeError(`Pancake POS trả về HTTP ${response.status}.`, response.status);
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') ?? 0);
        await sleep(Math.min(5000, Math.max(1000, retryAfter * 1000)));
        continue;
      }
    } catch (error) {
      if (error instanceof PancakeError && error.status && error.status < 500 && error.status !== 429) throw error;
      lastError = error;
    }
    await sleep(300 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new PancakeError('Không gọi được Pancake POS.');
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function listShops(apiKey: string) {
  const result = await pancakeGet<{ success?: boolean; shops?: { id?: number; name?: string }[] }>('/shops', apiKey, {}, 10000);
  if (!result.success || !Array.isArray(result.shops)) throw new PancakeError('Pancake POS chưa trả về danh sách cửa hàng hợp lệ.');
  return result.shops
    .filter((s) => Number.isSafeInteger(s.id) && typeof s.name === 'string')
    .map((s) => ({ id: String(s.id), name: s.name! }));
}

export async function listUsers(shopId: string, apiKey: string) {
  const result = await pancakeGet<{ success?: boolean; data?: SourceUser[] }>(`/shops/${shopId}/users`, apiKey, {}, 12000);
  if (!result.success || !Array.isArray(result.data)) throw new PancakeError('Pancake POS chưa trả về danh sách nhân viên.');
  return result.data;
}

export async function listVariationsPage(shopId: string, apiKey: string, page: number, pageSize = 100) {
  const result = await pancakeGet<{ success?: boolean; data?: SourceVariation[]; total_entries?: number; page_size?: number }>(
    `/shops/${shopId}/products/variations`, apiKey, { page_number: String(page), page_size: String(pageSize) }, 20000,
  );
  if (!result.success || !Array.isArray(result.data)) throw new PancakeError('Pancake POS chưa trả về danh sách sản phẩm.');
  return result;
}

export function listOrdersPage(shopId: string, apiKey: string, params: Record<string, string>) {
  return pancakeGet<SourcePage>(`/shops/${shopId}/orders`, apiKey, params);
}

/** Mã trạng thái đơn Pancake → nhãn tiếng Việt. */
export const ORDER_STATUS: Record<number, string> = {
  0: 'Mới', 17: 'Chờ xác nhận', 11: 'Chờ hàng', 12: 'Chờ in', 13: 'Đã in', 20: 'Đã đặt hàng',
  1: 'Đã xác nhận', 8: 'Đang đóng hàng', 9: 'Chờ chuyển hàng', 2: 'Đã gửi hàng', 3: 'Đã nhận',
  16: 'Đã thu tiền', 4: 'Đang hoàn', 15: 'Hoàn một phần', 5: 'Đã hoàn', 6: 'Đã hủy', 7: 'Đã xóa',
};
export const DELIVERED_STATUSES = [3, 16];
export const RETURNED_STATUSES = [4, 5, 15];
export const CANCELLED_STATUSES = [6, 7];
