// Khi nào KHÔNG tự khoá màn hình (app/idle-lock.tsx IdleLock paused). Anh Vũ 27/11/2026 8h17: "nếu lên web demo thì nhớ là tắt cái chế độ
// khóa sau mấy chục phút đi, phiền lắm"; Đầu não chốt phương án nhẹ: chỉ chủ hệ thống, chỉ trên bản thử (cờ giao diện mới THP_UI_MOI,
// bản demo, hoặc bản chụp chỉ xem có THP_SNAPSHOT_AT). Tài khoản khác vẫn khoá 30 phút; web thật (không cờ) không đổi gì.
/** Bản thử (giao diện mới THP_UI_MOI, demo, bản chụp chỉ xem): KHÔNG có khoá màn hình với bất kỳ ai (anh Vũ 27/11/2026 9h35:
 *  "web demo vẫn khoá, bỏ mẹ cái khoá cho t"). Web thật (không cờ) không đổi. */
export function idleLockOff(o: { uiMoi: boolean; demo: boolean; snapshotAt: string | null }) {
  return o.uiMoi || o.demo || !!o.snapshotAt;
}
export function idleLockPaused(o: { presenting: boolean; owner: boolean; uiMoi: boolean; demo: boolean; snapshotAt: string | null }) {
  return o.presenting || (o.owner && (o.uiMoi || o.demo || !!o.snapshotAt));
}
