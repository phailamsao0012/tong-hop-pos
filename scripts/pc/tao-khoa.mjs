// Tạo cặp khoá để chép dữ liệu thật từ Cloudflare về PC (plan docs/plans/2026-10-31-chuyen-sang-pc, bước B5).
// Khoá riêng nằm lại trên PC (C:\thp\bi-mat), không bao giờ vào repo hay chat. Khoá công khai in ra để đưa vào
// scripts/pc/khoa-cong-khai.pem: GitHub Actions mã hoá bản xuất D1 bằng khoá này, chỉ PC giải được.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const dir = process.argv[2] ?? 'C:\\thp\\bi-mat';
const priv = `${dir}/khoa-rieng.pem`;
if (existsSync(priv)) throw new Error(`Đã có ${priv}; xoá đi nếu muốn tạo khoá mới.`);
mkdirSync(dir, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
process.stdout.write(publicKey.export({ type: 'spki', format: 'pem' }));
