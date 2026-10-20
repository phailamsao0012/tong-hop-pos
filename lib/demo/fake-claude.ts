/** Chỉ sinh chữ mẫu tại chỗ; không gọi API, không có usage hay ghi chi tiêu. */
export function fakeAnswer(kind: 'ask' | 'review' | 'week', input: string): string {
  const lines = input.split(/\r?\n/).filter((line) => line.trim()).length;
  const scope = { ask: 'câu hỏi', review: 'phân tích ngày', week: 'phân tích tuần' }[kind];
  // Không chép nội dung tự do từ input để tránh lộ tên và ghi chú.
  const text = `(Trả lời mẫu của bản demo, chưa gắn khoá Claude)\nĐã nhận ${lines} dòng dữ liệu cho ${scope}. Đây là lời mẫu; hãy xem các con số do code tính trong bảng số liệu.`;
  // Khung chat vẽ biểu đồ từ khối ```bieudo; bản demo có một khối mẫu để thấy hình, số không phải số thật.
  return kind === 'ask' ? `${text}\n\`\`\`bieudo\nBiểu đồ mẫu, không phải số thật (%)\nMẫu A;12.5\nMẫu B;8\nMẫu C;3.2\nMẫu D;-4\n\`\`\`` : text;
}
