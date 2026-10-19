/** Chỉ sinh chữ mẫu tại chỗ; không gọi API, không có usage hay ghi chi tiêu. */
export function fakeAnswer(kind: 'ask' | 'review' | 'week', input: string): string {
  const lines = input.split(/\r?\n/).filter((line) => line.trim()).length;
  const scope = { ask: 'câu hỏi', review: 'phân tích ngày', week: 'phân tích tuần' }[kind];
  // Không chép nội dung tự do từ input để tránh lộ tên và ghi chú.
  return `(Trả lời mẫu của bản demo, chưa gắn khoá Claude)\nĐã nhận ${lines} dòng dữ liệu cho ${scope}. Đây là lời mẫu; hãy xem các con số do code tính trong bảng số liệu.`;
}
