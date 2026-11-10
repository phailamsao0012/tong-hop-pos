// Lỗi có mã tầng (plan cải tổ 31/10/2026, luật 4): mỗi lỗi mang tiền tố tầng để nhìn mã là biết sửa ở đâu.
//   AUTH quyền và đăng nhập · PK Pancake · DB D1 · RP tính báo cáo · BOT Telegram/Zalo · UI giao diện · OPS sao lưu, lịch, chi phí
// Route API đổi AppError thành JSON { error, code, requestId }; web hiện "Lỗi PK-12 · mã 7f3a" cạnh nút thử lại.
// Thuần TypeScript: không React, không cloudflare:workers, để test được và dùng chung web + Telegram.

export const ERROR_LAYERS = ['AUTH', 'PK', 'DB', 'RP', 'BOT', 'UI', 'OPS'] as const;
export type ErrorLayer = (typeof ERROR_LAYERS)[number];
/** Mã lỗi dạng `TẦNG-SỐ`, ví dụ `PK-12`. */
export type ErrorCode = `${ErrorLayer}-${number}`;

const CODE_RE = /^(AUTH|PK|DB|RP|BOT|UI|OPS)-(\d{1,3})$/;
export const isErrorCode = (v: unknown): v is ErrorCode => typeof v === 'string' && CODE_RE.test(v);
export const layerOf = (code: string): ErrorLayer | null => (CODE_RE.exec(code)?.[1] as ErrorLayer | undefined) ?? null;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Chi tiết cho log, không đưa ra web (có thể chứa câu SQL, URL Pancake). */
  readonly detail?: string;
  constructor(code: ErrorCode, message: string, opts: { status?: number; detail?: string; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AppError';
    if (!isErrorCode(code)) throw new TypeError(`Mã lỗi sai dạng: ${String(code)}`);
    this.code = code;
    this.status = opts.status ?? DEFAULT_STATUS[layerOf(code)!];
    this.detail = opts.detail;
  }
}

const DEFAULT_STATUS: Record<ErrorLayer, number> = { AUTH: 403, PK: 502, DB: 500, RP: 500, BOT: 502, UI: 400, OPS: 500 };

export const isAppError = (e: unknown): e is AppError => e instanceof AppError || (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AppError' && isErrorCode((e as { code?: unknown }).code));

/** Mã yêu cầu 4 ký tự hex để anh đọc trên màn hình và tìm lại trong log. */
export function newRequestId(): string {
  const b = new Uint8Array(2);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export type ErrorBody = { error: string; code: ErrorCode; requestId: string };

/** Đổi mọi lỗi thành thân JSON cho route: AppError giữ mã và thông điệp; lỗi lạ thành `DB-0`/`RP-0`... theo tầng mặc định, không lộ chi tiết. */
export function errorBody(error: unknown, fallback: ErrorCode, requestId = newRequestId()): { status: number; body: ErrorBody } {
  if (isAppError(error)) return { status: error.status, body: { error: error.message, code: error.code, requestId } };
  const status = DEFAULT_STATUS[layerOf(fallback)!];
  return { status, body: { error: 'Có lỗi khi xử lý. Thử lại; vẫn lỗi thì gửi mã này cho kỹ thuật.', code: fallback, requestId } };
}

/** Chuỗi hiện trên web: `Lỗi PK-12 · mã 7f3a`. */
export const errorLabel = (b: Pick<ErrorBody, 'code' | 'requestId'>) => `Lỗi ${b.code} · mã ${b.requestId}`;
