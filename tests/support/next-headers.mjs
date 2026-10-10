// Thay 'next/headers' khi chạy test trên Node (web chạy bằng vinext nên gói next không có trong node_modules).
export const headers = async () => new Headers();
export const cookies = async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined });
