# Đối chiếu B1 · 19 màn / 56 khung

Đọc tại worktree `codex/app-1.0`, HEAD `909f300`. Nguồn thiết kế: các hàm `renderScreen01` đến `renderScreen19` và nhánh `subScreen` trong `thiet-ke/index.html`; đối chiếu đủ tên 56 ảnh trong `thiet-ke/anh/`. Sáng và tối dùng cùng hợp đồng dữ liệu. Không sao chép số minh họa, danh tính hoặc thông tin liên lạc.

Quy ước: đường dẫn Swift dưới `ios/Megatech/Megatech/`; `API.` là namespace struct. “Có sẵn” nghĩa app đã gọi và giải mã được, không có nghĩa mọi khối đã được bố trí như hình. “Cần gọi thêm” gồm GET mới và hợp đồng GET bổ sung cho trường app đang bỏ qua. Tên struct mới bên dưới là đề xuất chờ duyệt, chưa viết code.

`K` = `start,end,posIds`; khi route hỗ trợ phải giữ tiếp `team,hrTeam,productSegment,employeeIds` như màn cũ. Các GET `/api/reports/*` vẫn mang tham số cách tính của `MetricPrefs.queryString`. Không chuyển tham số giữa các route có hợp đồng khác nhau. Mỗi dòng chỉ được dùng đúng phạm vi API trả; thiếu giá trị là `—`, không thay bằng không.

“Demo có?” kiểm bằng `git cat-file -e origin/claude/project-thread-3ujeoc:app/api/<route>/route.ts`: Có = mã thoát 0, Không = 128. Đây là sự tồn tại route trong ref cục bộ, không phải kiểm tra HTTP hoặc bảo đảm trường mới có trên máy chủ. Route thiếu phải hiện “Chưa có trên máy chủ”, độc lập với phần còn lại. “Không áp dụng” dùng cho trạng thái và dữ liệu trong máy.

## Khung 01 · Hôm nay
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tổng thống kê Pancake, số đơn, POS, hôm qua cả ngày, số từng POS | Có sẵn | `HomeFeed.swift` refSum; `Metrics.swift` PancakeRef.current/previous, RefPos.part.total.revenue/orders | `/api/reports/pancake-ref?K` → current/previous[].pancake hoặc web.total; giữ phép cộng app cũ | Có |
| Sale, CSKH: tiền, đơn, hôm qua cùng giờ, biến động | Có sẵn | `HomeFeed.swift`; `API.swift` Overview.current/compare.total.closedNet/closedOrders | `/api/reports/overview?K&team=sale hoặc cskh&compare=yesterday` → current/compare; giữ cutoff hiện tại | Có |
| MKT: tiền, đơn XN, so cùng giờ, số về, chi phí, CP/số, CP/đơn | Có sẵn | `MarketingView.swift` MktAnalytics.current/prev; RoasMetrics.net/closed/phones/cost/costPerLead/costPerClosed | `/api/marketing/analytics?K` → current/prev, previous.cutoff | Có |
| Vận đơn: chuyển đi, giá trị, vào chờ XN, đã XN/chờ/không XN | Có sẵn | `Departments.swift` VanDon.total; VdLine.sent/sentNet/closed/confirmed/waiting/failed | `/api/reports/van-don?K` → total; giữ sentBasis | Có |
| Chuông, cần xử lý, đơn mới, chăm sóc, nhân sự, danh sách lối tắt | Có sẵn | `Tabs.swift` AlertCenter.items; `API.swift` CskhBadge.over20; `HR.swift` SatModule.badge | `/api/reports/pipeline?K&basis=created`, `/api/reports/cskh-badge`, `/api/app/modules` → total, over20, modules[].badge; nhóm việc do app cũ ghép | Có |
| Ca đang chạy: nhận/chốt, chốt nóng, TOP, đồng bộ | Có sẵn | `API.swift` Shift.total/staff; SyncPos.lastSyncAt/status; `HomeFeed.swift` shiftCard | `/api/reports/shift?date&shift&posIds&team` → total/staff; `/api/sync/pos` → lastSyncAt/status | Có |
| Con mắt, lời chào, ngày, phạm vi POS | Có sẵn | `HomeFeed.swift` hideMoney; khoá `thp_hide_money`, auth.me, ngày VN | `/api/auth/me` → role/posIds/displayName; trạng thái ẩn số lưu trên máy | Có |

## Khung 02 · Bốn bộ phận
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Sale: tiền, đơn, số chia, tỷ lệ | Có sẵn | `Departments.swift` Sections.sale.net/orders/created/closedNow/rate | `/api/reports/sections?K&productSegment` → sale | Có |
| AOV Sale | Thiếu | Sections.Sale chưa có AOV | sections.sale không trả AOV; không chia net/orders mới | Có |
| CSKH: tiền, đơn, AOV, tự upsell/từ MKT | Có sẵn | Sections.cskh.net/orders/aov/own/fromMkt | sections → cskh.net/orders/aov/self/fromMkt; không tự thêm tỷ trọng mới | Có |
| MKT: tiền, đơn XN, chi phí, số về, ROAS, CP/số, CP/đơn | Có sẵn | `Departments.swift` MktBoard; `MarketingView.swift` MktAnalytics.current | sections.mkt; `/api/marketing/analytics?K` → current; nguồn analytics không lọc mọi nhóm đơn như sections | Có |
| Tiến độ tháng ba bộ phận, mục tiêu, mốc tới hôm nay | Thiếu | `CskhOverview.swift` chỉ có tiến độ CSKH cũ; API.Targets.items | `/api/targets?month` → items[].revenue/closedOrders; không có gói tiến độ máy chủ đủ ba bộ phận như hình | Có |
| Viên tăng giảm/so kỳ cho các bảng bộ phận | Thiếu | Sections không có compare | sections không trả kỳ trước; không gọi lặp để tự dựng so kỳ | Có |
| Vận đơn theo bộ phận, tổng: chuyển đi, hoàn, giá trị, tỷ lệ | Có sẵn | Sections.shipping.sale/cskh/other/total; DeptShip.orders/net/returned/returnedNet/rateOrders/rateNet | sections → shipping, sentBasis, definitions | Có |
| Cảnh báo team, kỳ/POS/nhóm đơn, đồng bộ | Có sẵn | DeptBoards, HrTeamNotice, Sections.period/productSegment/syncedAt | sections không có hrTeam trong hàm gọi app cũ; giữ ghi chú chưa lọc theo team | Có |

## Khung 03 · Số liệu theo kỳ
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Doanh thu chốt, đơn tạo/khách mới, đơn chốt/tỷ lệ, AOV, giao thành công | Có sẵn | `API.swift` Overview.current.total (Metrics.closedNet/orders/customers/closedOrders/rate/averageOrder/groups); `Home.swift` các thẻ cũ | `/api/reports/overview?K&groupBy&team&compare&employeeIds&productSegment&hrTeam` → current.total; giao thành công từ groups.delivered.orders/net (theo ngày tạo) | Có |
| Đường doanh thu theo kỳ, điểm đỉnh | Có sẵn | Overview.current.series; SeriesRow.bucket/closedNet | overview → current.series; dùng chuỗi thật, không cố định số điểm | Có |
| KPI CSKH đã đạt/mục tiêu, tiến độ | Có sẵn | `CskhOverview.swift` CskhKpiProgress; `API.swift` Targets.items; Overview | `/api/targets?month`, overview team=cskh; giữ phép tính tiến độ đã có, không mở rộng cho bộ phận khác | Có |
| TOP nhân viên (app có, hình không vẽ) | Có sẵn | Overview.current.byEmployee; EmployeeRow.closedNet/closedOrders/rate | overview → current.byEmployee; giữ khối và quyền cũ | Có |

## Khung 04 · Theo POS
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tổng tiền, so kỳ, từng POS tiền/đơn chốt/đơn tạo | Có sẵn | `Pos.swift` PosTile/PosBreakdown; Overview.current/compare.total/byPos | `/api/reports/overview?K&groupBy&compare` → current/compare.total, byPos[].closedNet/closedOrders/orders | Có |
| Chuỗi trong kỳ, đường nhỏ mỗi POS | Có sẵn | `Pos.swift` PosSpark; SeriesRow.posId/bucket/closedNet | overview → current.series; không dựng đường từ byPos tổng | Có |

## Khung 05 · Đơn hàng
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tổng đơn, cột trạng thái, cần lưu ý/chờ chuyển/hoàn/hủy | Có sẵn | `PipelineView.swift`; `API.swift` Pipeline.total, Bucket.orders/net/gross; Overview.current.total | `/api/reports/pipeline?K&basis&team&productSegment` → total; overview → tỷ lệ hiện có | Có |
| Thẻ đơn, tiền, POS, người xử lý, giờ, tìm kiếm | Có sẵn | `Shared.swift` OrderListView/OrderQuery; API.OrderPage.orders, OrderRow | `/api/raw/orders?` OrderQuery.queryString `&page&size` → orders/hasMore; giữ lọc theo ô bấm | Có |

## Khung 06A · Đơn theo bước
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Số đơn và tiền của bước, danh sách đơn | Có sẵn | Pipeline.total; OrderPage.orders; `Shared.swift` OrderListView | `/api/reports/pipeline?K&basis` → total[bước]; `/api/raw/orders?` bộ lọc tương ứng → orders | Có |

## Khung 06B · Chi tiết đơn
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Mã/trạng thái/POS/kho/khách, tiền hàng/giảm giá/COD/sản phẩm/số lượng | Có sẵn | `API.swift` OrderDetail; OrderItem.quantity/price/discount/total; `Shared.swift` OrderDetailView | `/api/raw/orders/detail?id` → các trường OrderDetail ở gốc và items; giữ che thông tin khách như cũ | Có |
| Dòng thời gian (app có) | Có sẵn | OrderDetail.history; OrderHistory.fromName/toName/by/at | raw/orders/detail → history; giữ khối | Có |

## Khung 06C · Hồ sơ khách
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tổng chi tiêu, số mua, tạo/chốt, AOV, lịch sử đơn | Có sẵn | `API.swift` CustomerDetail.stats/profile/orders; CustomerStats; `Shared.swift` CustomerDetailView | `/api/reports/customers/detail?posId&phone` → stats/profile/orders; định danh gửi theo luồng cũ, không in ra báo cáo | Có |

## Khung 07 · Phòng ban
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Các hàng Sale/CSKH/MKT/Vận đơn/Nhân sự, điều hướng theo quyền | Có sẵn | `DeptsHome.swift`, `Tabs.swift`; API.Me.canView; HR.SatModule | `/api/auth/me` → role/views; `/api/app/modules` → modules | Có |
| Số yêu cầu chờ duyệt | Có sẵn | `HR.swift` SatModule.badge | app/modules → modules[].badge; không đổi thành tổng mọi yêu cầu | Có |

## Khung 08A · Sale
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Doanh thu, kỳ trước/kỳ này, số nhân sự, chia/chốt, nổi bật/xếp hạng | Có sẵn | `Departments.swift` SaleContent; `CskhViews.swift` RankBlock; Overview.current/compare.byEmployee/total | `/api/reports/overview?K&team=sale&compare&hrTeam` → current/compare; giữ tính trung vị hiện có ở app | Có |
| Ba thẻ nhóm sản phẩm: đơn/tiền, từng nhân viên và tổng | Cần gọi thêm | Đề xuất ProductGroupsReport; StaffTable hiện chỉ đọc staff, chưa đọc groups/staff[].groups | `/api/reports/product-groups?K&team=sale&dim=main&basis=both&by&hrTeam` → groups[].label/closed/closedNet, staff[].groups, staffTotal | Có |
| Nhóm mang đúng tên trong hình và cộng thành tổng Sale | Thiếu | Không gán nhóm main/tag thành nhóm hình bằng suy đoán | `lib/reports/product-groups-report.ts` definitions.groups: nhóm có thể giao nhau, tổng nhóm có thể lớn hơn tổng; không phải ba phần loại trừ nhau | Có |

## Khung 08B · So sánh Sale
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Bảng tên, tiền, tỷ lệ, đơn chia/chốt, AOV, kỳ trước, sắp xếp/xuất | Có sẵn | `CskhViews.swift` CompareView; `API.swift` EmployeeRow; Overview.current/compare.byEmployee | `/api/reports/overview?K&team=sale&compare&hrTeam` → byEmployee[].closedNet/rate/assignedOrders/closedOrders/averageOrder; giữ giới hạn ẩn số chia | Có |

## Khung 09A1 · Bảng nhân viên, cột đầu
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tiền đầu trang, so kỳ, tên/số chia/đơn chốt/tỷ lệ và Tổng | Có sẵn | `StaffAPI.swift` StaffTable.staff/staffTotal; StaffRow.created/closed/closeRate/closedNet; StaffCompare; `StaffTable.swift` | `/api/reports/product-groups?K&team&dim=tag&basis=both&by&hrTeam` → staff/staffTotal; `/api/reports/staff-compare?K&team&by&mode&step&hrTeam` → current/previous | Có |
| Số T cạnh tên | Cần gọi thêm | Đề xuất StaffTenureReport.people; khoá người POS | `/api/staff-tenure` → today, people[id].joined/source/t | Không |
| Đơn đã nhận, Tổng đã nhận | Cần gọi thêm | Đề xuất StaffDeliveryReport; không sửa StaffRow/StaffSum cũ | product-groups cùng bộ lọc → staff[].delivered, staffTotal.delivered | Có |

## Khung 09A2 · Bảng nhân viên, cuộn phải
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tên, T, đơn đã nhận, tiền khách trả, Tổng | Cần gọi thêm | StaffTenureReport; StaffDeliveryReport.staff/staffTotal | `/api/staff-tenure` → people; product-groups → delivered/deliveredNet/paidNet; tiền khách trả là deliveredNet, paidNet chỉ phần đã đối soát | Không (tenure); Có (product-groups) |
| Đang đóng, doanh thu, Tổng | Có sẵn | StaffRow/StaffSum.packed/closedNet; `StaffTable.swift` | product-groups → staff/staffTotal.packed/closedNet; packed là đã đi qua bước đóng, không phải chỉ đang ở bước đó | Có |
| Nhãn “Đang đóng” chỉ trạng thái hiện tại | Thiếu | Không đổi packed sang số hiện tại | definitions.packed bao gồm đơn đã đi tiếp; cần thống nhất nghĩa nhãn, không tự đổi cách tính | Có |

## Khung 09B · So cùng kỳ
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tổng đơn, kỳ trước/kỳ này/chênh lệch, chọn người/cả đội | Có sẵn | `StaffAPI.swift` StaffCompare.current/previous/staff/rowsTotal; `StaffCompare.swift` CompareSummary | `/api/reports/staff-compare?K&team&by&mode&step&cstart&cend&hrTeam` → current/previous/staff | Có |
| Đồ thị to, mini, điểm theo người/tổng | Có sẵn | CmpChart.current/previous; ChartPoint.closed/cumClosed/closedNet; CmpSeries | staff-compare → chart, staff[].chart/series/seriesRate; thiếu chart không dựng từ tổng | Có |

## Khung 09C · Data được cấp
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Đợt tháng/người/POS, số nhận/mua/mua lại, đơn, tiền, tỷ lệ | Có sẵn | `API.swift` Batches.batches; Batch.received/buyers/repeatBuyers/buyRate/orders/net; `CskhViews.swift` BatchesView | `/api/reports/batches?K&team` → batches | Có |
| Tổng đầu trang/tỷ lệ mua và chưa mua | Có sẵn | BatchesView tổng hợp như app cũ | batches → các dòng; chỉ giữ phép tổng hợp đã có, không đổi tập khách hay công thức | Có |

## Khung 09D · Trong ca
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tiến độ giờ ca, nhận/chốt/so trước, feed xác nhận | Có sẵn | `ShiftView.swift`; API.Shift.total/yesterday/feed/hours; ShiftFeed.at/net | `/api/reports/shift?date&shift&posIds&team` → total/yesterday/feed/hours; thời gian tiến độ theo giờ ca hiện có | Có |

## Khung 10 · Một nhân viên
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tỷ lệ/chia/chốt, tiền/AOV/số khách, mở đơn | Có sẵn | `StaffDetail.swift` StaffDetailReport.summary/base, Summary.rate/rateTop/rateDen/closedNet/averageOrder/createdPhones | `/api/reports/staff-detail?K&sellerId&team&productSegment&hrTeam` → summary/base; giữ assignedVisible/assignedHidden | Có |
| Chưa chốt, mới/hủy; lý do theo trạng thái, thẻ khác, danh sách đơn | Có sẵn | StaffDetailReport.statuses/reasons/otherTags/orders/reasonsPartial/hasMore | staff-detail → statuses[].n, reasons[].byStatus, otherTags[].n, orders; giữ giới hạn mẫu lý do và definitions | Có |
| Mốc ngày vào/POS/đơn đầu, huy hiệu (plan yêu cầu dù hình không vẽ) | Cần gọi thêm | Đề xuất StaffProfileReport.tenure/posCreated/firstOrderDay/badges | `/api/reports/staff-profile?id&pos` → tenure/posCreated/firstOrderDay/badges; id là POS user | Không |

## Khung 11A · Tổng quan CSKH
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tiền/so kỳ, đường theo ngày, đơn, AOV | Có sẵn | `CskhOverview.swift`; API.Overview.current/compare.total/series | `/api/reports/overview?K&team=cskh&compare&hrTeam` → total/series; không vẽ tỷ lệ chốt | Có |
| Hôm nay đã gọi, lối đi KPI | Có sẵn | `API.swift` CskhBadge.callsToday; CskhKpiProgress | `/api/reports/cskh-badge` → callsToday; targets/overview cho KPI cũ | Có |

## Khung 11B · KPI CSKH
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Mục tiêu/đã đạt, mốc hôm nay, mỗi ngày còn lại, đơn chốt, tiền | Có sẵn | `CskhOverview.swift` CskhKpiProgress.Summary; API.Targets.items, Overview.byEmployee | `/api/targets?month`, `/api/reports/overview?K&team=cskh` → items, byEmployee; giữ phép tính tiến độ cũ | Có |
| Đã chăm sóc/còn lại và phần trăm đã ghi chú | Có sẵn | `CskhViews.swift` KpiView: assigned và assigned − neverNoted; phép tính đã có | `/api/reports/care` → staff.assigned/neverNoted hoặc summary.total/neverNoted; đây là tập khách đang phân công, không phải kết quả gọi trong tháng | Có |
| Biểu đồ hiệu suất sáu tháng theo người | Cần gọi thêm | StaffProfileReport.months.month/net (đọc tối đa sáu phần tử thật) | `/api/reports/staff-profile?id&pos` → months; không tự thêm tháng thiếu thành số không | Không |
| Nút sửa mục tiêu | Có sẵn | `MoreViews.swift` TargetEditor; API.saveTargets | `/api/targets` PUT đã có; B1 không cấp phép ghi mới | Có |

## Khung 11C · Cuộc gọi CSKH
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tổng lượt, khách được ghi chú, hôm nay, bảng người/ngày (giữ app cũ) | Có sẵn | `API.swift` Calls.staff/coverage/period; CallStaff.notes/customers/byDay; CskhBadge.callsToday | `/api/reports/calls?K&team=cskh` → staff/coverage/period; cskh-badge → callsToday | Có |
| “Cuộc gọi”, “hoàn thành liên hệ” theo kết quả gọi thật | Thiếu | notes là ghi chú; không mặc nhiên là cuộc gọi thành công | calls không trả trạng thái hoàn tất cuộc gọi như hình; không đổi nghĩa notes/customers | Có |

## Khung 11D · Khách theo nhân viên
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Người phụ trách, số ngày chưa ghi chú, số đơn/tiền, danh sách khách | Có sẵn | `API.swift` Care.rows/staff/summary; CareRow; `CskhViews.swift` | `/api/reports/care?posIds&assigned&sort&minDays&q&page&size` → rows/staff/summary; giữ che dữ liệu khách | Có |

## Khung 11E · Mua lại & Upsell
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Lần mua, số đơn/tiền, khách gần đây, người xử lý; giữ funnel/bảng cũ | Có sẵn | `API.swift` Repurchase.summary/funnel/byEmployee/byTag/recent; RepRecent.level/net/prior | `/api/reports/repurchase?K&sellerId&team&productSegment` → summary/funnel/byEmployee/byTag/recent | Có |
| Ngày chưa ghi chú gắn vào khách mua lại | Thiếu | RepRecent không có ngày chưa ghi chú | Không ghép care với repurchase bằng phỏng đoán; thiếu ô hiện — | Có |

## Khung 11F · Khách lâu chưa mua
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Ngày chưa mua, lần mua, tổng chi tiêu, người phụ trách, danh sách | Có sẵn | `API.swift` CustomerPage.customers; CustomerRow.daysSinceSuccess/successOrders/successNet/sellerName | `/api/reports/customers?posIds&segment&sort&q&page&size` → customers; không gọi ngày chưa mua là ngày chưa ghi chú | Có |

## Khung 12A · Marketing
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tiền/so kỳ, chuỗi, chi phí, số về, đơn XN, ROAS, CP/số, CP/đơn | Có sẵn | `MarketingView.swift` MktAnalytics.current/prev/timeline/people/teams/products; RoasMetrics | `/api/marketing/analytics?K&marketerId&teamId&product&team` → current/prev/timeline/people/teams/products; giữ ROAS theo phần có chi phí | Có |
| DT New, DT CSKH trong bảng người/sản phẩm, tổng | Cần gọi thêm | Đề xuất MktAnalyticsSplitReport; RoasMetrics cũ không có newNet/cskhNet/otherNet | analytics cùng bộ lọc → current/prev, people/products[].newNet/cskhNet/otherNet; `lib/reports/mkt-analytics.ts` | Có |
| Khẳng định DT New + DT CSKH luôn bằng tổng MKT; vòng chia | Thiếu | Không bỏ otherNet để ép khớp | analytics có otherNet; chỉ vẽ vòng khi phần thực sự khớp tổng, cần chốt nghĩa nếu giữ đẳng thức trong plan | Có |

## Khung 12B · Xếp hạng MKT
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tổng đơn duy nhất, xếp hạng, tiền, tỷ lệ XN, sau hoàn/hủy, giao, New/CSKH | Có sẵn | `MarketingRank.swift` MarketingRankReport; MarketingRankRow.fields: orders/net/confirmationRate/netAfterRefund/deliveryRate/newNet/cskhNet | `/api/reports/marketing?K&basis=confirmed&stage=confirmed&marketingTeamId` → báo cáo xếp hạng; giữ tổng API thay vì cộng dòng sản phẩm | Có |
| Vòng tỷ trọng New/CSKH | Có sẵn | MarketingRankRow giải mã số New/CSKH | reports/marketing → newNet/cskhNet/net; chỉ vẽ nếu tổng khớp, không chuẩn hóa phần thiếu | Có |

## Khung 13 · Vận đơn
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Chuyển đi/giá trị, vào chờ XN, đã XN/chờ/không XN, hoàn và tỷ lệ | Có sẵn | `Departments.swift` VanDon.total; VdLine.sent/sentNet/closed/confirmed/waiting/failed/returned/returnedNet/returnRate/returnRateNet | `/api/reports/van-don?K&hrTeam` → total; giữ sentBasis | Có |
| Theo bộ phận người lên đơn và Tổng; người gọi xác nhận, tỷ lệ, hoàn | Có sẵn | VanDon.sellerDepts/confirmers; VdLine.confirmRate | van-don → sellerDepts/confirmers; sellerDepts là cấp bộ phận, không tự gọi label là từng người | Có |
| Bảng từng người lên đơn như hình | Cần gọi thêm | Đề xuất VanDonSellersReport.sellers; API.VanDon cũ chưa giải mã sellers | `/api/reports/van-don?K&hrTeam` → sellers[].key/label/dept/closed/sent/sentNet/returned/returnedNet/returnRate/returnRateNet; `lib/reports/van-don.ts` buildVanDon | Có |
| Lý do không XN, số đơn, đồng bộ | Có sẵn | VanDon.reasons/syncedAt; VdReason.reason/n | van-don → reasons/syncedAt; luôn giữ dòng tính riêng | Có |

## Khung 14 · Thông báo
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Nhóm/việc ưu tiên, đơn, chăm sóc, nhân sự, ca | Có sẵn | `Tabs.swift` AlertCenter/AlertsPage; Pipeline.total, CskhBadge, SatModule.badge, Shift.total | pipeline, cskh-badge, app/modules, shift → nguồn như khung 01; giữ cách ghép/đếm cũ | Có |
| Từng POS: cập nhật, số bản ghi, lỗi/chậm, tải lại | Có sẵn | `API.swift` SyncPos.records/lastSyncAt/lastError/status/errors24h | `/api/sync/pos` → mảng POS; giờ chỉ hiện khi có, không bịa ngày để nhóm thông báo | Có |

## Khung 15A · Thêm
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Hồ sơ tài khoản, nhóm menu/quyền, vệ tinh, quét đăng nhập | Có sẵn | `Tabs.swift` MoreHome/MoreGroup/SatelliteSection; API.Me, SatModule; `Approvals.swift` ScanLoginRow | `/api/auth/me`, `/api/app/modules`, `/api/auth/approvals` → tài khoản/modules/items; giữ hàng chính sách/widget | Có |

## Khung 15B · Báo cáo cuối tháng
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tổng tiền/so kỳ, chuỗi tháng, tổng đơn/giao/xử lý/hủy, theo POS, xuất | Có sẵn | `MoreViews.swift` MonthlyView/DualLine; API.Overview.current/compare.total/series/byPos | `/api/reports/overview?K&groupBy&compare` → current/compare; giữ nghĩa và cách tổng hợp cũ, không tự đổi đường sang lũy kế | Có |

## Khung 15C · KPI Sale & chia KPI team
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Mục tiêu doanh số, đã đạt, đơn/tỷ lệ theo người | Có sẵn | `MoreViews.swift` TargetEditor; API.Targets.items.revenue/closedOrders; Overview.byEmployee | `/api/targets?month` → items; overview team=sale → byEmployee; giữ quyền chủ | Có |
| Chỉ tiêu mới team/người: số chia/chốt/đơn/upsell/sản phẩm | Cần gọi thêm | Đề xuất Kpi2Report.month/items/editable; Kpi2Goal | `/api/kpi2?month` → items[key].assigned/closed/orders/upsellRate/products; đây là chỉ tiêu, không phải số thực đạt | Không |
| Chỉ tiêu tỷ lệ chốt riêng từng người/team như hình | Thiếu | Kpi2 không có saleCloseRate; không dùng upsellRate thay | `lib/kpi/kpi2.ts` chỉ có assigned/closed/orders/upsellRate/products; ngưỡng Sale chung là luật hiển thị, không phải KPI riêng từng người | Không (kpi2) |
| Chia/sửa KPI mới | Thiếu | B1 chỉ đề xuất GET, không cấp phép PUT kpi2 | Cần hỏi nếu yêu cầu thao tác ghi mới; giữ màn chỉnh targets đã có | Không (kpi2) |

## Khung 16A · Tìm hồ sơ khách
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tìm, POS, danh sách khách/phụ trách/tổng chi tiêu | Có sẵn | `Shared.swift` CustomerSearchView; API.CustomerPage.customers/total; CustomerRow.sellerName/successNet | `/api/reports/customers?posIds&q&sort=recent&page=1&size=20` → customers/total; giữ che liên lạc | Có |

## Khung 16B · Báo cáo tùy chỉnh
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Chọn chỉ số/cách nhóm/biểu đồ, tổng và từng POS, xem trước | Có sẵn | `MoreViews.swift` CustomReportView; API.Overview.current.total/byPos/series | `/api/reports/overview?K&groupBy&compare` → current; các lựa chọn là trạng thái cục bộ cũ | Có |

## Khung 16C · Đơn Pancake POS
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Danh sách nguồn, POS/sản phẩm/người/tiền, lọc/phân trang | Có sẵn | `MoreViews.swift` RawOrdersView; API.OrderPage.orders/hasMore | `/api/raw/orders?` OrderQuery `&page&size` → orders/hasMore | Có |
| Tổng đơn tất cả trang và phân bổ POS ngay đầu màn | Thiếu | OrderPage không có total/byPos | Không dùng số dòng trang hiện tại như tổng toàn phạm vi; hiện — hoặc giữ mô tả cũ | Có |

## Khung 16D · Bảo mật tài khoản
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Phương thức 2 lớp/passkey, thiết bị/phiên tin cậy, đăng xuất phiên | Có sẵn | `Security.swift`; API.Security.totpEnabled/passkeys/devices/mfaEnabled; Sessions.sessions | `/api/auth/security`, `/api/auth/sessions` → phương thức/phiên; giữ thao tác đã có | Có |
| Khoá ứng dụng/Face ID, chỉ số an toàn đủ phương thức | Có sẵn | SecurityView và trạng thái khoá cũ | Trạng thái máy kết hợp API như code cũ; không cố định điểm an toàn theo hình | Không áp dụng |

## Khung 16E · Cách tính
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Cơ sở tỷ lệ, doanh số/nhóm thành công, mặc định công ty | Có sẵn | `Metrics.swift` MetricPrefsResponse.settings/own/labels; MetricSettings | `/api/prefs/metrics` → settings/own/labels; giữ PUT/reset cũ và số tham chiếu Pancake | Có |

## Khung 16F · Cấu hình & kết nối
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| POS/kết nối/lỗi/cập nhật, team, ca cá nhân | Có sẵn | `Config.swift`; API.Config.shops, ConfigShop.status/lastSyncAt/lastError; MktTeams, StaffSettings | `/api/config`, `/api/sync/pos`, `/api/marketing-teams`, `/api/staff-settings` → shops/POS/teams/items | Có |
| Tổng POS/lỗi, lịch đồng bộ, đồng bộ ngay | Có sẵn | ConfigView/SyncStatus và API.syncNow hiện có | sync/pos → status/errors24h; giữ nhãn lịch và thao tác cũ, không đưa khoá cấu hình nhạy cảm lên UI | Có |

## Khung 16G · Nhật ký hoạt động
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Tổng sự kiện, giờ/người/hành động/trạng thái, lọc | Có sẵn | `MoreViews.swift` AuditView; API.Audit.total/items/labels/groups; AuditItem.at/action/status | `/api/audit?size&page&group&from&to&q` → total/items/labels/groups; không coi status HTTP là trạng thái duyệt nhân sự | Có |

## Khung 16H · Cài đặt máy này
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Hiện logo, trang mở đầu, khoá khi quay lại | Có sẵn | `AppSettings.swift`; các tuỳ chọn và khoá lưu cũ | Không cần route; không thay logic logo/Face ID/khoá | Không áp dụng |
| Chẩn đoán widget (app có, hình không vẽ) | Có sẵn | `WidgetProbe.swift` WidgetDiagnosticsView/WidgetCheckReport | Chỉ đọc trạng thái chẩn đoán cũ trong máy; giữ hàng mở trang | Không áp dụng |

## Khung 17A · Tổng quan nhân sự
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Quân số, vào/nghỉ, tỷ lệ nghỉ/thử việc, chi nhánh/phòng/chưa xếp | Có sẵn | `HR.swift` HR.Overview.total/probation/unplaced/offices/departments; HR.Total.end/joined/left/turnover | `/api/sat/hr/overview?from&to` → total/probation/unplaced/offices/departments; `HRViews.swift` | Có |

## Khung 17B · Danh sách nhân sự
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Danh sách, tìm/lọc trạng thái/phòng/chi nhánh, vai trò kiêm nhiệm, đếm | Có sẵn | `HR.swift` HR.People.people/offices/departments; Person.status/office_id/department_id/role_label/concurrent | `/api/sat/hr/people` → people/offices/departments; lọc và đếm theo code cũ | Có |
| T cạnh tên | Cần gọi thêm | StaffTenureReport.people, cần nối mã HR với POS qua hồ sơ | `/api/staff-tenure` → people khoá POS; `/api/sat/hr/person?id` → posAccounts; không dùng HR id như POS id | Không (tenure); Có (person) |

## Khung 17C · Hồ sơ nhân sự
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Hồ sơ làm việc, trạng thái, chi nhánh, chức danh, quản lý/cấp dưới | Có sẵn | `HR.swift` HR.PersonDetail.employee/assignments/chain/reports/statusHistory; `HRViews.swift` | `/api/sat/hr/person?id` → employee/assignments/chain/reports/statusHistory; chỉ dùng trường công việc an toàn | Có |
| Doanh số tháng, so cùng ngày, đơn, hạng, chuỗi sáu tháng | Có sẵn | HR.Performance.revenue/prevSameDays/closedOrders/rank/series | sat/hr/person → performance; API lấy tài khoản POS đầu tiên có số, không phải tự cộng mọi tài khoản | Có |
| T/mốc hành trình, tháng tốt nhất/top tháng/huy hiệu | Cần gọi thêm | StaffProfileReport.tenure/posCreated/firstOrderDay/months/best/topMonths/badges; ánh xạ qua PersonDetail.posAccounts | `/api/reports/staff-profile?id&pos` → các trường trên; id POS, không phải HR id | Không |
| Đúng số lượng/tên/cấp huy hiệu, đơn lớn nhất như hình | Thiếu | Chỉ đọc badges do máy chủ trả; không tạo đủ huy hiệu minh họa | `lib/reports/staff-badges.ts` quyết định huy hiệu; StaffProfile.best.day là tổng ngày, không phải đơn lớn nhất | Không (staff-profile) |
| “Từ trước tới nay” cho một POS user | Có sẵn | HR.Performance.lifetime.revenue/closedOrders/firstDay; đồng nhất mọi POS user của HR thì chưa có | sat/hr/person.performance.lifetime.revenue/closedOrders/firstDay đã có, từ stats_daily của một POS user (không giới hạn 24 tháng); StaffProfile.months mới chỉ tối đa 24 tháng; không thay lifetime bằng tổng months | Có (person); Không (profile) |
| Yêu cầu thay đổi/lịch sử | Có sẵn | HR.PersonDetail.requests/statusHistory; HR.ChangeRequest.can_decide | sat/hr/person → requests/statusHistory; giữ quyền và thao tác có sẵn | Có |

## Khung 17D · Sơ đồ tổ chức
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Chi nhánh/phòng/team, người phụ trách, thành viên/chức danh | Có sẵn | `HR.swift` HR.Org.units; OrgUnit.office_name/head/members/parent_id; Member.level_name/title_name | `/api/sat/hr/org` → units; giữ cấu trúc và cách đếm cũ | Có |

## Khung 17E · Duyệt thay đổi
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Số chờ, danh sách yêu cầu/tóm tắt/ghi chú/người duyệt, nút quyết định | Có sẵn | `HR.swift` HR.ChangeList.requests; ChangeRequest.summary/state/approver_name/can_decide; hrDecide | `/api/sat/hr/approvals?state=pending hoặc done` → requests; POST đã có chỉ khi can_decide, không mở quyền mới | Có |

## Khung 17F · Tuyển dụng
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Danh sách, vị trí, trạng thái, nguồn, phỏng vấn, chi tiết | Có sẵn | `API.swift` RecruitList.candidates/statusLabels/sources; Candidate; `RecruitView.swift` | `/api/recruit/candidates` → candidates/statusLabels/sources; `?id` → candidate/events/cv; giữ đếm theo code cũ | Có |
| Tổng ứng viên/đã tuyển, xét duyệt, phỏng vấn, vị trí | Có sẵn | RecruitView count: đã tuyển = passed + trial; xét duyệt = new + review; phỏng vấn = booked + interviewed; tổng = candidates.count | recruit/candidates → candidates; giữ cách đếm app cũ, không đổi định nghĩa | Có |
| Tỷ lệ tuyển và nút thêm ứng viên | Thiếu | Chưa có tỷ lệ máy chủ; nút cộng cũ mở nguồn Sheets | Hiện — cho tỷ lệ, giữ mở nguồn cũ; không tạo POST mới | Có |

## Khung 18A · Chọn kỳ
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Kỳ nhanh/từ ngày/đến ngày/áp dụng | Có sẵn | `PeriodChips.swift`, Period; `Shared.swift` bộ lọc | Trạng thái cục bộ → start/end hoặc from/to đúng từng route khi tải | Không áp dụng |

## Khung 18B · Chọn POS/team
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| POS được cấp, team/mentor/số người, ghi chú chưa lọc team | Có sẵn | `Pos.swift`; `HrTeam.swift`; `StaffAPI.swift` HrTeamItem.id/name/people/mentor/office/dept; API.Me.posIds | `/api/teams?list=1` → teams; `/api/auth/me` → posIds/role; giữ suffix hrTeam và cảnh báo từng khối | Có |

## Khung 18C · Giải thích chỉ số
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Số tiền/đơn cấu thành/so kỳ, định nghĩa/phạm vi, mở đơn | Có sẵn | `Shared.swift` MetricExplain/ExplainSheet; Overview/StaffCompare/definitions của nguồn tương ứng | Route nguồn giữ nguyên bộ lọc → số/definitions; mở raw/orders hoặc staffOrders cùng bộ lọc | Có |
| Dòng “Đối soát: Khớp số nguồn” | Thiếu | Không có kết quả kiểm chứng khớp cho mọi chỉ số | Overview.reconcile là số đối soát, không bảo đảm mọi ô khớp; bỏ câu khẳng định nếu chưa có chứng cứ | Có |

## Khung 18D · Lọc danh sách đơn
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| POS/nhóm trạng thái/tính theo/áp dụng | Có sẵn | `Shared.swift` OrderFilterSheet/OrderQuery/OrderFilters | `/api/raw/orders?` queryString bộ lọc; chỉ gửi sau thao tác theo luồng cũ | Có |

## Khung 18E · Đang tải
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Skeleton, không có số nghiệp vụ | Có sẵn | `Kit.swift` StateView; `Anim.swift` Skeleton | loading cục bộ; không đưa ghi chú thiết kế vào app | Không áp dụng |

## Khung 18F · Lỗi/quyền/hết phiên
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Mất kết nối/chậm/chưa có quyền/hết phiên, thử lại/đăng nhập | Có sẵn | `API.swift` APIError.status/message/sessionExpired; `Kit.swift` StateView | Lỗi mạng/HTTP từ route đang gọi; không thêm API, không giả số không | Không áp dụng |

## Khung 18G · Trống
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Không có đơn, xem bộ lọc/về trang | Có sẵn | StateView/OrderListView; OrderPage.orders | raw/orders → orders rỗng; phân biệt rỗng với lỗi và route 404 | Có |

## Khung 19A · Đăng nhập
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Form/nhớ máy/tài khoản nhớ, bước tiếp, chính sách | Có sẵn | `LoginView.swift`, `LoginShell.swift`; `API.swift` LoginStep.step | `/api/auth/login` POST đã có → step; trường đã nhớ lưu máy; giữ nguyên chữ và logic | Có |

## Khung 19B · Xác minh
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Mã xác minh, số ghép, đếm lùi, từ chối/hết hạn/dự phòng | Có sẵn | API.LoginStep.challengeId/number/seconds/fallback/requestId; PollResult.status | `/api/auth/verify`, `/api/auth/qr` POST cũ → LoginStep/status; không hardcode số trong hình | Có |

## Khung 19C · Khoá/Face ID
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Chào lại, khoá/mở lại trang, Face ID/mật mã/đăng xuất | Có sẵn | Cơ chế khoá hiện có; B1 không sửa và các bước sau không đổi logic | Trạng thái máy; đăng xuất theo API cũ, không cần GET mới | Không áp dụng |

## Khung 19D · Quét/duyệt máy khác
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Quét QR, thiết bị/vị trí/thời điểm, lựa chọn số, xác nhận/chặn | Có sẵn | `Approvals.swift`; API.Approval/ApprovalItem/Approvals; decide | `/api/auth/approvals?id` → item; POST quyết định đã có; trường thiếu không bịa vị trí | Có |

## Khung 19E · Xác nhận mật khẩu
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |
|---|---|---|---|---|
| Form xác nhận/tiếp tục/đổi tài khoản/đăng xuất | Có sẵn | `LoginView.swift`, `LoginShell.swift`; API.reauth/Reauth | `/api/auth/reauth` POST cũ → kết quả; không đổi luồng | Có |

## Cần gọi thêm (tổng hợp)
| Route | Tham số | Struct mới | Trường dùng | Màn | Demo có? |
|---|---|---|---|---|---|
| GET `/api/reports/staff-profile` | `id` POS user, `pos` danh sách POS; không có start/end | StaffProfileReport, ProfileMonth, ProfileBadge, ProfileTenure | tenure.joined/source/t, posCreated, firstOrderDay, months.month/net/closedOrders/rate/rank/of, best, topMonths, badges; tên/cấp huy hiệu theo web | 10, 11B, 17C | Không |
| GET `/api/staff-tenure` | Không | StaffTenureReport, StaffTenureItem | today, people[id].joined/source/t; id POS, cần ánh xạ riêng với HR | 09A1, 09A2, 17B | Không |
| GET `/api/reports/product-groups` (hợp đồng nhóm sản phẩm) | K, team, hrTeam, dim=main, basis=both, by; nhóm chờ hỏi trước dùng | ProductGroupsReport, ProductGroupCell, ProductGroupStaff | groups.label/closed/closedNet, staff.sellerId/name/groups, staffTotal; giữ definitions | 08A | Có; chưa kiểm trường qua HTTP |
| GET `/api/reports/product-groups` (bổ sung đọc số giao) | Giống URL bảng cũ: K, team, hrTeam, dim=tag, basis=both, by | StaffDeliveryReport, StaffDeliveryRow, StaffDeliveryTotal | staff[].sellerId/delivered/deliveredNet/paidNet; staffTotal.delivered/deliveredNet/paidNet | 09A1, 09A2 | Có; chưa bảo đảm bản demo có trường mới |
| GET `/api/marketing/analytics` (bổ sung tách New/CSKH) | K, marketerId, teamId, product, team như hàm cũ | MktAnalyticsSplitReport, MktSplitCell | current/prev/people/products: newNet/cskhNet/otherNet/net, khoá id/product | 12A | Có; chưa bảo đảm bản demo có trường mới |
| GET `/api/reports/van-don` (bổ sung bảng người lên đơn) | K, hrTeam như hàm cũ | VanDonSellersReport, VanDonSellerRow | sellers[].key/label/dept/closed/sent/sentNet/returned/returnedNet/returnRate/returnRateNet | 13 | Có; chưa kiểm trường qua HTTP |
| GET `/api/kpi2` | month | Kpi2Report, Kpi2Goal | month, items[key].assigned/closed/orders/upsellRate/products; editable không cấp phép ghi | 15C | Không |

Không bổ sung GET `/api/dispatch`: app có trang Điều hành/Trong ca hiện tại; route này là cấu hình chia số (`shops`, nhân viên), không phải nguồn tiến độ ca. Không bổ sung `/api/reports/delivered-products` chỉ vì route mới: các khung hiện tại đã có số giao trong overview; route sản phẩm giao xếp theo ngày khách nhận (khác ngày chốt), tối đa ba tháng, không dùng thay doanh thu chốt hay cột tiền khách trả. Cả hai route đã đọc, dispatch có trong ref demo (0), delivered-products không có (128).

Mọi route đề xuất GET ở trên đều cho phép chủ hệ thống. `staff-profile` kiểm isOwner; `staff-tenure`, product-groups, analytics kiểm phiên; `kpi2` cho owner toàn bộ phạm vi. Nhân sự đi qua `/api/sat/hr/*` và `hrBoss/canView(people)`; không gọi trực tiếp API của web nhân sự. Không có đề xuất route bắt buộc quyền khác owner.

Hạn chế cần tổ app duyệt: mục 2.2 cấm sửa struct/hàm/thời điểm/số lần gọi cũ. Các dòng “bổ sung đọc” ở đây phải là hợp đồng thêm riêng, chưa được tự ý sửa decoder cũ hay nhân đôi GET bảng hiện có. Nếu không thể thực hiện bằng phần thêm mà giữ ràng buộc này thì để khối thiếu và giao lại, không tự mở rộng phạm vi.

## Thiếu (web không trả)
| Màn | Thứ thiếu | Đề xuất: bỏ khối / hiện — / hỏi người dùng |
|---|---|---|
| 02 | AOV Sale trong Sections.Sale | Hiện —; không chia mới từ net/orders |
| 02 | Tỷ trọng tự upsell/từ MKT khi chưa có tỷ lệ máy chủ | Hiện — cho phần trăm; giữ đơn và tiền, không chia mới |
| 02 | Tiến độ ba bộ phận đồng nhất như hình | Bỏ khối mới; giữ tiến độ CSKH đã có |
| 02 | So kỳ trong sections | Bỏ thanh đôi/viên biến động theo mục 2.3 và B4 |
| 08A | Bộ ba nhóm theo hình, tổng nhóm là tổng Sale | Hỏi người dùng: chấp nhận nhóm web và ghi rõ giao nhau hay cần hợp đồng khác? |
| 09A2 | “Đang đóng” nghĩa trạng thái hiện tại, trong khi packed là đã qua bước đóng | Hỏi người dùng về nhãn đúng nghĩa web; giữ số cũ, không đổi phép tính |
| 11B | Kết quả gọi thành công trong tháng nếu hiểu thanh chăm sóc theo nghĩa đó | Giữ thanh đã ghi chú trên tập đang phân công như app cũ; không đổi thành kết quả gọi |
| 11C | Cuộc gọi thực/hoàn thành liên hệ từ dữ liệu ghi chú | Hỏi người dùng: giữ tên và nghĩa ghi chú hiện có hay cần nguồn cuộc gọi thật? |
| 11E | Ngày chưa ghi chú trong recent mua lại | Hiện —; không ghép khách bằng dữ liệu suy đoán |
| 12A | Đẳng thức hai phần New/CSKH bao trọn MKT khi còn otherNet | Hỏi người dùng: giữ phần khác và đúng tổng web; bỏ vòng nếu hai phần không khớp |
| 15C | KPI tỷ lệ chốt riêng team/người; luồng chia KPI mới | Hỏi người dùng: giữ GET chỉ tiêu sẵn có và ngưỡng chung hay cần bước riêng cho hợp đồng/ghi? |
| 16C | Tổng toàn phạm vi và phân POS trong OrderPage | Hiện — ở ô thiếu; không lấy số trang đầu làm tổng |
| 17C | Đủ mọi huy hiệu, tên/cấp theo mẫu và đơn lớn nhất | Bỏ ô đơn lớn nhất nếu thiếu; huy hiệu lấy đúng web, không làm đủ số lượng minh họa |
| 17C | Tổng đồng nhất mọi tài khoản POS user của một HR | Hỏi người dùng: giữ performance.lifetime của một POS user hiện tại và ghi rõ phạm vi hay cần hợp đồng tổng hợp khác? Không dùng tổng months giới hạn của staff-profile thay lifetime |
| 17F | Tỷ lệ tuyển và thao tác tạo ứng viên trong app | Hiện — cho tỷ lệ; giữ nút mở nguồn cũ, không bổ sung POST |
| 18C | Kết luận mọi chỉ số đều “Khớp số nguồn” | Bỏ câu khẳng định; giữ định nghĩa/phạm vi và số đối soát thật khi có |

## Câu hỏi

1. **08A — đổi nghĩa phân nhóm:** hình dùng ba nhóm cộng thành tổng, web định nghĩa nhóm có thể giao nhau. Dùng nguyên nhóm và lời giải thích web, hay cần hợp đồng dữ liệu khác? Chưa được tự đổi nhóm/tính lại.
2. **09A2 — đổi nghĩa số đóng hàng:** giữ nghĩa packed là đã qua bước đóng và nhãn app cũ, thay vì hiểu là đang ở trạng thái đóng như hình, có được không?
3. **11C — khối chính:** nguồn hiện có đo ghi chú/khách được ghi chú, chưa chứng minh số cuộc gọi và hoàn tất liên hệ. Giữ nguyên nghĩa web hay cần nguồn cuộc gọi thật?
4. **12A — đổi nghĩa tổng:** analytics trả cả otherNet. Plan nói New + CSKH = MKT, nhưng không được bỏ phần khác để ép tổng. Có giữ đầy đủ phần máy chủ trả và bỏ vòng hai phần khi không khớp không?
5. **15C — bảng chính/cách tính:** kpi2 không có KPI tỷ lệ chốt riêng. Có giữ ngưỡng Sale chung và chỉ tiêu GET hiện có không? Nếu cần chia/sửa KPI mới thì phải có bước cho phép thao tác ghi, ngoài B1.
6. **17C — đổi phạm vi:** performance nhân sự có lifetime không giới hạn kỳ nhưng lấy một POS user đầu tiên có số; staff-profile dùng POS user và phạm vi POS riêng, months tối đa 24 tháng. Khi một HR có nhiều tài khoản, giữ nguồn hiện tại làm chuẩn hay cần hợp đồng khác? Không thay lifetime bằng tổng months giới hạn, không tự cộng hoặc ghép thành hồ sơ khác nghĩa.
7. **Ràng buộc bổ sung hợp đồng:** duyệt cách thêm decoder cho trường đã có trên route product-groups/analytics/van-don mà vẫn không sửa struct/hàm cũ, không đổi số lần/lúc gọi. Nếu không có cách phù hợp phạm vi, để —/bỏ phần mới và giao bước riêng.

Không có route đề xuất cần quyền khác chủ hệ thống. Dừng tại B1; bảng GET bổ sung và các câu hỏi trên chờ tổ app duyệt trước B2.
