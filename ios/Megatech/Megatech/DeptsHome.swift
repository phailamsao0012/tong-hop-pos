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
            let list = auth.me.map { DeptEntry.all(for: $0, hrBadge: satellites.hrBadge) } ?? []
            TabPage(title: "Phòng ban", subtitle: list.isEmpty ? nil : "\(list.count) phòng ban · chạm để vào phòng") {
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

struct DeptCard: View {
    let entry: DeptEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NavigationLink(value: entry.route) {
                HStack(spacing: 12) {
                    MetricIcon(entry.icon, size: 19).foregroundStyle(Palette.mtTextPrimary)
                        .frame(width: 46, height: 46)
                        .background(entry.tint.opacity(0.12), in: .rect(cornerRadius: MT.rCell))
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(entry.title).mtFont(.cardHeader).foregroundStyle(Color.ink)
                            if entry.badge > 0 {
                                Text("\(entry.badge) chờ duyệt").mtFont(.caption).foregroundStyle(.white)
                                    .padding(.horizontal, 6).padding(.vertical, 2).background(Color.bad, in: .capsule)
                            }
                        }
                        Text(entry.caption).mtFont(.caption).foregroundStyle(Color.inkSoft).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").mtFont(.body).foregroundStyle(entry.tint)
                        .frame(width: 28, height: 28).background(entry.tint.opacity(0.12), in: .circle)
                }.contentShape(.rect)
            }.buttonStyle(.plain)
            if !entry.subs.isEmpty {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(entry.subs) { s in
                        NavigationLink(value: s.route) {
                            HStack(spacing: 6) {
                                MetricIcon(s.icon, size: 11).foregroundStyle(entry.tint).frame(width: 18)
                                Text(s.title).mtFont(.body).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                                if s.badge > 0 {
                                    Text("\(s.badge)").mtFont(.caption).foregroundStyle(.white).padding(.horizontal, 5).padding(.vertical, 1).background(Color.bad, in: .capsule)
                                }
                            }
                            .padding(.horizontal, 10).frame(minHeight: 44)
                            .background(entry.tint.opacity(0.07), in: .rect(cornerRadius: 10)).contentShape(.rect)
                        }.buttonStyle(.plain)
                    }
                }
            } else if let inside = entry.inside {
                NavigationLink(value: entry.route) {
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: "square.text.square.fill").mtFont(.caption).foregroundStyle(entry.tint)
                        Text(inside).mtFont(.caption).foregroundStyle(Color.inkSoft).multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: 44).padding(10).background(entry.tint.opacity(0.07), in: .rect(cornerRadius: MT.rCell)).contentShape(.rect)
                }.buttonStyle(.plain)
            }
        }
        .padding(MT.cardPad)
        .cardSurface()
    }
}

extension SatelliteCenter {
    /// Việc chờ của phần Nhân sự (yêu cầu thay đổi chờ duyệt); 0 khi mất kết nối web nhân sự.
    var hrBadge: Int { modules.first { $0.id == "hr" && !$0.down }.map { max(0, $0.badge ?? 0) } ?? 0 }
}
