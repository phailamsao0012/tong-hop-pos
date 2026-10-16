import SwiftUI

/// Vận hành đơn (ảnh 4.3): 5 bậc có mũi tên, tỷ lệ giao thành công, đơn cần lưu ý, tìm và lọc đơn.
struct PipelineView: View {
    var embedded = false
    /// Gốc tab Đơn hàng: kỳ và POS là kỳ, POS chung (AppNav, như Tổng quan, nhớ giữa các lần mở app; kế hoạch 1.4). Trang con
    /// (trang Sale, Thêm): kỳ, POS riêng, mở ra theo kỳ, POS chung.
    var followsShared = false
    @Environment(AppNav.self) private var nav: AppNav?
    @State private var ownPeriod: Period = NavMemory.period
    private var period: Period { followsShared ? (nav?.period ?? ownPeriod) : ownPeriod }
    private var periodBinding: Binding<Period> {
        guard followsShared, let nav else { return $ownPeriod }
        return Binding(get: { nav.period }, set: { nav.period = $0 })
    }
    /// POS đang chọn ("" = tất cả POS): lọc số các bước, danh sách đơn và tìm tên khách.
    @State private var ownPos: String = NavMemory.pos
    private var pos: String { followsShared ? (nav?.pos ?? ownPos) : ownPos }
    private var posIds: [String] { pos.isEmpty ? [] : [pos] }
    private func setPos(_ p: String) {
        if followsShared, let nav { nav.pos = p } else { ownPos = p }
    }
    @State private var basis = "confirmed"
    @State private var data: API.Pipeline?
    @State private var error: String?
    @State private var status = ""
    /// Chữ trong ô tìm đơn (đầu trang). Kết quả tìm hiện ngay dưới ô, riêng với danh sách đơn mới nhất ở cuối trang (kế hoạch 1.5).
    @State private var typed = ""
    @State private var found = SearchState<API.OrderRow>()
    @State private var runner = SearchRunner()
    @Environment(AuthModel.self) private var auth: AuthModel?
    @State private var recent: [API.OrderRow] = []
    /// Danh sách đơn mới nhất: đang tải, lỗi lần tải gần nhất (không nhầm với "không có đơn khớp bộ lọc").
    @State private var recentLoading = false
    @State private var recentError: String?
    /// Gốc tab Đơn hàng: mở lại tab mà số chưa quá 60 giây thì không tải lại (kéo để làm mới thì luôn tải).
    @State private var fresh = Freshness()
    @State private var freshRecent = Freshness()
    private var mainKey: String { "\(period.key)|\(basis)|\(pos)" }
    private var recentKey: String { "\(period.key)|\(basis)|\(pos)|\(status)" }
    static let stages: [(key: String, group: String, label: String, icon: String, color: Color)] = [
        ("unconfirmed", "unconfirmed", "Mới", "ic_m_orders", .good), ("processing", "processing", "Xác nhận", "ic_m_closed", .warn), ("shipping", "shipping", "Giao vận", "ic_m_shipping", .blue), ("delivered", "delivered", "Đã giao", "checkmark.circle.fill", .good), ("returned", "returned", "Trả hàng", "ic_m_returned", .bad),
    ]
    private func q(_ group: String, _ title: String) -> OrderQuery { OrderQuery(start: period.range.0, end: period.range.1, posIds: posIds, group: group, basis: basis == "confirmed" ? "confirmed" : "created", title: title) }
    private func n(_ b: [String: API.Bucket], _ k: String) -> Double { b[k]?.orders ?? 0 }

    var body: some View {
        Embed(embedded: embedded, title: "Vận hành đơn") {
            PageTitle(title: "Vận hành đơn", subtitle: "Theo dõi từng bước, giao đúng hẹn.")
            // Ô tìm ở đầu trang (kế hoạch 1.5): SĐT tìm trong mọi đơn, mọi POS; mã đơn mọi POS (mọi ngày khi máy chủ tra mã theo khóa
            // chính, SearchText.codesByKey; chưa thì trong kỳ đang xem); tên khách trong kỳ và POS đang xem.
            HStack(spacing: 8) {
                SearchField(prompt: "Tìm SĐT, mã đơn hoặc tên khách", text: $typed) { scheduleSearch(typed, delay: .zero) }
                NavigationLink(value: Route.orders(q(status, "Đơn hàng"))) { Image(systemName: "line.3.horizontal.decrease").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 40, height: 40).background(Color.card, in: .rect(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.08))) }.buttonStyle(.plain)
            }
            searchResults
            PeriodChips(period: periodBinding)
            Segmented(selection: $basis, options: [("confirmed", "Theo giờ chốt"), ("created", "Theo ngày tạo")])
            // Số các bước, danh sách đơn và tìm tên khách theo kỳ và POS đang chọn (POS chọn ở dải lọc trên danh sách đơn).
            ScopeLine(period: period, pos: pos)
            if let error, data == nil { StateView(error: error) { await reloadAll() } }
            if let d = data {
                let T = d.total
                let unconfirmed = basis == "created" ? n(T, "unconfirmed") : 0
                HStack(spacing: 4) {
                    ForEach(Array(Self.stages.enumerated()), id: \.element.key) { i, st in
                        NavigationLink(value: Route.orders(q(st.group, st.label))) {
                            VStack(spacing: 4) {
                                MetricIcon(st.icon, size: 13).foregroundStyle(st.color).frame(width: 28, height: 28).background(st.color.opacity(0.14), in: .rect(cornerRadius: 8))
                                Text(st.label).font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1).minimumScaleFactor(0.7)
                                Text(Fmt.int(st.key == "unconfirmed" ? unconfirmed : n(T, st.key))).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(Color.ink).rolling(Fmt.int(n(T, st.key)))
                            }.frame(maxWidth: .infinity).padding(.vertical, 10).background(st.color.opacity(0.08), in: .rect(cornerRadius: 10))
                        }.buttonStyle(.plain)
                        if i < Self.stages.count - 1 { Image(systemName: "arrow.right").font(.system(size: 8, weight: .bold)).foregroundStyle(Color.inkSoft) }
                    }
                }
                let shipped = n(T, "shipped")
                HStack(spacing: 10) {
                    NavigationLink(value: Route.orders(q("delivered", "Đã giao"))) { KpiCard(icon: "checkmark.seal.fill", tint: .good, label: "Tỷ lệ giao thành công", value: Fmt.pct(shipped > 0 ? n(T, "delivered") / shipped * 100 : nil), note: "\(Fmt.int(n(T, "delivered"))) / \(Fmt.int(shipped)) đã xuất") }
                    NavigationLink(value: Route.orders(q("closed", "Đơn chốt"))) { KpiCard(icon: "ic_m_closed", tint: .good, label: "Tổng đơn chốt", value: Fmt.int(n(T, "closed")), note: Fmt.shortMoney(T["closed"]?.net ?? 0)) }
                }.buttonStyle(.plain)
                Panel(padding: 12) {
                    HStack { Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Color.bad); Text("Đơn cần lưu ý").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.bad); Spacer(); NavigationLink(value: Route.orders(q("processing", "Chưa xuất kho"))) { HStack(spacing: 2) { Text("Xem tất cả"); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }.font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.brand) }.buttonStyle(.plain) }
                    AttentionRow(icon: "clock.badge.exclamationmark.fill", tone: .red, title: "Chờ chuyển hàng (đã đóng, chưa giao)", n: n(T, "waiting"), route: .orders(q("waiting", "Chờ chuyển hàng")))
                    AttentionRow(icon: "hourglass", tone: .orange, title: "Đã xác nhận, chưa đóng hàng", n: n(T, "confirmed"), route: .orders(q("justconfirmed", "Đã xác nhận")))
                    AttentionRow(icon: "ic_m_returned", tone: .orange, title: "Hoàn / trả hàng", n: n(T, "returned"), route: .orders(q("returned", "Hoàn")))
                    AttentionRow(icon: "ic_m_cancelled", tone: .red, title: "Hủy sau khi chốt", n: n(T, "cancelled"), route: .orders(q("cancelled", "Hủy sau chốt")))
                }.overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.bad.opacity(0.2)))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Menu { Button("Tất cả POS") { setPos("") }; ForEach(PosBreakdown.order, id: \.self) { id in Button(PosBreakdown.names[id] ?? id) { setPos(id) } } } label: { FilterChip(label: pos.isEmpty ? "Tất cả POS" : (PosBreakdown.short[pos] ?? pos), on: true, chevron: true) {} }
                        FilterChip(label: "Mới", on: status == "unconfirmed") { status = status == "unconfirmed" ? "" : "unconfirmed" }
                        FilterChip(label: "Xác nhận", on: status == "processing") { status = status == "processing" ? "" : "processing" }
                        FilterChip(label: "Giao vận", on: status == "shipping") { status = status == "shipping" ? "" : "shipping" }
                        FilterChip(label: "Đã giao", on: status == "delivered") { status = status == "delivered" ? "" : "delivered" }
                    }
                }
                SectionHead(title: "Danh sách đơn hàng", action: "Mới nhất", route: .orders(q(status, "Đơn hàng")))
                VStack(spacing: 10) {
                    ForEach(recent.prefix(8)) { o in orderLink(o) }
                    if recent.isEmpty {
                        if let recentError { StateView(error: recentError, compact: true) { await loadRecent(force: true) } }
                        else if recentLoading { StateView(loading: "Đang tải danh sách đơn…", compact: true) }
                        else { Panel { Text("Không có đơn khớp bộ lọc.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                    }
                }
            } else if error == nil { Skeleton(height: 90); SkeletonGrid(tiles: 2) }
        }
        .task(id: mainKey) { await load() }
        .task(id: recentKey) { await loadRecent() }
        // Kéo để làm mới (tab Đơn hàng, trang Sale, trang riêng): số các bước và danh sách đơn tải lại cùng lúc.
        .pullToReload { await reloadAll() }
        // Ô tìm: chờ ngừng gõ rồi mới gửi. Tìm theo kỳ đang xem (tên khách; mã đơn khi máy chủ chưa tra mã theo khóa chính): đổi
        // kỳ, mốc ngày hoặc POS thì tìm lại.
        .onChange(of: typed) { _, v in scheduleSearch(v, delay: SearchRunner.pause) }
        .onChange(of: mainKey) { _, _ in
            guard let t = found.term, t.kind == .name || (t.kind == .code && !SearchText.codesByKey) else { return }
            scheduleSearch(typed, delay: .zero, force: true)
        }
        #if DEBUG
        // Lượt tự xem MEGATECH_TOUR_SEARCH=1 "gõ" vào ô tìm của tab Đơn hàng (máy ảo không gõ được).
        .onChange(of: DebugSearch.shared.orders) { _, v in if followsShared { typed = v } }
        #endif
    }

    /// Một dòng đơn (danh sách mới nhất và kết quả tìm), chạm mở hồ sơ đơn.
    private func orderLink(_ o: API.OrderRow) -> some View {
        NavigationLink(value: Route.order(o.id)) {
            Panel(padding: 12) {
                HStack { Text("#\(o.orderId)").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); Spacer(); Tag(text: o.statusName, tone: tone(o.statusCode)) }
                HStack(spacing: 4) { PosLabel(id: o.posId, name: o.posName).font(.system(size: 10)).foregroundStyle(Color.inkSoft); Text("· \(o.customer ?? "") · \(o.phone ?? "")").font(.system(size: 10)).foregroundStyle(Color.inkSoft).lineLimit(1); Spacer(); Text(Fmt.time(o.firstConfirmedAt ?? o.createdAt)).font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                HStack { Text(o.sellerName ?? "—").font(.system(size: 10)).foregroundStyle(Color.inkSoft); Spacer(); Text(Fmt.vnd(o.net ?? 0)).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink) }
            }
        }.buttonStyle(.plain)
    }

    // MARK: Ô tìm đơn (kế hoạch 1.5)

    /// Kết quả tìm ngay dưới ô: phạm vi tìm, tối đa 8 đơn và "Xem tất cả"; lỗi thật kèm Thử lại (không báo "không có đơn" khi lỗi).
    @ViewBuilder private var searchResults: some View {
        switch found.input {
        case .empty:
            EmptyView()
        case .incomplete:
            Label("Gõ SĐT đủ 9–11 số, mã đơn (4–8 số hoặc #mã) hoặc tên khách từ 3 chữ cái.", systemImage: "info.circle")
                .font(.system(size: 11, weight: .medium)).foregroundStyle(Color.inkSoft)
        case .term(let t):
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Image(systemName: "scope").font(.system(size: 10, weight: .semibold))
                    Text(searchScope(t)).font(.system(size: 11, weight: .medium)).fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(Color.inkSoft)
                if found.loading { StateView(loading: "Đang tìm đơn…", compact: true) }
                else if let e = found.error { StateView(error: e, compact: true) { await retrySearch() } }
                else if found.done {
                    if found.rows.isEmpty {
                        Panel { Text(searchEmpty(t)).font(.system(size: 12)).foregroundStyle(Color.inkSoft) }
                    } else {
                        let more = found.rows.count > 8 || found.hasMore
                        SectionHead(title: "Kết quả tìm · \(found.hasMore ? "hơn " : "")\(found.rows.count) đơn", action: more ? "Xem tất cả" : nil, route: more ? .orders(searchQuery(t)) : nil)
                        ForEach(found.rows.prefix(8)) { o in orderLink(o) }
                    }
                }
                if t.kind == .name, auth?.me?.canView("customers") == true {
                    NavigationLink(value: Route.customerSearch(t.value)) {
                        HStack(spacing: 6) {
                            Image(systemName: "person.text.rectangle").font(.system(size: 12, weight: .semibold))
                            Text("Tìm trong Hồ sơ khách").font(.system(size: 12, weight: .semibold))
                            Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold))
                        }
                        .foregroundStyle(Color.brand).padding(.vertical, 4).contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
    /// Phạm vi tìm theo loại từ khóa.
    private func searchScope(_ t: SearchTerm) -> String {
        let basisText = basis == "confirmed" ? "theo giờ chốt" : "theo ngày tạo"
        switch t.kind {
        case .phone: return "Tìm trong mọi đơn, mọi POS"
        case .code:
            return SearchText.codesByKey
                ? "Tìm theo mã đơn · mọi ngày, mọi POS"
                : "Tìm theo mã đơn trong kỳ đang xem · \(period.title), \(basisText) · mọi POS"
        case .name:
            let posText = pos.isEmpty ? "mọi POS" : "POS \(PosBreakdown.names[pos] ?? pos)"
            return "Tìm tên khách trong kỳ đang xem · \(period.title), \(basisText) · \(posText)"
        }
    }
    private func searchEmpty(_ t: SearchTerm) -> String {
        switch t.kind {
        case .phone: return "Không có đơn nào có SĐT này."
        case .code: return SearchText.codesByKey ? "Không có đơn nào có mã này." : "Không có đơn nào có mã này trong kỳ đang xem."
        case .name:
            return SearchText.isPlain(t.value)
                ? "Không có đơn khớp tên này trong kỳ đang xem. Máy chủ chưa tìm được tên không dấu, thử gõ có dấu."
                : "Không có đơn khớp tên này trong kỳ đang xem."
        }
    }
    /// Bộ lọc gửi máy chủ (cũng là danh sách "Xem tất cả"). SĐT: không lọc ngày, không mốc ngày, mọi POS được xem (đi qua chỉ mục
    /// (POS, SĐT)). Mã đơn: như SĐT khi web tra mã theo khóa chính (SearchText.codesByKey); chưa thì kỳ và mốc ngày đang xem, mọi
    /// POS (không lọc ngày là máy chủ đọc cả bảng đơn). Tên khách: kỳ, mốc ngày và POS đang xem, mọi trạng thái.
    private func searchQuery(_ t: SearchTerm) -> OrderQuery {
        switch t.kind {
        case .phone: return OrderQuery(q: t.value, title: "Tìm theo SĐT")
        case .code:
            if SearchText.codesByKey { return OrderQuery(q: t.value, title: "Tìm theo mã đơn") }
            var x = q("", "Tìm theo mã đơn")
            x.posIds = []
            x.q = t.value
            return x
        case .name:
            var x = q("", "Tìm tên khách")
            x.q = t.value
            return x
        }
    }
    /// Chữ trong ô đổi: đủ dạng thì chờ ngừng gõ rồi tìm (delay 0: bấm "Tìm"); chưa đủ thì hủy lượt đang chờ, chỉ hiện gợi ý.
    /// force: tìm lại dù từ khóa không đổi (Thử lại, đổi kỳ khi đang tìm tên).
    private func scheduleSearch(_ text: String, delay: Duration, force: Bool = false) {
        let input = SearchText.parse(text)
        guard let t = input.term else { runner.cancel(); found.reset(input); return }
        if !force && found.covers(t) { runner.cancelPending(); return }
        runner.run(after: delay) { await runSearch(t) }
    }
    @MainActor private func retrySearch() async { scheduleSearch(typed, delay: .zero, force: true) }
    /// Có lượt mới thì lượt này bị hủy (SearchRunner) và không ghi đè kết quả mới.
    @MainActor private func runSearch(_ t: SearchTerm) async {
        found.begin(t)
        let query = searchQuery(t)
        let trace = SearchTrace("don-hang", kind: t.kind)
        do {
            let r = try await API.orders(query, page: 1)
            guard !Task.isCancelled, found.term == t else { trace.end(.cancelled); return }
            found.finish(r.orders, hasMore: r.hasMore)
            trace.end(r.orders.isEmpty ? .empty : .found)
        } catch {
            guard !Task.isCancelled, found.term == t else { trace.end(.cancelled); return }
            found.fail(SearchError.text(error) ?? "Không tải được")
            trace.end(.failed)
        }
    }
    private func tone(_ c: Int?) -> Tone { switch c ?? -1 { case 3, 16: return .green; case 2: return .blue; case 4, 5, 15: return .orange; case 6, 7: return .red; case 0, 17: return .gray; default: return .orange } }
    // Là gốc của tab Đơn hàng: rời tab giữa lúc tải thì lượt tải bị huỷ, không báo lỗi "đã hủy" và không xoá danh sách đang có.
    // force: kéo để làm mới / Thử lại / tìm đơn. Không force (mở lại tab) mà số chưa quá 60 giây thì không tải.
    @MainActor private func load(force: Bool = false) async {
        let k = mainKey
        if !force, data != nil, let age = fresh.age(k) { LoadTrace.skip("don-hang", age: age); return }
        let r = period.range, b = basis, ids = posIds
        let trace = LoadTrace("don-hang", requests: 1)
        defer { trace.end(cancelled: Task.isCancelled) }
        do {
            data = try await trace.run { try await API.pipeline(start: r.0, end: r.1, basis: b, posIds: ids) }
            error = nil
            if k == mainKey { fresh.stamp(k) }
        } catch {
            if !Task.isCancelled, let text = LoadError.text(error) { self.error = text; fresh.clear() }
        }
    }
    @MainActor private func loadRecent(force: Bool = false) async {
        let k = recentKey
        if !force, recentError == nil, let age = freshRecent.age(k) { LoadTrace.skip("don-hang-danh-sach", age: age); return }
        let query = q(status, "Đơn")
        let trace = LoadTrace("don-hang-danh-sach", requests: 1)
        defer { trace.end(cancelled: Task.isCancelled) }
        recentLoading = true; defer { recentLoading = false }
        do {
            let r = try await trace.run { try await API.orders(query, page: 1) }
            recent = r.orders; recentError = nil
            if k == recentKey { freshRecent.stamp(k) }
        } catch {
            guard !Task.isCancelled, let text = LoadError.text(error) else { return }
            recent = []; recentError = text; freshRecent.clear()
        }
    }
    /// Số các bước và danh sách đơn tải lại cùng lúc.
    @MainActor private func reloadAll() async {
        await runTogether([{ await load(force: true) }, { await loadRecent(force: true) }])
    }
}

struct AttentionRow: View {
    let icon: String; let tone: Tone; let title: String; let n: Double; let route: Route
    var body: some View {
        NavigationLink(value: route) {
            HStack(spacing: 8) { MetricIcon(icon, size: 12).foregroundStyle(tone.color).frame(width: 22); Text(title).font(.system(size: 12)).foregroundStyle(Color.ink).lineLimit(1); Spacer(); Text("\(Fmt.int(n)) đơn").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.inkSoft) }.padding(.vertical, 6).contentShape(.rect)
        }.buttonStyle(.plain)
    }
}
