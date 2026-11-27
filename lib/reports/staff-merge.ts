// Bảng nhân viên gộp ở Tổng quan Sale / CSKH (plan docs/plans/2026-11-27-gon-trang-vua-man-2k, đợt 2; anh Vũ 27/11/2026 8h34).
// Sale: các cột chung (Doanh thu, Đơn chốt, Giá trị đơn, Tỷ lệ chốt, Số được chia, DT đóng hàng trở đi) lấy MỘT nguồn là báo cáo tổng quan
// (/api/reports/overview, byEmployee + packedStaff) — cùng nguồn và cùng cách tính với các ô số đầu trang; tỷ lệ chốt theo nút "Cách tính"
// (rateBase, closeRateOf). Cột riêng của bảng nhóm sản phẩm (thẻ đơn, đang đóng hàng, đã nhận…) giữ nguồn product-groups như cũ.
// CSKH (sửa 27/11/2026 sau kiểm cloud: tổng bảng 3,51 tỷ ≠ ô đầu trang 2,11 tỷ, tỷ trọng 167%): bảng nhóm sản phẩm gán đơn theo NV chăm sóc
// (trống thì người bán), nên kéo cả đơn Sale bán mà CSKH chăm sóc; ô đầu trang tính theo người bán thuộc bộ phận. Nay CSKH cũng lấy số chung
// (Doanh thu, Đơn chốt, Giá trị đơn, tỷ trọng) từ báo cáo tổng quan như Sale; bảng gộp CSKH đọc bảng nhóm sản phẩm theo người bán (by=seller) nên mọi cột cùng một nhóm đơn.
// Người có ở báo cáo tổng quan mà không có ở bảng nhóm sản phẩm vẫn có một dòng (staffRowsWithCommon), để dòng Tổng = ô đầu trang.
import { closeRateBase, closeRateOf, closeRateTop, type RateBase } from '@/lib/reports/metrics';

/** Một dòng nhân viên của báo cáo tổng quan (đủ trường để tính tỷ lệ chốt như ô đầu trang). */
export type OverviewStaffInput = {
  sellerId: string; name?: string; closedNet: number; closedOrders: number; orders: number;
  assignedOrders?: number; assignedHidden?: boolean; createdClosedOrders?: number; assignedClosedOrders?: number;
  rateOrders?: number; rateAssigned?: number;
};
export type StaffCommon = {
  /** Tên trên báo cáo tổng quan (dòng chỉ có ở báo cáo tổng quan dùng tên này). */ name?: string;
  closedNet: number; closedOrders: number; averageOrder: number | null;
  /** Tỷ lệ chốt theo rateBase; null khi số chia bị ẩn với tài khoản này hoặc không có mẫu số. */ rate: number | null;
  rateTop: number; rateBase: number; assignedHidden: boolean;
  packedNet?: number; packedShare: number | null;
  /** Phần doanh thu của người này trong bộ phận (0–100). */ share: number | null;
};

/** Số chung từng người (Sale) từ báo cáo tổng quan; deptNet = doanh thu chốt cả bộ phận (ô Doanh thu đầu trang). */
export function overviewStaffCommon(rows: OverviewStaffInput[], packed: { sellerId: string; packedNet: number }[] | undefined, rateBase: RateBase, deptNet: number) {
  const pk = new Map((packed ?? []).map((p) => [p.sellerId, p.packedNet]));
  const out = new Map<string, StaffCommon>();
  for (const r of rows) {
    // Dòng "Chưa gán người bán" (sellerId rỗng) cũng giữ, để dòng Tổng = ô đầu trang.
    const packedNet = packed ? pk.get(r.sellerId) ?? 0 : undefined;
    out.set(r.sellerId, {
      name: r.name, closedNet: r.closedNet, closedOrders: r.closedOrders, averageOrder: r.closedOrders ? r.closedNet / r.closedOrders : null,
      rate: closeRateOf(r, rateBase), rateTop: closeRateTop(r, rateBase), rateBase: closeRateBase(r, rateBase), assignedHidden: !!r.assignedHidden,
      packedNet, packedShare: packedNet !== undefined && r.closedNet ? packedNet / r.closedNet * 100 : null,
      share: deptNet ? r.closedNet / deptNet * 100 : null,
    });
  }
  return out;
}

/** Dòng Tổng của bảng: cộng tử số, cộng mẫu số (một tỷ lệ cho cả nhóm như closeRateOfMany). */
export function staffCommonTotal(rows: StaffCommon[], deptNet: number): StaffCommon {
  const sum = (f: (r: StaffCommon) => number) => rows.reduce((n, r) => n + f(r), 0);
  const closedNet = sum((r) => r.closedNet), closedOrders = sum((r) => r.closedOrders);
  const rateTop = sum((r) => r.rateTop), rateBase = sum((r) => r.rateBase), hidden = rows.some((r) => r.assignedHidden);
  const hasPacked = rows.some((r) => r.packedNet !== undefined), packedNet = hasPacked ? sum((r) => r.packedNet ?? 0) : undefined;
  return {
    closedNet, closedOrders, averageOrder: closedOrders ? closedNet / closedOrders : null,
    rate: hidden || !rateBase ? null : rateTop / rateBase * 100, rateTop, rateBase, assignedHidden: hidden,
    packedNet, packedShare: packedNet !== undefined && closedNet ? packedNet / closedNet * 100 : null,
    share: deptNet ? closedNet / deptNet * 100 : null,
  };
}

/** CSKH (và khi không có báo cáo tổng quan): số chung lấy từ chính bảng nhóm sản phẩm. */
export function groupStaffCommon(s: { closed: number; closedNet: number }, deptNet: number): StaffCommon {
  return {
    closedNet: s.closedNet, closedOrders: s.closed, averageOrder: s.closed ? s.closedNet / s.closed : null,
    rate: null, rateTop: 0, rateBase: 0, assignedHidden: false, packedShare: null, share: deptNet ? s.closedNet / deptNet * 100 : null,
  };
}

/** Dòng của bảng gộp: các dòng bảng nhóm sản phẩm, thêm một dòng rỗng (cột riêng gạch ngang) cho người chỉ có ở báo cáo tổng quan.
 *  only: đang chọn vài người thì chỉ thêm những người đó. */
export function staffRowsWithCommon<T extends { sellerId: string }>(rows: T[], common: Map<string, StaffCommon> | undefined, blank: (sellerId: string, name: string) => T, only: string[] = []): (T & { onlyCommon?: boolean })[] {
  if (!common) return rows;
  const have = new Set(rows.map((r) => r.sellerId));
  const extra = [...common].filter(([id]) => !have.has(id) && (!only.length || only.includes(id))).map(([id, c]) => ({ ...blank(id, c.name || id), onlyCommon: true }));
  return [...rows, ...extra];
}
