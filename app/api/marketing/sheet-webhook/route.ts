import { checkSheetKey, ingestSheet, type SheetPayload } from '@/lib/sheet-costs';

// Apps Script gắn trong file Google Sheet chi phí MKT gọi vào đây (scripts/chi-phi-mkt-sheet.gs), không có phiên đăng nhập web.
// Xác thực bằng header X-Sheet-Key = khóa chủ hệ thống tạo trên trang Chi phí & ROAS (web chỉ lưu SHA-256). Gửi lại bao nhiêu lần cũng ra cùng số.
export async function POST(request: Request) {
  const given = (request.headers.get('x-sheet-key') ?? '').trim();
  if (!(await checkSheetKey(given))) return Response.json({ error: 'Sai mã nối Google Sheet. Tạo mã mới ở trang Chi phí & ROAS rồi dán lại vào script.' }, { status: 401 });
  if (Number(request.headers.get('content-length') ?? 0) > 8 * 1024 * 1024) return Response.json({ error: 'Dữ liệu quá 8 MB.' }, { status: 413 });
  const body = await request.json().catch(() => null) as SheetPayload | null;
  if (!body?.file?.id || typeof body.file.id !== 'string' || !Array.isArray(body.tabs)) return Response.json({ error: 'Thiếu file.id hoặc tabs.' }, { status: 400 });
  try {
    return Response.json({ ok: true, ...(await ingestSheet(body)) });
  } catch (error) {
    console.error('sheet cost webhook failed', error);
    return Response.json({ error: 'Máy chủ chưa lưu được, script sẽ gửi lại lượt sau.' }, { status: 500 });
  }
}
