// Thay 'next/headers' khi chạy test trên Node (web chạy bằng vinext nên gói next không có trong node_modules).
// Test đặt globalThis.__testCookie = 'thp_session=...' để route đọc được phiên đăng nhập (tests/support/session.ts).
export const headers = async () => new Headers(globalThis.__testCookie ? { cookie: globalThis.__testCookie } : {});
export const cookies = async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined });
