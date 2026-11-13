import SwiftUI

/// Tab Phòng ban (anh Vũ 10/10/2026): danh bạ các phòng ban, như mục dịch vụ của app ngân hàng: mỗi phòng một thẻ,
/// chạm thẻ vào trang của phòng, chạm ô nhỏ vào thẳng trang con. Số theo kỳ của 4 bộ phận nằm ở Tổng quan; đây là nơi làm việc.
struct DeptsHome: View {
    @Environment(AuthModel.self) private var auth
    @Environment(SatelliteCenter.self) private var satellites
    @Environment(AppNav.self) private var nav
    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.deptsPath) {
            // Khung Gemini 07: chỉ có tiêu đề, không nút ở đầu trang.
            TabPage(title: "Phòng ban", actions: []) {
                let list = auth.me.map { DeptEntry.all(for: $0, hrBadge: satellites.hrBadge) } ?? []
                if list.isEmpty {
                    ContentUnavailableView("Chưa được cấp quyền", systemImage: "lock.fill", description: Text("Tài khoản này chưa được xem phòng ban nào."))
                }
                ForEach(Array(list.enumerated()), id: \.element.id) { i, e in DeptCard(entry: e).modifier(StaggerIn(index: i)) }
            }
            .appRoutes()
            // Kéo để làm mới: hỏi lại số việc chờ của các phòng (web vệ tinh, vd Nhân sự).
            .refreshable { await satellites.refresh(maxAge: 0) }
        }
    }
}

/// Một phòng ban trong tab Phòng ban: trang chính và các trang con (theo quyền).
struct DeptEntry: Identifiable {
    struct Sub: Identifiable { let id: String; let title: String; let icon: String; let route: Route; var badge = 0 }
    let id: String; let title: String; let caption: String; let icon: String; let tint: Color; let route: Route
    var subs: [Sub] = []
    /// Dòng mô tả bên trong khi phòng chỉ có một trang.
    var inside: String? = nil
    var badge = 0
    /// Chữ link xanh ở góc thẻ (khung 07), mở trang chính của phòng.
    var link: String {
        switch id {
        case "sale": return "Sale"
        case "cskh": return "Tổng quan CSKH"
        case "mkt": return "Phân tích"
        case "vandon": return "Xem Vận đơn"
        default: return "Tổng quan"
        }
    }
    /// Nút trong lưới 2 cột: bỏ trang trùng với link ở góc (Tổng quan CSKH, Tổng quan Nhân sự); tên nút theo khung 07.
    var gridSubs: [Sub] {
        let names = ["compare": "Tổng quan & so sánh", "batches": "Data được cấp", "shift": "Trong ca", "cskh-kpi": "KPI CSKH",
                     "calls": "Cuộc gọi", "care": "Khách theo NV", "repurchase": "Mua lại & Upsell", "dormant": "Khách lâu chưa mua",
                     "list": "Danh sách nhân sự", "org": "Sơ đồ tổ chức", "approvals": "Duyệt thay đổi", "recruit": "Tuyển dụng"]
        let skip: Set<String> = id == "cskh" ? ["cskh-overview"] : id == "hr" ? ["overview"] : []
        return subs.filter { !skip.contains($0.id) }.map { Sub(id: $0.id, title: names[$0.id] ?? $0.title, icon: $0.icon, route: $0.route, badge: $0.badge) }
    }

    static func all(for me: API.Me, hrBadge: Int) -> [DeptEntry] {
        var r: [DeptEntry] = []
        let sale = SALE_PAGES.filter { me.canView($0.id) }
        if !sale.isEmpty {
            r.append(DeptEntry(id: "sale", title: "Sale", caption: "Chốt đơn từ số MKT đưa về, chia data, theo dõi ca",
                               icon: CompanyDept.sale.icon, tint: CompanyDept.sale.tint, route: .dept(.sale),
                               subs: sale.map { Sub(id: $0.id, title: $0.title, icon: $0.icon, route: .dept(.sale, page: $0.id)) }))
        }
        let cskh = CSKH_PAGES.filter { me.canView($0.id) }
        if !cskh.isEmpty {
            r.append(DeptEntry(id: "cskh", title: "CSKH", caption: "Chăm khách cũ, upsell, gọi lại khách lâu chưa mua",
                               icon: CompanyDept.cskh.icon, tint: CompanyDept.cskh.tint, route: .dept(.cskh),
                               subs: cskh.map { Sub(id: $0.id, title: $0.title, icon: $0.icon, route: .dept(.cskh, page: $0.id)) }))
        }
        if me.canView("mkt-roas") {
            r.append(DeptEntry(id: "mkt", title: "Marketing", caption: "Quảng cáo kéo số về cho Sale và CSKH",
                               icon: CompanyDept.mkt.icon, tint: CompanyDept.mkt.tint, route: .dept(.mkt),
                               inside: "Chi phí quảng cáo, số về, đơn chốt, chi phí mỗi số và mỗi đơn theo từng marketer, team, sản phẩm"))
        }
        if me.canView("van-don") {
            r.append(DeptEntry(id: "vandon", title: "Vận đơn", caption: "Gọi xác nhận đơn, gửi hàng, theo dõi hoàn",
                               icon: CompanyDept.vandon.icon, tint: CompanyDept.vandon.tint, route: .dept(.vandon),
                               inside: "Đơn chuyển đi, doanh số chuyển đi, đã nhận, hoàn theo người lên đơn; người gọi xác nhận; lý do không xác nhận được"))
        }
        if me.canView("people") {
            var subs = [
                Sub(id: "overview", title: "Tổng quan", icon: "chart.bar.fill", route: .hr("overview")),
                Sub(id: "list", title: "Danh sách", icon: "person.3.fill", route: .hr("list")),
                Sub(id: "org", title: "Sơ đồ", icon: "point.3.connected.trianglepath.dotted", route: .hr("org")),
                Sub(id: "approvals", title: "Duyệt", icon: "checkmark.seal.fill", route: .hr("approvals"), badge: hrBadge),
            ]
            if me.canView("recruit") { subs.append(Sub(id: "recruit", title: "Tuyển dụng", icon: "person.badge.plus", route: .hr("recruit"))) }
            r.append(DeptEntry(id: "hr", title: "Nhân sự", caption: "Quân số, hồ sơ, sơ đồ tổ chức, duyệt thay đổi",
                               icon: "person.crop.rectangle.stack.fill", tint: Palette.mtRolePurpleInk, route: .hr(""), subs: subs, badge: hrBadge))
        }
        return r
    }
}

/// Thẻ một phòng (khung 07): tên đậm (Nhân sự có badge "N chờ duyệt"), link xanh bên phải mở trang chính, lưới 2 cột nút chữ căn
/// giữa có ›. Phòng chỉ có một trang (Marketing, Vận đơn) thì chỉ một dòng tên + link. Không icon, không mô tả.
struct DeptCard: View {
    let entry: DeptEntry
    private var header: some View {
        HStack(spacing: 6) {
            Text(entry.title).mtFont(.cardHeader).foregroundStyle(Palette.ink)
            if entry.badge > 0 {
                Text("\(entry.badge) chờ duyệt").mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.bad)
                    .padding(.horizontal, 7).padding(.vertical, 2).background(Palette.badSoft, in: .capsule)
            }
            Spacer(minLength: 6)
            NavigationLink(value: entry.route) {
                HStack(spacing: 2) { Text(entry.link); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }
                    .mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.accent).frame(minHeight: 32).contentShape(.rect)
            }
            .buttonStyle(.plain).accessibilityLabel("\(entry.link), mở \(entry.title)")
        }
    }
    private func tile(_ s: DeptEntry.Sub) -> some View {
        NavigationLink(value: s.route) {
            HStack(spacing: 4) {
                Text(s.badge > 0 ? "\(s.title) · \(s.badge)" : s.title)
                    .mtFont(.body).fontWeight(.semibold).multilineTextAlignment(.center)
                    .foregroundStyle(s.badge > 0 ? Palette.warn : Palette.ink).fixedSize(horizontal: false, vertical: true)
                Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, 8).padding(.vertical, 6)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
            .overlay { RoundedRectangle(cornerRadius: MT.rCell).strokeBorder(Palette.line, lineWidth: 1) }
            .contentShape(.rect)
        }.buttonStyle(.plain)
    }
    var body: some View {
        let subs = entry.gridSubs
        VStack(alignment: .leading, spacing: MT.cellGap) {
            header
            if !subs.isEmpty {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: MT.cellGap), GridItem(.flexible(), spacing: MT.cellGap)], spacing: MT.cellGap) {
                    ForEach(subs) { s in tile(s) }
                }
            }
        }
        .padding(MT.cardPad)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}

extension SatelliteCenter {
    /// Việc chờ của phần Nhân sự (yêu cầu thay đổi chờ duyệt); 0 khi mất kết nối web nhân sự.
    var hrBadge: Int { modules.first { $0.id == "hr" && !$0.down }.map { max(0, $0.badge ?? 0) } ?? 0 }
}
