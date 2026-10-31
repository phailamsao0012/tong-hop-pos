// Mã hoá một file bằng khoá công khai của PC (chạy trên GitHub Actions, workflow xuat-d1-ve-pc.yml).
// Nội dung: gzip rồi AES-256-GCM với khoá ngẫu nhiên; khoá AES bọc bằng RSA-OAEP. Ra <out>.bin và <out>.key.
// Log chỉ in kích thước, không in nội dung.
import { createCipheriv, publicEncrypt, randomBytes, constants } from 'node:crypto';
import { createReadStream, createWriteStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const [input, out, pubPath = 'scripts/pc/khoa-cong-khai.pem'] = process.argv.slice(2);
const key = randomBytes(32), iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
await pipeline(createReadStream(input), createGzip({ level: 6 }), cipher, createWriteStream(`${out}.bin`));
const wrapped = publicEncrypt({ key: readFileSync(pubPath), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.concat([key, iv, cipher.getAuthTag()]));
writeFileSync(`${out}.key`, wrapped);
console.log(`gốc ${(statSync(input).size / 1e6).toFixed(0)} MB → mã hoá ${(statSync(`${out}.bin`).size / 1e6).toFixed(0)} MB`);
