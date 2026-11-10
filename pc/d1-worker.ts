// Luồng phụ giữ một kết nối SQLite (plan 2026-11-01-chay-web-pc-node, N1). Mỗi luồng xử lý lần lượt từng yêu cầu;
// nhiều luồng đọc chạy song song trên cùng file (WAL), một luồng ghi duy nhất.
// Nạp lõi bằng đường dẫn có đuôi: luồng phụ không có bộ nạp tsx, Node tự bỏ kiểu của file .ts khi chạy test; bản build dùng .js.
import { parentPort, workerData } from 'node:worker_threads';
import type { Request } from './d1-core';

const core = (await import(new URL(import.meta.url.endsWith('.ts') ? './d1-core.ts' : './d1-core.js', import.meta.url).href)) as typeof import('./d1-core');
const { file, readonly, label } = workerData as { file: string; readonly: boolean; label: string };
const conn = core.openConn(file, readonly, label);
parentPort!.on('message', (req: Request | 'close') => {
  if (req === 'close') { conn.db.close(); process.exit(0); }
  parentPort!.postMessage(core.handle(conn, req));
});
parentPort!.postMessage({ id: 0, ok: true, value: 'ready' });
