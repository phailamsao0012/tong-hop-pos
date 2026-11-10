/** Hai ô tìm đơn/khách dùng chung hạn mức theo mã người dùng; local thiếu binding thì cho qua. */
export async function checkSearchLimit(env: Pick<Cloudflare.Env, 'SEARCH_LIMIT'>, userId: string): Promise<Response | null> {
  if (!env.SEARCH_LIMIT) return null;
  const { success } = await env.SEARCH_LIMIT.limit({ key: userId });
  return success ? null : Response.json({ error: 'Tìm quá nhanh, thử lại sau ít giây.' }, { status: 429 });
}
