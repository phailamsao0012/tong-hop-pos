// Ảnh báo cáo sếp chưa gửi được thì chờ, không gửi bản chữ thay ảnh (anh Vũ 20/11/2026: "gửi chậm hoặc không kịp thì chờ có ảnh mới gửi").
// 20/11 đường hầm chết từ 2h tới 14h, Zalo không tải được ảnh, báo cáo 8h và 12h chỉ còn chữ.
// Hàng chờ nằm trong một dòng app_settings (không thêm bảng): mỗi lượt cron (mỗi phút) thử lại ảnh nào đã chờ đủ 2 phút; gửi được thì bỏ khỏi hàng.
// Quá 60 phút vẫn không được thì nhắn một tin ngắn, không kèm số. Ghi hàng bằng câu UPDATE có điều kiện giá trị cũ, nên hai lượt cron chạy chồng
// không gửi trùng; web khởi động lại giữa chừng thì hàng vẫn còn.

export const PHOTO_WAIT_KEY = 'zalo_photo_wait_v1';
export const PHOTO_RETRY_MS = 2 * 60000;
export const PHOTO_GIVE_UP_MS = 60 * 60000;

/** Một ảnh đang chờ gửi: imageId là mã ảnh đã lưu (lib/zalo/morning-store.ts), first = lúc lẽ ra gửi, last = lần thử gần nhất. */
export type PhotoWait = { imageId: string; chatId: string; caption: string; label: string; first: number; last: number; tries: number };
export type PhotoSender = (chatId: string, photoUrl: string, caption: string) => Promise<boolean>;
export type TextSender = (chatId: string, text: string) => Promise<unknown>;

const parse = (s: string | null | undefined): PhotoWait[] => {
  try { const v = s ? JSON.parse(s) as unknown : []; return Array.isArray(v) ? v as PhotoWait[] : []; } catch { return []; }
};
async function read(db: D1Database) {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(PHOTO_WAIT_KEY).first<{ value: string }>();
  return { raw: row?.value ?? null, list: parse(row?.value) };
}
/** Ghi hàng mới nếu hàng chưa bị lượt khác đổi; trả về false khi đã bị đổi (lượt này bỏ qua, lượt sau làm tiếp). */
async function swap(db: D1Database, raw: string | null, list: PhotoWait[], now: number) {
  const value = JSON.stringify(list), at = new Date(now).toISOString();
  const r = raw === null
    ? await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING').bind(PHOTO_WAIT_KEY, value, at).run()
    : await db.prepare('UPDATE app_settings SET value=?, updated_at=? WHERE key=? AND value=?').bind(value, at, PHOTO_WAIT_KEY, raw).run();
  return Number(r.meta?.changes ?? 0) > 0;
}

/** Đưa một ảnh chưa gửi được vào hàng chờ (cùng ảnh, cùng người thì không thêm lần nữa). */
export async function queuePhoto(db: D1Database, item: Omit<PhotoWait, 'last' | 'tries'>, now: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { raw, list } = await read(db);
    if (list.some((x) => x.imageId === item.imageId && x.chatId === item.chatId)) return;
    if (await swap(db, raw, [...list, { ...item, last: now, tries: 1 }], now)) {
      console.error(`zalo photo wait: giữ ảnh ${item.label} để gửi lại`);
      return;
    }
  }
  console.error('zalo photo wait: không ghi được hàng chờ');
}

/** Lượt cron: thử lại các ảnh đã chờ đủ 2 phút; quá 60 phút thì nhắn tin ngắn rồi bỏ. Trả về số ảnh gửi được. */
export async function retryWaitingPhotos(db: D1Database, now: number, photo: PhotoSender, text: TextSender, photoUrl: (imageId: string) => string) {
  const { raw, list } = await read(db);
  if (!list.length) return 0;
  const due = list.filter((x) => now - x.last >= PHOTO_RETRY_MS);
  if (!due.length) return 0;
  // Nhận việc trước khi gửi (đặt last = now): lượt cron chạy chồng thấy chưa đủ 2 phút nên không gửi trùng.
  const claimed = list.map((x) => (due.includes(x) ? { ...x, last: now, tries: x.tries + 1 } : x));
  if (!await swap(db, raw, claimed, now)) return 0;
  const done = new Set<PhotoWait>();
  let ok = 0;
  for (const x of due) {
    const key = claimed.find((y) => y.imageId === x.imageId && y.chatId === x.chatId)!;
    if (now - x.first >= PHOTO_GIVE_UP_MS) {
      try { await text(x.chatId, `Báo cáo ${x.label} chưa gửi được ảnh, em đang kiểm.`); } catch { console.error('zalo photo wait: nhắn báo lỗi không được'); }
      console.error(`zalo photo wait: bỏ ảnh ${x.label} sau ${x.tries} lần thử`);
      done.add(key);
      continue;
    }
    if (await photo(x.chatId, photoUrl(x.imageId), x.caption)) { ok++; done.add(key); console.log(`zalo photo wait: đã gửi ảnh ${x.label} (lần ${x.tries + 1})`); }
  }
  if (done.size) {
    // Bỏ các ảnh đã xong khỏi hàng; hàng có thể vừa được thêm ảnh mới nên đọc lại trước khi ghi.
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await read(db);
      const rest = cur.list.filter((x) => ![...done].some((d) => d.imageId === x.imageId && d.chatId === x.chatId));
      if (await swap(db, cur.raw, rest, now)) break;
    }
  }
  return ok;
}
