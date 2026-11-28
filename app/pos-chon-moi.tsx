'use client';
// Hàng chọn POS ở đầu trang kiểu mới (cờ THP_UI_MOI): kiểu E "Viên POS màu" anh chọn 28/11/2026 (bỏ công tắc thử a / b / c của mốc 6).
// Chỉ PageHeadMoi (trang-moi.tsx, chỉ trang bật cờ mới gọi) đặt PosVienContext = true; ngoài đầu trang kiểu mới context là false
// nên PosChips (app/overview-view.tsx) vẽ y như cũ.
import { createContext } from 'react';

export const PosVienContext = createContext(false);

/** Số từng POS đã có sẵn trong dữ liệu trang (không gọi API, không tính mới): viên POS hiện số, tooltip ghi tên số + chênh lệch so kỳ trước. */
export type PosNums = { /** Tên số, ví dụ "Doanh thu đơn chốt". */ label: string; format: (n: number) => string; rows: { posId: string; value: number; prev: number | null }[] };
