// Tìm đường dẫn hiện tại của một file lib theo tên gốc (sau B2 lib/ chia thư mục): 'customer-stats' → 'lib/reports/customer-stats'.
// Dùng cho test nạp bản cũ của file lib (fixtures) mà import vẫn ghi '@/lib/<tên>'.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIB = join(import.meta.dirname, '..', '..', 'lib');
export function libPath(name: string): string {
  if (existsSync(join(LIB, `${name}.ts`))) return `lib/${name}`;
  for (const d of readdirSync(LIB)) {
    if (statSync(join(LIB, d)).isDirectory() && existsSync(join(LIB, d, `${name}.ts`))) return `lib/${d}/${name}`;
  }
  throw new Error(`Không thấy lib/**/${name}.ts`);
}
