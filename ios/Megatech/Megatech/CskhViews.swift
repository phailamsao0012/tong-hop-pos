import SwiftUI

/// Kỳ báo cáo dùng chung cho các trang CSKH / bán hàng.
enum Period: String, CaseIterable, Identifiable {
    case today = "Hôm nay", week = "7 ngày", month = "Tháng này", last = "Tháng trước", quarter = "90 ngày"
    var id: String { rawValue }
    var range: (String, String) {
        let today = VNDate.string(.now)
        switch self {
        case .today: return (today, today)
        case .week: return (VNDate.string(VNDate.add(-6)), today)
        case .month: return (VNDate.monthStart(), today)
        case .last: return VNDate.lastMonth()
        case .quarter: return (VNDate.string(VNDate.add(-89)), today)
        }
    }
    var label: String { let r = range; return r.0 == r.1 ? Fmt.day(r.0) : "\(Fmt.day(r.0)) – \(Fmt.day(r.1))" }
}

struct PeriodPicker: View {
    @Binding var period: Period; var options: [Period] = [.today, .week, .month, .last]
    var body: some View { Picker("Kỳ", selection: $period) { ForEach(options) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented) }
}

struct MiniStat: View {
    let title: String; let value: String; var tint: Color = .primary
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.system(.title3, design: .rounded).weight(.bold)).monospacedDigit().foregroundStyle(tint).minimumScaleFactor(0.7).lineLimit(1).rolling(value)
            Text(title).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 12))
    }
}

struct RowChevron: View { var body: some View { Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.quaternary) } }

// MARK: Khách theo nhân viên

struct CareView: View {
    @State private var data: API.Care?
    @State private var error: String?
    @State private var assigned = ""
    @State private var sort = "note_old"
    @State private var minDays = 0
    @State private var q = ""
    static let sorts = [("note_old", "Lâu chưa ghi chú"), ("note_new", "Ghi chú mới nhất"), ("purchased", "Mua nhiều tiền"), ("last_order", "Đặt gần đây"), ("name", "Tên A–Z")]
    var body: some View {
        List {
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if let d = data {
                Section {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        MiniStat(title: "Khách đang cầm", value: Fmt.int(d.summary.total))
                        MiniStat(title: "Chưa ghi chú lần nào", value: Fmt.int(d.summary.neverNoted), tint: .orange)
                        MiniStat(title: "Quá 20 ngày chưa ghi chú", value: Fmt.int(d.summary.over20), tint: .bad)
                        MiniStat(title: "Đã mua", value: Fmt.int(d.summary.buyers), tint: .good)
                    }.listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
                Section("Nhân viên CSKH · chạm để lọc") {
                    ForEach(d.staff) { s in
                        Button { assigned = assigned == s.id ? "" : s.id } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.name).font(.subheadline.weight(assigned == s.id ? .bold : .medium)).foregroundStyle(assigned == s.id ? Color.brand : .primary)
                                    Text("chưa note \(Fmt.int(s.neverNoted)) · >7 ngày \(Fmt.int(s.over7)) · >20 ngày \(Fmt.int(s.over20)) · hôm nay \(Fmt.int(s.notedToday))").font(.caption2).foregroundStyle(.secondary).monospacedDigit()
                                }
                                Spacer()
                                Text(Fmt.int(s.assigned)).font(.subheadline.weight(.bold)).monospacedDigit()
                            }
                        }.buttonStyle(.plain)
                    }
                }
                Section {
                    Picker("Sắp xếp", selection: $sort) { ForEach(Self.sorts, id: \.0) { Text($0.1).tag($0.0) } }
                    Picker("Chưa ghi chú", selection: $minDays) { Text("Tất cả").tag(0); Text("≥ 7 ngày").tag(7); Text("≥ 20 ngày").tag(20) }.pickerStyle(.segmented)
                }
                Section("\(Fmt.int(d.total)) khách\(assigned.isEmpty ? "" : " · " + (d.staff.first { $0.id == assigned }?.name ?? ""))") {
                    ForEach(d.rows) { r in
                        NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone ?? "")) {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(r.name ?? r.phone ?? "Khách").font(.subheadline.weight(.semibold)).lineLimit(1)
                                    Spacer()
                                    if let dn = r.daysSinceNote { Text("\(Fmt.int(dn)) ngày").font(.caption.weight(.semibold)).foregroundStyle(dn > 20 ? Color.bad : dn > 7 ? .orange : .secondary) }
                                    else { Text("chưa note").font(.caption.weight(.semibold)).foregroundStyle(.orange) }
                                }
                                Text("\(r.phone ?? "") · \(r.posName)\(r.assignedName.map { " · \($0)" } ?? "")").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                HStack(spacing: 8) { Text("\(Fmt.int(r.succeedOrders)) đơn TC"); Text(Fmt.short(r.purchased) + " ₫"); if let l = r.lastOrderAt { Text("đặt " + Fmt.day(l)) } }.font(.caption2).foregroundStyle(.tertiary).monospacedDigit()
                                if let n = r.notes.first, let m = n.message, !m.isEmpty { Text("“\(m)”").font(.caption2).foregroundStyle(.secondary).lineLimit(2) }
                            }
                        }
                    }
                }
            } else if error == nil { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
        }
        .navigationTitle("Khách theo nhân viên").navigationBarTitleDisplayMode(.inline)
        .searchable(text: $q, prompt: "Tên hoặc SĐT")
        .onSubmit(of: .search) { Task { await load() } }
        .refreshable { await load() }
        .task(id: "\(assigned)|\(sort)|\(minDays)") { await load() }
    }
    @MainActor private func load() async {
        do { data = try await API.care(assigned: assigned, sort: sort, minDays: minDays, q: q, page: 1); error = nil } catch { self.error = error.localizedDescription }
    }
}

// MARK: Cuộc gọi CSKH

struct CallsView: View {
    @State private var period: Period = .today
    @State private var data: API.Calls?
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PeriodPicker(period: $period)
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if let d = data {
                    let notes = d.staff.reduce(0) { $0 + $1.notes }, cust = d.staff.reduce(0) { $0 + $1.customers }, orders = d.staff.reduce(0) { $0 + $1.orders }, net = d.staff.reduce(0) { $0 + $1.net }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        MiniStat(title: "Cuộc gọi (ghi chú)", value: Fmt.int(notes))
                        MiniStat(title: "Khách được gọi", value: Fmt.int(cust))
                        MiniStat(title: "Đơn chốt CSKH", value: Fmt.int(orders), tint: .good)
                        MiniStat(title: "Doanh thu CSKH", value: Fmt.short(net) + " ₫", tint: .good)
                    }
                    Text("Cuộc gọi = một ghi chú nhân viên viết trên hồ sơ khách ở Pancake. Đơn chốt tính theo người bán trên đơn, ngày xác nhận lần đầu.").font(.caption).foregroundStyle(.secondary)
                    Card(title: "Theo nhân viên · \(d.staff.count)") {
                        let maxN = max(1, d.staff.map(\.notes).max() ?? 1)
                        ForEach(d.staff) { s in
                            NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", sellerId: s.authorId, basis: "confirmed", title: s.name))) {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack { Text(s.name).font(.subheadline.weight(.semibold)).lineLimit(1); Spacer(); Text("\(Fmt.int(s.notes)) gọi").font(.subheadline.weight(.bold)).monospacedDigit(); RowChevron() }
                                    Bar(value: s.notes / maxN, tint: .brand.opacity(0.7))
                                    Text("\(Fmt.int(s.customers)) khách · \(Fmt.int(s.orders)) đơn chốt · \(Fmt.short(s.net)) ₫ · cầm \(Fmt.int(s.assigned)) data").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                                }.padding(.vertical, 5).contentShape(.rect)
                            }.buttonStyle(.plain)
                            Divider()
                        }
                    }
                } else if error == nil { SkeletonGrid(tiles: 4) }
            }.padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Cuộc gọi CSKH").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: period) { await load() }
    }
    @MainActor private func load() async { do { data = try await API.calls(start: period.range.0, end: period.range.1); error = nil } catch { self.error = error.localizedDescription } }
}

// MARK: Mua lại & Upsell

struct RepurchaseView: View {
    @State private var period: Period = .month
    @State private var data: API.Repurchase?
    @State private var error: String?
    @State private var sellerId = ""
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PeriodPicker(period: $period, options: [.week, .month, .last, .quarter])
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if let d = data {
                    if !sellerId.isEmpty, let e = d.byEmployee.first(where: { $0.sellerId == sellerId }) ?? nil {
                        HStack { Label("Đang xem: \(e.name)", systemImage: "person.fill"); Spacer(); Button("Bỏ lọc") { sellerId = "" } }.font(.caption.weight(.semibold)).padding(10).background(Color.orange.opacity(0.12), in: .rect(cornerRadius: 10))
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        MiniStat(title: "Đơn thành công trong kỳ", value: Fmt.int(d.summary.successOrders))
                        MiniStat(title: "Khách mua lại", value: Fmt.int(d.summary.repurchase.customers), tint: .good)
                        MiniStat(title: "Đơn mua lại", value: Fmt.int(d.summary.repurchase.orders), tint: .good)
                        MiniStat(title: "Doanh thu mua lại", value: Fmt.short(d.summary.repurchase.net) + " ₫", tint: .good)
                    }
                    Card(title: "Lần mua trong kỳ") {
                        let maxV = max(1, d.summary.levels.map(\.orders).max() ?? 1)
                        ForEach(d.summary.levels, id: \.level) { l in
                            VStack(alignment: .leading, spacing: 3) {
                                HStack { Text(l.label).font(.subheadline); Spacer(); Text("\(Fmt.int(l.orders)) đơn · \(Fmt.int(l.customers)) khách · \(Fmt.short(l.net)) ₫").font(.caption).foregroundStyle(.secondary).monospacedDigit() }
                                Bar(value: l.orders / maxV, tint: l.level == 0 ? .gray : .brand)
                            }.padding(.vertical, 3)
                        }
                    }
                    Card(title: "Phễu trọn đời") {
                        let f = d.funnel
                        FunnelRow(label: "Mua ≥ 1 lần", n: f.once, of: f.once, color: .gray)
                        FunnelRow(label: "Mua ≥ 2 lần", n: f.twice, of: f.once, color: .brand)
                        FunnelRow(label: "Mua ≥ 3 lần", n: f.thrice, of: f.once, color: .good)
                    }
                    if !d.byTag.isEmpty {
                        Card(title: "Theo thẻ sản phẩm") {
                            ForEach(d.byTag.prefix(12), id: \.tag) { t in
                                HStack { Text(t.tag).font(.subheadline).lineLimit(1); Spacer(); Text("\(Fmt.int(t.resaleOrders))/\(Fmt.int(t.orders)) · \(Fmt.pct(t.resaleRate))").font(.caption).foregroundStyle(.secondary).monospacedDigit() }.padding(.vertical, 4)
                                Divider()
                            }
                        }
                    }
                    Card(title: "Theo nhân viên · chạm để lọc") {
                        ForEach(d.byEmployee.prefix(30)) { e in
                            Button { sellerId = sellerId == e.sellerId ? "" : e.sellerId } label: {
                                HStack { Text(e.name).font(.subheadline.weight(sellerId == e.sellerId ? .bold : .regular)).foregroundStyle(sellerId == e.sellerId ? Color.brand : .primary).lineLimit(1); Spacer(); Text("\(Fmt.int(e.repurchase.orders)) đơn · \(Fmt.short(e.repurchase.net)) ₫").font(.caption).foregroundStyle(.secondary).monospacedDigit() }.padding(.vertical, 5).contentShape(.rect)
                            }.buttonStyle(.plain)
                            Divider()
                        }
                    }
                    Card(title: "Đơn mua lại gần đây") {
                        ForEach(Array(d.recent.prefix(40).enumerated()), id: \.offset) { _, r in
                            NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone)) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("\(r.phone) · Upsell lần \(r.level) (đơn thứ \(Int(r.prior) + 1))").font(.subheadline.weight(.medium))
                                        Text("\(r.posName) · \(r.sellerName) · \(Fmt.day(r.createdAt))").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                    Spacer(); Text(Fmt.money(r.net)).font(.subheadline).monospacedDigit(); RowChevron()
                                }.padding(.vertical, 4).contentShape(.rect)
                            }.buttonStyle(.plain)
                            Divider()
                        }
                    }
                } else if error == nil { SkeletonGrid(tiles: 4) }
            }.padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Mua lại & Upsell").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: "\(period.rawValue)|\(sellerId)") { await load() }
    }
    @MainActor private func load() async { do { data = try await API.repurchase(start: period.range.0, end: period.range.1, sellerId: sellerId); error = nil } catch { self.error = error.localizedDescription } }
}

struct FunnelRow: View {
    let label: String; let n: Double; let of: Double; let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack { Text(label).font(.subheadline); Spacer(); Text("\(Fmt.int(n)) · \(Fmt.pct(of > 0 ? n / of * 100 : nil))").font(.caption.weight(.semibold)).monospacedDigit() }
            Bar(value: of > 0 ? n / of : 0, tint: color)
        }.padding(.vertical, 3)
    }
}

// MARK: Khách lâu chưa mua (nhóm khách)

struct DormantView: View {
    static let segments = [("dormant", "Ngủ đông > 90 ngày"), ("risk", "Nguy cơ rời"), ("potential", "Tiềm năng 31–90 ngày"), ("never", "Chưa mua"), ("vip", "VIP"), ("loyal", "Trung thành"), ("active", "Đang mua")]
    @State private var segment = "dormant"
    @State private var sort = "dormant"
    @State private var q = ""
    @State private var data: API.CustomerPage?
    @State private var rows: [API.CustomerRow] = []
    @State private var error: String?
    var body: some View {
        List {
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Self.segments, id: \.0) { key, label in
                            let n = data?.segments?[key]
                            Chip(label: n.map { "\(label) · \(Fmt.int($0))" } ?? label, on: segment == key) { segment = key; sort = key == "dormant" ? "dormant" : "recent" }
                        }
                    }
                }.listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 0)).listRowBackground(Color.clear)
                Picker("Sắp xếp", selection: $sort) { Text("Lâu chưa mua nhất").tag("dormant"); Text("Mua gần đây").tag("recent"); Text("Mua nhiều tiền").tag("spend"); Text("Nhiều đơn").tag("orders") }
            }
            if let error, rows.isEmpty { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            Section(data.map { "\(Fmt.int($0.total)) khách" } ?? "Đang tải") {
                ForEach(rows) { r in
                    NavigationLink(value: Route.customer(posId: r.posId, phone: r.phone)) {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack { Text(r.name ?? r.phone).font(.subheadline.weight(.semibold)).lineLimit(1); Spacer(); if let d = r.daysSinceSuccess { Text("\(Fmt.int(d)) ngày").font(.caption.weight(.semibold)).foregroundStyle(d > 90 ? Color.bad : .orange) } }
                            Text("\(r.phone) · \(r.posName)\(r.sellerName.map { " · \($0)" } ?? "")").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            Text("\(Fmt.int(r.successOrders)) đơn TC · \(Fmt.short(r.successNet)) ₫ · mua cuối \(Fmt.day(r.lastSuccessAt ?? r.lastOrderAt))").font(.caption2).foregroundStyle(.tertiary).monospacedDigit()
                        }
                    }
                }
                if data?.hasMore == true { Button("Tải thêm") { Task { await load(next: true) } } }
            }
        }
        .navigationTitle("Khách lâu chưa mua").navigationBarTitleDisplayMode(.inline)
        .searchable(text: $q, prompt: "Tên hoặc SĐT")
        .onSubmit(of: .search) { Task { await load(next: false) } }
        .refreshable { await load(next: false) }
        .task(id: "\(segment)|\(sort)") { await load(next: false) }
    }
    @MainActor private func load(next: Bool) async {
        do {
            let p = try await API.customers(segment: segment, sort: sort, q: q, page: next ? (data?.page ?? 0) + 1 : 1)
            rows = next ? rows + p.customers : p.customers; data = p; error = nil
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: So sánh nhân viên

struct CompareView: View {
    @State private var period: Period = .month
    @State private var sort = "closedNet"
    @State private var data: API.Overview?
    @State private var names: [String: API.Employee] = [:]
    @State private var error: String?
    private var rows: [API.EmployeeRow] {
        let r = (data?.current.byEmployee ?? []).filter { !$0.sellerId.isEmpty }
        switch sort {
        case "closedOrders": return r.sorted { $0.closedOrders > $1.closedOrders }
        case "rate": return r.sorted { ($0.assignedCloseRate ?? -1) > ($1.assignedCloseRate ?? -1) }
        default: return r.sorted { $0.closedNet > $1.closedNet }
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PeriodPicker(period: $period)
                Picker("Xếp theo", selection: $sort) { Text("Doanh thu").tag("closedNet"); Text("Đơn chốt").tag("closedOrders"); Text("Tỷ lệ chốt").tag("rate") }.pickerStyle(.segmented)
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad).font(.subheadline) }
                if data != nil {
                    Card(title: "Nhân viên · \(rows.count)") {
                        let maxV = max(1, rows.map { sort == "closedOrders" ? $0.closedOrders : sort == "rate" ? ($0.assignedCloseRate ?? 0) : $0.closedNet }.max() ?? 1)
                        ForEach(Array(rows.enumerated()), id: \.element.id) { i, e in
                            NavigationLink(value: Route.orders(OrderQuery(start: period.range.0, end: period.range.1, group: "closed", sellerId: e.sellerId, basis: "confirmed", title: e.name ?? names[e.sellerId]?.name ?? "Nhân viên"))) {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 8) {
                                        Text("\(i + 1)").font(.caption.weight(.bold)).foregroundStyle(i < 3 ? Color.brand : .secondary).frame(width: 22)
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(e.name ?? names[e.sellerId]?.name ?? "NV \(e.sellerId.prefix(8))").font(.subheadline.weight(.semibold)).lineLimit(1)
                                            if let d = e.department ?? names[e.sellerId]?.department { Text(d).font(.caption2).foregroundStyle(.tertiary) }
                                        }
                                        Spacer()
                                        Text(sort == "closedOrders" ? Fmt.int(e.closedOrders) : sort == "rate" ? Fmt.pct(e.assignedCloseRate) : Fmt.short(e.closedNet) + " ₫").font(.subheadline.weight(.bold)).monospacedDigit()
                                        RowChevron()
                                    }
                                    Bar(value: (sort == "closedOrders" ? e.closedOrders : sort == "rate" ? (e.assignedCloseRate ?? 0) : e.closedNet) / maxV, tint: .brand.opacity(0.7)).padding(.leading, 30)
                                    Text("\(Fmt.int(e.closedOrders)) chốt / \(Fmt.int(e.assignedOrders)) chia · \(Fmt.pct(e.assignedCloseRate)) · TB \(Fmt.short(e.averageOrder ?? 0)) ₫").font(.caption).foregroundStyle(.secondary).monospacedDigit().padding(.leading, 30)
                                }.padding(.vertical, 5).contentShape(.rect)
                            }.buttonStyle(.plain)
                            Divider()
                        }
                    }
                } else if error == nil { SkeletonGrid(tiles: 4) }
            }.padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("So sánh nhân viên").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: period) { await load() }
    }
    @MainActor private func load() async {
        do {
            if names.isEmpty { names = Dictionary(uniqueKeysWithValues: try await API.employees().map { ($0.id, $0) }) }
            data = try await API.overview(start: period.range.0, end: period.range.1); error = nil
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: Data được cấp

struct BatchesView: View {
    @State private var period: Period = .quarter
    @State private var data: API.Batches?
    @State private var error: String?
    var body: some View {
        List {
            Section { PeriodPicker(period: $period, options: [.month, .last, .quarter]).listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if let d = data {
                let months = Array(Set(d.batches.map(\.month))).sorted(by: >)
                ForEach(months, id: \.self) { m in
                    let rows = d.batches.filter { $0.month == m }
                    let recv = rows.reduce(0) { $0 + $1.received }, buy = rows.reduce(0) { $0 + $1.buyers }
                    Section("Tháng \(m.suffix(2))/\(m.prefix(4)) · \(Fmt.int(recv)) số · mua \(Fmt.pct(recv > 0 ? buy / recv * 100 : nil))") {
                        ForEach(rows) { b in
                            NavigationLink(value: Route.orders(OrderQuery(start: m + "-01", end: VNDate.monthEnd(m), posIds: [b.posId], sellerId: b.sellerId, basis: "assigned", title: b.sellerName))) {
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack { Text(b.sellerName).font(.subheadline.weight(.semibold)).lineLimit(1); Spacer(); Text(Fmt.pct(b.buyRate)).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle((b.buyRate ?? 0) >= 30 ? Color.good : .primary) }
                                    Text("\(PosBreakdown.names[b.posId] ?? b.posName) · nhận \(Fmt.int(b.received)) · mua \(Fmt.int(b.buyers)) · mua lại \(Fmt.int(b.repeatBuyers)) · \(Fmt.short(b.net)) ₫").font(.caption).foregroundStyle(.secondary).monospacedDigit().lineLimit(1)
                                }
                            }
                        }
                    }
                }
            } else if error == nil { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
        }
        .navigationTitle("Data được cấp").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: period) { await load() }
    }
    @MainActor private func load() async { do { data = try await API.batches(start: period.range.0, end: period.range.1); error = nil } catch { self.error = error.localizedDescription } }
}

extension VNDate {
    /// "2026-09" → "2026-09-30"
    static func monthEnd(_ ym: String) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        let f = DateFormatter(); f.timeZone = tz; f.dateFormat = "yyyy-MM"
        guard let d = f.date(from: String(ym.prefix(7))), let next = cal.date(byAdding: .month, value: 1, to: d) else { return ym + "-28" }
        return string(next.addingTimeInterval(-1))
    }
}
