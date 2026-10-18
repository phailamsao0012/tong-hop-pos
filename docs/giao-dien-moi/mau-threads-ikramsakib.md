# Mẫu giao diện Threads @ikramsakib (Ikram Hossain, Design Engineer)

Mở bằng Chrome trên Mac anh Vũ ngày 12/10/2026, chỉ xem. 36 bài gần nhất (4/10 → 12/10/2026). Mã màu phần lớn đo từ điểm ảnh gốc; "~" là ước lượng.

## Phần 1: tổng quan và phong cách chung
Tác giả đăng gần như toàn ảnh/video web app SaaS kiểu "operations / command center" có AI agent. Mỗi app nhiều bài (mỗi bài 1 trang): HealthCRM, Estate Ops (bất động sản), St. Aurelia General (bệnh viện + AI agent), Northstar Labs (AI workflow), Foresight Money Center, Zohoor Inventory POS, Buildwise AI, CargoFlow, Brightdesk, Vellum Legal Ops, Halden.

1. Khung trưng bày ảnh (không phải giao diện): ảnh 4:3/vuông, cửa sổ app lệch, tràn mép phải/dưới, bo 16–20px, nền xám trơn (#b6b6b6, #c3bfbe, #dedede, #e3dfde) hoặc nền texture màu thương hiệu (gradient teal hạt #358079→#4d8981, bản đồ chấm pixel #74ab82, vân đá xanh, dither xanh dương #1a3cff→#3fc0ff).
2. Bố cục app: sidebar trái ~220–240px nền khác main 1 tông (xám ấm #f1f0ee / #f5f5f7 / #f9fafc / be hồng #f6efe9); main trắng; topbar mỏng ~56px chỉ breadcrumb ("St. Aurelia General / Discharge Planner"), ô tìm có "Ctrl K"/"⌘K", chuông chấm cam, avatar tròn; nút chính góc phải trên.
3. Sidebar: logo + tên app + tên tổ chức nhỏ + mũi tên chọn workspace; nhóm có nhãn CHỮ HOA nhỏ xám; icon nét mảnh 16px (Lucide); số đếm xám bên phải; mục chọn = nền trắng + bóng rất nhẹ (trên sidebar xám) hoặc xám đậm hơn 1 tông; badge đỏ/cam tròn. Đáy: avatar + tên + chức danh + ⌃⌄.
4. Hàng 4 thẻ KPI dưới tiêu đề: nhãn xám 12px → số 24–28px semibold (không bold nặng) → dòng phụ 11–12px xám hoặc xanh/đỏ có mũi tên ("↑ 12.3 pts vs last month" #1f9d55). Thẻ trắng, viền 1px #e6e7eb/#ebebeb, bo 10–12px, gần như không bóng. Icon nhỏ màu trong ô vuông bo góc ở góc phải trên.
5. Chào theo giờ: "Good evening, Ikram. 22 things need you, 6 of them now." – vế đầu đen, vế sau xám #9a9a9a cùng dòng. Tiêu đề chi tiết cũng 2 màu.
6. Khối AI: ✦ + tên AI; "NEEDS YOUR APPROVAL 5": icon tròn pastel + tiêu đề đậm + dòng phụ xám + nút "Decline" (chữ trơn) / "Approve" (viền). Cuối: "WORKING ON 0 – Idle. Press Ctrl K to hand it a task." và "15 tasks done today · about 2.3 hours saved". Ô "Ask … AI  Ctrl K" ở topbar.
7. Chữ: sans hiện đại (Inter / IBM Plex Sans / SF); SỐ và mã dùng MONO (JetBrains/IBM Plex Mono). Sans + mono là dấu hiệu mạnh nhất. Tiêu đề trang 22–28px semibold; nhãn 11–12px; dòng bảng 13px.
8. Mỗi app MỘT màu nhấn, còn lại trung tính: HealthCRM teal #0f6b5f; Estate Ops xanh #0a7aff; CargoFlow tím #7360ed; Foresight xanh rừng #00684e/#005c3f; Northstar nâu mận #4a1f2c; St. Aurelia cam #f5a521; Buildwise #1e9bff trên nền đen.
9. Pill trạng thái nền pastel + chữ đậm cùng tông, bo tròn: At risk #fcf4e8/cam; Customs hold #fdedee/đỏ; In transit #ece8ff/tím; Booked #f0f1ff; Done #dff6e9/xanh; Running viền xanh + chấm; Waiting approval vàng nhạt + chấm cam; Duplicate viền cam đỏ; Passed xám.
10. Dark: gần đen/than #0a0a0a–#141414, thẻ #1e1e1e viền #2a2a2a; HealthCRM dark nền #161c22, thẻ ~#1f262e, teal sáng #2ccfc0. Giữ nguyên bố cục bản sáng.

## Phần 2: từng bài (mới → cũ), bài 1–12
1. CargoFlow Shipments (ảnh): nền ngoài #b6b6b6; sidebar #eeeef0, mục chọn trắng. Tiêu đề "Shipments" 22px + dòng phụ xám. Nút "+ Create shipment" tím #7360ed bo tròn, bóng tím nhẹ. 4 KPI nền #f5f5f7 bo 12px: icon trong ô vuông trắng bên trái, nhãn + dòng phụ, SỐ to bên phải. Tabs gạch chân tím có số đếm trong ô xám; segmented bên phải. Ô tìm full-width. Bảng: MỖI DÒNG LÀ THẺ TRẮNG RIÊNG trên nền #f5f5f7 (cách 4px): mã đậm + mô tả xám + icon cảnh báo cam, Route "Houston to Memphis" ("to" xám), pill trạng thái, ngày + "Estimated", chevron >.
2. Buildwise AI (video 31s, DARK terminal): nền #000, chữ thường toàn bộ, nhãn MONO, tiêu đề sans. Khung đường chấm có dấu + ở góc; tiêu đề khối "[ BRIEFING ]" "[ HEALTH ]" "[ FORECAST ]" xanh #1e9bff. Câu chính 20px trắng. Health = icon hình học (vuông đỏ, tam giác cam, chấm xanh). Forecast "$244.7M" mono 32px + mini bar bậc thang. Tiến độ ASCII "[=====------] 18d". Bảng "NEEDS YOUR DECISION · 3" với "[======--] 72%". "■ critical" đỏ, "▲ high" cam, "review ->". Hover dòng nền #111. Timeline "[ NEXT 14 DAYS ]" chấm nối dọc.
3. St. Aurelia Discharge Planner (ảnh, sáng): sidebar 2 tầng: rail icon 56px (badge cam) + cột lọc #f1f0ee. Kanban 5 cột nền #e9e8e6 bo 12px, thẻ #fafafa bo 8px: tên đậm, mã mono xám, thanh tiến độ cam #f3a527 + đồng hồ mono. Khối đếm ngược ô số lật; checklist vòng tròn cam ✓, chữ gạch ngang khi xong, nhãn "Agent"; "Agent drafts" tabs pill + textarea xám.
4. Estate Ops hoạt động (video 15s): 3 cột: sidebar #f3f2f0 · cột "Briefing" (Agenda/Activity) nhóm "● Now" / "Today" / "This week", mỗi dòng icon màu + giá trị phải · main: lời chào 2 màu, 4 KPI, "Financial overview" kiểu CARD-IN-TRAY (khối nền xám #f5f5f5 chứa thẻ trắng lồng trong), lưới 3x2 số, cột đen #000 + cột phụ xám mảnh, tháng hiện tại xanh #0a7aff có nhãn "$910K" trên đầu. Bấm tab danh sách trượt đổi; hover dòng nền xám.
5. HealthCRM Settings (video): thẻ lớn chia 2: menu trái (ACCOUNT/ORGANIZATION/PLATFORM) + form phải (input viền #e5e7eb bo 6px, nút "Save changes" viền). Toggle teal #0f6b5f.
6. HealthCRM tạo lịch hẹn (video, DARK): nền #161c22, thẻ #1f262e viền #2a333c bo 12px, nút teal sáng #2ccfc0 chữ đen. Modal giữa màn #232a32, input focus viền teal phát sáng, nền sau tối đi. "3 / 6" mono + thanh teal.
7. Profile Menu (ảnh): popover trắng bo 12px bóng mềm: Light / Dark / Match system ✓ / Settings; avatar + tên · chức danh. Icon tròn trắng có bóng chứa icon pastel.
8. Brightdesk Metrics (ảnh): sidebar #fafafa, mục chọn #e6e6e6; mục con lùi lề có đường kẻ dọc. Thẻ MRR "$12,480" + "↗ 4.2% MoM" xanh + mini bar xám. Cột xám nhạt #f1f1f1 có vạch trên tím #6b6be0 + đường dự báo chấm.
9. HealthCRM Patients (ảnh): sidebar #f9fafc; 4 KPI; khối "✦ HealthCRM AI findings 3" + nút "Review". Bảng: tabs chữ có số, ô tìm + 2 select, header CHỮ HOA nhỏ xám nền #f0f4f7, dòng 36px, cột mã và SĐT MONO xám, "Today · 3:00 PM".
10. St. Aurelia Approvals (ảnh, DARK): nền #0a0a0a, sidebar #141414, ô chọn #2a2a2a. "12 agent actions are waiting for a human decision." Dòng hover nền #1e1e1e bo 10px, pill "Critical" viền đỏ, "Med" viền teal. Thẻ "Get Started" nổi: checklist 3 bước.
11. Estate Ops chi tiết (video 23s): hover thẻ nổi nền xám; Occupancy thanh ngang đen nhiều màu cuối; Leasing pipeline 4 số lớn gạch chân + dòng phụ cam "⏱ 11 over 3d"; bảng Property performance.
12. Estate Ops Leasing (ảnh): danh sách trái có chip lọc (Expiring 21 / Notice 11 / Starting 10), số ngày màu theo độ gấp (đỏ "2 days", cam "16 days"). Phải: tiêu đề 2 màu, nút xanh #2277e0 + 3 nút viền trắng, 4 thẻ số lưới 2x2 nền #fafafa, khối "Terms" card-in-tray.

## Phần 3: bài 13–38, chuyển động, mẫu nên học
13. St. Aurelia DARK Command Center (video): "Good morning, Ikram" 40px semibold, dòng phụ MONO "Charge nurse · Day 07:00-19:00 · 2026-10-05". KPI thẻ #1e1e1e bo 16px, số mono 28px ("50.0%" + "+2.1" đỏ nhỏ). "Agent fleet" pill "● Running" viền xanh. Sidebar kéo rộng/hẹp được.
14. Foresight Money center: app nền #f8fcf6 (trắng ngả xanh), sidebar nhóm Money / People / Execution, mục cha xanh #00684e, mục con nền #eaf0ea. KPI có nhãn nguồn mono góc phải (ERP / CONTRACT / INFERRED pill). Ô tìm có cú pháp lọc. Băng tin AI nền xanh rất nhạt. Bảng: logo vuông màu, tiền đậm + % đỏ/xanh nhỏ, pill viền xanh.
15. Panel Filters trắng bo 16px: "Filters 2 active · Clear all", nhóm gập có badge, checkbox bo 4px chọn = nền #00684e ✓ trắng, số đếm phải xám.
16. Bảng to: avatar chữ viết tắt trên ô vuông màu bão hoà, cột tiền căn phải đậm, pill "Passed" xám / viền cam "Duplicate", chữ xanh "Approve"/"Reject".
17. Halden landing (không phải dashboard, bỏ qua).
18. Northstar Workflows: sidebar be hồng #f6efe9, mục chọn trắng, badge nâu mận. Tabs có số, 3 nút lọc pill viền. Bảng: icon ô vuông, tên + dòng phụ, "◎ Active" xanh, "2m ago". Footer "1–25 of 102".
19. Zohoor: dropdown chọn cửa hàng bo 14px bóng mềm.
20. Northstar bảng: cột số căn phải, avatar, phân trang "Rows 25 · Page 1 of 5 < >"; header "Ask AI Ctrl /".
21. Command palette giữa màn, nền sau mờ: ô tìm + "Esc", chip lọc, nhóm có tiêu đề, dòng hover, trạng thái phải, footer phím tắt "↑ ↓ navigate · ↵ open · Ctrl K toggle".
22. Northstar Overview: "Good afternoon, Ikram", thẻ "Attention required" viền đỏ nhạt "3 workflows failing", thẻ "Runs today 453" + sparkline mảnh.
23. Estate Ops resident: tiêu đề 2 màu, nút chính + 3 nút viền, 4 thẻ 2x2 có icon góc.
24. St. Aurelia sáng (video 7s): segmented Day/Week/Month nút chọn TRƯỢT; số KPI lăn đổi (309 → 1,930); pill "● Running" / "● Waiting approval".
25. HealthCRM dark (video): bấm lọc → chip "Status: Confirmed ×" viền teal, bảng lọc lại; thanh tiến độ việc nền ở topbar.
26. HealthCRM Inbox: tabs pill có số; dòng avatar tròn pastel, giờ mono phải, chấm trạng thái; dòng chọn nền mint #e3f1ee.
27–29. HealthCRM Dashboard: 4 KPI → [khối AI 2/3 | Provider load 1/3] → bảng lịch hẹn. Số KPI mono "6.2 %", "▼ 1.1 pts" xanh, "▲ 6.3%" đỏ #b11f18. Thanh tiến độ 2 lớp (teal #11756d trên #96b7b5).
30. Portfolio: 3 cột, nhóm "● Needs attention" / "Watch" / "On track" + % phải.
31. Đổi theme bằng CIRCULAR REVEAL từ menu avatar. Menu: Profile / Theme (Dark/Light/System) / Log Out.
33. Estate Ops (video 22s): bấm "10 vendor quotes to approve" → nhóm nổi thành thẻ trắng có bóng; panel phải đổi, dòng hiện lần lượt (fade + trượt nhẹ), nút chính hiện cuối.
35. Popover thông báo dark #1c1c1c bo 16px: segmented "All / Unread 3", "Mark all as read", nhóm theo ngày, câu in đậm chủ thể, giờ mono; dòng chưa đọc sáng hơn.
36. Vellum dark navy #0e1424, tiêu đề serif, "▂▄▆ High", điểm "74 / 100" + thanh tím.
38. Zohoor Inventory & POS: KPI icon cạnh nhãn, badge "+12%" nền xanh nhạt; bảng Top Selling; giá trong pill xám.

### Chuyển động (12 video, 7–31s, quay màn hình thật)
- 150–250ms, ease-out, không nảy. Hover đổi nền ~120ms.
- Segmented/tab: khối chọn TRƯỢT (shared layout).
- Số KPI đổi bằng lăn số.
- Danh sách/panel mới: stagger 40–60ms, fade + dịch lên 4–8px.
- Modal: nền sau tối mờ, modal 0.96→1 + fade; focus viền màu nhấn + quầng sáng.
- Đổi theme circular reveal; sidebar co giãn kéo được.

### Mẫu nên học (RC xếp theo độ hợp)
① Estate Ops: 3 cột (sidebar · cột Briefing việc cần làm Now/Today/This week · main số), lời chào 2 màu, 4 KPI icon, card-in-tray, cột đen + tháng hiện tại màu nhấn.
② HealthCRM Dashboard: 4 KPI → khối cần duyệt + tải theo người → bảng.
③ St. Aurelia: rail icon, số mono, Day/Week/Month trượt, thẻ trạng thái pill + sparkline, thông báo nhóm theo ngày, circular reveal.
④ CargoFlow: trang danh sách (KPI số to bên phải, tabs gạch chân có số, dòng bảng là thẻ tách rời, pill pastel).
⑤ Command palette Northstar + panel lọc Foresight.
Không nên chép: Buildwise (terminal ASCII), Halden (landing serif).
