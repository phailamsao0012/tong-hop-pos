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
        ("unconfirmed", "unconfirmed", "Mới", "ic_m_orders", .good), ("processing", "processing", "Xác nhận", "ic_m_closed", .warn), ("shipping", "shipping", "Giao vận", "ic_m_shipping", Palette.info), ("delivered", "delivered", "Đã giao", "checkmark.circle.fill", .good), ("returned", "returned", "Trả hàng", "ic_m_returned", .bad),
    ]
    private func q(_ group: String, _ title: String) -> OrderQuery { OrderQuery(start: period.range.0, end: period.range.1, posIds: posIds, group: group, basis: basis == "confirmed" ? "confirmed" : "created", title: title) }
    private func n(_ b: [String: API.Bucket], _ k: String) -> Double { b[k]?.orders ?? 0 }

    var body: some View {
        Embed(embedded: embedded, title: "Vận hành đơn") {
            if !embedded { PageTitle(title: "Vận hành đơn", subtitle: "Theo dõi từng bước, giao đúng hẹn.") }
            // Pill lọc (khung Gemini): kỳ và POS; bấm mở bảng chọn.
            ScopeFilterPill(period: periodBinding, pos: Binding(get: { pos }, set: { setPos($0) }))
            if let error, data == nil { StateView(error: error) { await reloadAll() } }
            // Khung 05: "ĐƠN THEO BƯỚC" (số lớn, cột Mới · Xác nhận · Giao vận · Đã giao · Trả hàng), "Đơn cần lưu ý", "Danh sách đơn hàng".
            if let d = data {
                stepsCard(d.total)
                attentionCard(d.total)
            } else if error == nil { Skeleton(height: 160); Skeleton(height: 120) }
            listCard
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

    /// Một dòng đơn (danh sách mới nhất và kết quả tìm), chạm mở hồ sơ đơn. Ô xám nhạt trong thẻ (khung 05).
    private func orderLink(_ o: API.OrderRow) -> some View {
        // Dòng 1: mã · trạng thái · POS; dòng 2: khách · người bán · giờ; tiền và › bên phải.
        let line2 = [o.customer, o.sellerName, Fmt.time(o.firstConfirmedAt ?? o.createdAt)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        return NavigationLink(value: Route.order(o.id)) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("#\(o.orderId) · \(o.statusName) · \(PosBreakdown.short[o.posId] ?? o.posName)")
                        .mtFont(.body).fontWeight(.semibold).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                    Text(line2).mtFont(.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer(minLength: 6)
                Text(Fmt.shortVnd(o.net ?? o.currentTotal ?? 0)).mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.muted)
            }
            .padding(12).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
            .contentShape(.rect)
            .accessibilityElement(children: .combine)
        }.buttonStyle(.plain)
    }

    // MARK: Khung 05

    /// Link xanh nhỏ ở góc thẻ ("Xem tất cả ›").
    private func cornerLink(_ title: String, _ route: Route) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 2) { Text(title); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)) }
                .mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.accent).frame(minHeight: 32)
        }.buttonStyle(.plain)
    }

    /// "ĐƠN THEO BƯỚC": số lớn (cộng 5 cột), cột từng bước chạm mở danh sách; mốc ngày (giờ chốt / ngày tạo) chọn ở góc thẻ.
    private func stepsCard(_ T: [String: API.Bucket]) -> some View {
        let unconfirmed = basis == "created" ? n(T, "unconfirmed") : 0
        let values: [Double] = Self.stages.map { $0.key == "unconfirmed" ? unconfirmed : n(T, $0.key) }
        let maxV = max(1, values.max() ?? 1)
        let shipped = n(T, "shipped")
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Text("ĐƠN THEO BƯỚC").mtFont(.caption).fontWeight(.bold).foregroundStyle(Palette.muted)
                Spacer(minLength: 6)
                Menu {
                    Button { basis = "confirmed" } label: { if basis == "confirmed" { Label("Theo giờ chốt", systemImage: "checkmark") } else { Text("Theo giờ chốt") } }
                    Button { basis = "created" } label: { if basis == "created" { Label("Theo ngày tạo", systemImage: "checkmark") } else { Text("Theo ngày tạo") } }
                } label: {
                    HStack(spacing: 3) {
                        Text(basis == "confirmed" ? "Theo giờ chốt" : "Theo ngày tạo")
                        Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
                    }
                    .mtFont(.caption).fontWeight(.semibold).foregroundStyle(Palette.accent).frame(minHeight: 32)
                }
                .accessibilityLabel("Mốc ngày: \(basis == "confirmed" ? "theo giờ chốt" : "theo ngày tạo")")
            }
            Text("\(Fmt.int(values.reduce(0, +))) đơn").mtFont(.heroNumber).foregroundStyle(Palette.ink)
            HStack(alignment: .bottom, spacing: MT.cellGap) {
                ForEach(Array(Self.stages.enumerated()), id: \.element.key) { i, st in
                    NavigationLink(value: Route.orders(q(st.group, st.label))) {
                        VStack(spacing: 4) {
                            Text(Fmt.int(values[i])).mtFont(.caption).fontWeight(.bold).foregroundStyle(Palette.ink)
                            RoundedRectangle(cornerRadius: 4).fill(Palette.accent)
                                .frame(height: max(4, 64 * values[i] / maxV))
                            Text(st.label).font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.muted)
                                .lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity).contentShape(.rect)
                        .accessibilityElement(children: .combine)
                    }.buttonStyle(.plain)
                }
            }
            .frame(height: 104, alignment: .bottom)
            Text("Giao thành công \(Fmt.pct(shipped > 0 ? n(T, "delivered") / shipped * 100 : nil)) · \(Fmt.int(n(T, "delivered")))/\(Fmt.int(shipped)) đã xuất · Tổng đơn chốt \(Fmt.int(n(T, "closed"))) · \(Fmt.shortVnd(T["closed"]?.net ?? 0))")
                .mtFont(.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
        }
        .heroSurface()
    }

    /// "Đơn cần lưu ý": mỗi việc một hàng; Hoàn / Hủy kèm badge tỷ lệ trên tổng đơn chốt trong kỳ (≥7% ▲ đỏ, 5–7% ! vàng, <5% ✓ xanh).
    private func attentionCard(_ T: [String: API.Bucket]) -> some View {
        let closed = n(T, "closed")
        return VStack(alignment: .leading, spacing: MT.cellGap) {
            HStack {
                Text("Đơn cần lưu ý").mtFont(.cardHeader).foregroundStyle(Palette.ink)
                Spacer()
                cornerLink("Xem tất cả", .orders(q("processing", "Chưa xuất kho")))
            }
            attentionRow("Chờ chuyển hàng (đã đóng, chưa giao)", n(T, "waiting"), rate: nil, .orders(q("waiting", "Chờ chuyển hàng")))
            attentionRow("Đã xác nhận, chưa đóng hàng", n(T, "confirmed"), rate: nil, .orders(q("justconfirmed", "Đã xác nhận")))
            attentionRow("Hoàn / trả hàng", n(T, "returned"), rate: closed > 0 ? n(T, "returned") / closed * 100 : nil, .orders(q("returned", "Hoàn")))
            attentionRow("Hủy sau khi chốt", n(T, "cancelled"), rate: closed > 0 ? n(T, "cancelled") / closed * 100 : nil, .orders(q("cancelled", "Hủy sau chốt")))
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
    private func attentionRow(_ title: String, _ count: Double, rate: Double?, _ route: Route) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 8) {
                Text(title).mtFont(.body).fontWeight(.semibold).foregroundStyle(Palette.ink).lineLimit(2)
                Spacer(minLength: 6)
                if let rate { RefundCountBadge(count: count, rate: rate) }
                else { Text(Fmt.int(count)).mtFont(.body).fontWeight(.bold).foregroundStyle(Palette.ink) }
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.muted)
            }
            .padding(12).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(Palette.wash, in: .rect(cornerRadius: MT.rCell))
            .contentShape(.rect)
            .accessibilityElement(children: .combine)
        }.buttonStyle(.plain)
    }

    /// "Danh sách đơn hàng": ô tìm (chuyển vào thẻ), lọc trạng thái, 8 đơn mới nhất, "Xem tất cả".
    private var listCard: some View {
        VStack(alignment: .leading, spacing: MT.cellGap) {
            HStack {
                Text("Danh sách đơn hàng").mtFont(.cardHeader).foregroundStyle(Palette.ink)
                Spacer()
                cornerLink("Xem tất cả", .orders(q(status, "Đơn hàng")))
            }
            // Ô tìm (kế hoạch 1.5): SĐT tìm trong mọi đơn, mọi POS; mã đơn mọi POS (mọi ngày khi máy chủ tra mã theo khóa chính,
            // SearchText.codesByKey; chưa thì trong kỳ đang xem); tên khách trong kỳ và POS đang xem.
            SearchField(prompt: "Tìm SĐT, mã đơn hoặc tên khách", text: $typed) { scheduleSearch(typed, delay: .zero) }
            searchResults
            MTFlowLayout(spacing: MT.cellGap) {
                ForEach([("", "Tất cả"), ("unconfirmed", "Mới"), ("processing", "Xác nhận"), ("shipping", "Giao vận"), ("delivered", "Đã giao")], id: \.0) { key, label in
                    QuickChip(label: label, on: status == key) { status = key }
                }
            }
            ForEach(recent.prefix(8)) { o in orderLink(o) }
            if recent.isEmpty {
                if let recentError { StateView(error: recentError, compact: true) { await loadRecent(force: true) } }
                else if recentLoading { StateView(loading: "Đang tải danh sách đơn…", compact: true) }
                else { Text("Không có đơn khớp bộ lọc.").mtFont(.caption).foregroundStyle(Palette.muted) }
            }
        }
        .padding(MT.cardPad).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
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
