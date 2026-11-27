// Ảnh chụp băm JSON (W1, W2, W5). Chạy với UPDATE_SNAPSHOTS=1 để ghi lại băm mới khi số đổi CÓ CHỦ Ý
// (vd 27/11/2026: doanh thu / đơn chốt xếp theo ngày tạo đơn, định nghĩa đổi chữ), rồi xem lại diff fixture trước khi commit.
// Không đặt biến đó thì so đúng từng băm như cũ.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

export type Snapshot = { params: Record<string, string>; hash: string };

export function hashSnapshots(url: URL) {
  const list = JSON.parse(readFileSync(url, 'utf8')) as Snapshot[];
  const update = process.env.UPDATE_SNAPSHOTS === '1';
  return {
    list,
    check(snapshot: Snapshot, hash: string) {
      if (update) snapshot.hash = hash;
      else assert.equal(hash, snapshot.hash, JSON.stringify(snapshot.params));
    },
    save() { if (update) writeFileSync(url, `${JSON.stringify(list, null, 2)}\n`); },
  };
}
