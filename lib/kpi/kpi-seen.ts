// Xem được KPI cá nhân của ai (plan sửa web 1.3, 17/11/2026): API /api/targets trả seeKpiOf = danh sách mã người xem được,
// null = xem hết (chủ hệ thống). Trang cộng KPI cả team mà thiếu quyền một người thì hiện "–", không cộng thiếu.
export type KpiSeen = string[] | null | undefined;
/** Xem được KPI người này. Chưa tải (undefined) coi như xem được để không nháy "–". */
export const seesKpi = (seen: KpiSeen, id: string) => seen == null || seen.includes(id);
/** Xem được KPI của mọi người trong danh sách (cộng ra số cả team mới đúng). */
export const seesAllKpi = (seen: KpiSeen, ids: string[]) => seen == null || ids.every((id) => seen.includes(id));
