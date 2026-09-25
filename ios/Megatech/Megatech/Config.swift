import SwiftUI

/// Cấu hình & kết nối bản riêng: kết nối POS, lịch đồng bộ, cảnh báo Telegram, người dùng & quyền, team marketing, ca cá nhân.
struct ConfigView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(SyncStatus.self) private var sync
    @State private var config: API.Config?
    @State private var tg: API.Telegram?
    @State private var busy: Set<String> = []
    @State private var toast: String?
    @State private var sheet: Sheet?
    private var isOwner: Bool { auth.me?.role == "owner" }
    enum Sheet: String, Identifiable { case alert, users, teams, telegram, shifts; var id: String { rawValue } }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Cấu hình & kết nối", subtitle: "Kết nối ổn định. Làm chủ hệ thống.", trailing: AnyView(Tag(text: isOwner ? "Chỉ dành cho Admin" : "Chỉ xem", tone: .green, dot: true)))
                if let toast { Text(toast).font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.good).padding(10).background(Color.brandSoft, in: .rect(cornerRadius: 10)) }
                SectionHead(title: "Kết nối hệ thống POS", action: "\(sync.pos.count) shop")
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(PosBreakdown.order, id: \.self) { id in
                        let p = sync.pos.first { $0.posId == id }
                        let shop = config?.shops.first { $0.id == id }
                        let err = p?.lastError != nil, slow = p.map { sync.age($0) > 15 } ?? true
                        Button { if isOwner { sheet = nil; shopEdit = shop ?? API.ConfigShop(id: id, name: PosBreakdown.names[id] ?? id, shopId: "", status: nil, lastSyncAt: nil, historyStart: nil, lastError: nil) } } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                PosBadge(id: id, size: 28)
                                Text(PosBreakdown.short[id] ?? id).font(.system(size: 11, weight: .bold)).foregroundStyle(Color.ink).lineLimit(1)
                                HStack(spacing: 4) { Circle().fill(err ? Color.bad : slow ? Color.warn : Color.good).frame(width: 6, height: 6); Text(err ? "Gián đoạn" : slow ? "Chậm" : "Hoạt động").font(.system(size: 9, weight: .semibold)).foregroundStyle(err ? Color.bad : slow ? Color.warn : Color.good) }
                                Text(p.map { "Đồng bộ: \(sync.age($0) < 60 ? "\(sync.age($0)) phút" : sync.age($0) < 1440 ? "\(sync.age($0) / 60) giờ" : "\(sync.age($0) / 1440) ngày") trước" } ?? "Chưa có").font(.system(size: 8)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                Text("Shop ID \(shop?.shopId?.isEmpty == false ? shop!.shopId! : "—")").font(.system(size: 8)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                if isOwner { Button { Task { await syncNow(id) } } label: { if busy.contains(id) { Text("Đang đồng bộ…").font(.system(size: 8, weight: .bold)).foregroundStyle(Color.inkSoft).padding(.horizontal, 5).padding(.vertical, 2).overlay(ThinkingBorder(radius: 5, line: 1.5, glow: false)) } else { Text("Đồng bộ ngay").font(.system(size: 8, weight: .bold)).foregroundStyle(Color.brand) } }.buttonStyle(.plain).disabled(busy.contains(id)) }
                            }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(err ? Color.bad.opacity(0.06) : Color.card, in: .rect(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(err ? Color.bad.opacity(0.3) : Color.clear)).cardShadow()
                        }.buttonStyle(.plain)
                    }
                }
                if let e = sync.pos.first(where: { $0.lastError != nil })?.lastError { Text("Lỗi gần nhất: \(e)").font(.system(size: 10)).foregroundStyle(Color.bad) }
                Panel(padding: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "clock.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.good).frame(width: 34, height: 34).background(Color.brandSoft, in: .rect(cornerRadius: 9))
                        VStack(alignment: .leading, spacing: 2) { Text("Lịch đồng bộ dữ liệu").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); Text("Tự động mỗi 5 phút (Cloudflare) · khách hàng và ghi chú vài phút một lần").font(.system(size: 10)).foregroundStyle(Color.inkSoft); Text("Lần đồng bộ gần nhất: \(sync.pos.compactMap(\.lastSyncAt).max().map { Fmt.dateTime($0) } ?? "—")").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                        Spacer()
                        if isOwner { Button { Task { for id in PosBreakdown.order { await syncNow(id) } } } label: { Text("Đồng bộ tất cả").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 7).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.15))) }.buttonStyle(.plain) }
                    }
                }
                HStack(alignment: .top, spacing: 10) {
                    Button { sheet = .teams } label: { Panel(padding: 12) { HStack(spacing: 6) { Image(systemName: "person.2.fill").foregroundStyle(Color.good); Text("Phân công theo team").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink) }; Text("Team Marketing và marketer phụ trách từng nhân viên.").font(.system(size: 10)).foregroundStyle(Color.inkSoft); Text("Mở thiết lập ›").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.brand).padding(.top, 4) } }.buttonStyle(.plain)
                    Button { if isOwner { sheet = .users } } label: { Panel(padding: 12) { HStack(spacing: 6) { Image(systemName: "checklist").foregroundStyle(Color.good); Text("Thiết lập quyền truy cập").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink) }; VStack(alignment: .leading, spacing: 3) { ForEach(["Tài khoản & vai trò", "Trang được xem", "POS được xem", "Đội Sale / CSKH"], id: \.self) { t in HStack(spacing: 5) { Image(systemName: "checkmark.square.fill").font(.system(size: 9)).foregroundStyle(Color.good); Text(t).font(.system(size: 9)).foregroundStyle(Color.inkSoft) } } }; Text(isOwner ? "Quản lý người dùng ›" : "Chỉ chủ hệ thống").font(.system(size: 10, weight: .bold)).foregroundStyle(isOwner ? Color.brand : Color.inkSoft).padding(.top, 4) } }.buttonStyle(.plain)
                }
                Button { if isOwner { sheet = .alert } } label: {
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Image(systemName: "bell.badge.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white).frame(width: 34, height: 34).background(Color.warn, in: .circle)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Cảnh báo tỷ lệ chốt thấp").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                                if let a = config?.alert { Text(a.enabled ? "Đang bật · dưới \(a.threshold)% khi ≥ \(a.minReceived) số · ca \(a.shiftStart)–\(a.shiftEnd) · \(a.employeeIds.isEmpty ? "mọi nhân viên" : "\(a.employeeIds.count) nhân viên")" : "Đang tắt").font(.system(size: 10)).foregroundStyle(a.enabled ? Color.good : Color.inkSoft) } else { Text("—").font(.system(size: 10)) }
                            }
                            Spacer(); if isOwner { Text("Cấu hình").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 12).padding(.vertical, 7).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.15))) }
                        }
                    }
                }.buttonStyle(.plain)
                Button { sheet = .telegram } label: {
                    Panel(padding: 12) {
                        HStack(spacing: 10) {
                            Image(systemName: "paperplane.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white).frame(width: 34, height: 34).background(Color.blue, in: .circle)
                            VStack(alignment: .leading, spacing: 2) { Text("Kết nối Telegram").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); HStack(spacing: 4) { Text("Trạng thái:").font(.system(size: 11)).foregroundStyle(Color.inkSoft); Text(tg == nil ? "—" : tg!.hasToken && tg!.botError == nil ? "Hoạt động" : "Chưa sẵn sàng").font(.system(size: 11, weight: .bold)).foregroundStyle(tg?.hasToken == true && tg?.botError == nil ? Color.good : Color.warn) }; Text(tg?.bot?.username.map { "Bot @\($0) · \(tg?.allowed.count ?? 0) chat được phép" } ?? "Nhận cảnh báo hệ thống, lỗi đồng bộ, tuyển dụng, báo cáo nhanh.").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                            Spacer(); Text("Kiểm tra").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.ink).padding(.horizontal, 12).padding(.vertical, 7).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.15)))
                        }
                    }
                }.buttonStyle(.plain)
                Button { sheet = .shifts } label: {
                    Panel(padding: 12) { HStack(spacing: 10) { Image(systemName: "clock.badge.checkmark.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.purple).frame(width: 34, height: 34).background(Color.purple.opacity(0.13), in: .rect(cornerRadius: 9)); VStack(alignment: .leading, spacing: 2) { Text("Ca làm cá nhân").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink); Text("Giờ bắt đầu / kết thúc của từng nhân viên cho chế độ Ca cá nhân trong Điều hành trong ca.").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }; Spacer(); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.inkSoft) } }
                }.buttonStyle(.plain)
            }.padding(16)
        }
        .navigationTitle("Cấu hình & kết nối").navigationBarTitleDisplayMode(.inline).brandNav()
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $sheet) { s in
            switch s {
            case .alert: AlertRuleSheet(alert: config?.alert) { toast = "Đã lưu cảnh báo."; Task { await load() } }
            case .users: UsersSheet()
            case .teams: TeamsSheet()
            case .telegram: TelegramSheet(tg: tg)
            case .shifts: ShiftsSheet()
            }
        }
        .sheet(item: $shopEdit) { shop in ShopIdSheet(shop: shop) { toast = "Đã lưu Shop ID cho \(shop.name)."; Task { await load() } } }
    }
    @State private var shopEdit: API.ConfigShop?
    @MainActor private func load() async { await sync.refresh(); config = try? await API.config(); tg = try? await API.telegram() }
    @MainActor private func syncNow(_ posId: String) async {
        busy.insert(posId); defer { busy.remove(posId) }
        do { let r = try await API.syncNow(posId: posId); toast = "\(PosBreakdown.names[posId] ?? posId): đã đồng bộ \(Fmt.int(r.records ?? 0)) đơn mới."; await sync.refresh() } catch { toast = error.localizedDescription }
    }
}

struct ShopIdSheet: View {
    let shop: API.ConfigShop; let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var shopId = ""; @State private var error: String?; @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                Section(shop.name) { TextField("Shop ID (dãy số trên Pancake)", text: $shopId).keyboardType(.numberPad) }
                Section { Text("Lấy trong Pancake POS: địa chỉ trang có dạng pos.pancake.vn/shop/<số>/…; số đó là Shop ID. API key giữ ở Cloudflare, không nhập ở đây.").font(.caption).foregroundStyle(.secondary); if let h = shop.historyStart { Text("Lịch sử đã lấy từ \(Fmt.day(h))").font(.caption).foregroundStyle(.secondary) } }
                if let error { Text(error).foregroundStyle(Color.bad).font(.caption) }
            }
            .navigationTitle("Kết nối POS").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(busy ? "Đang lưu…" : "Lưu") { Task { busy = true; defer { busy = false }; do { try await API.saveShop(id: shop.id, shopId: shopId); done(); dismiss() } catch { self.error = error.localizedDescription } } }.disabled(busy || shopId.isEmpty) } }
            .onAppear { shopId = shop.shopId ?? "" }
        }.presentationDetents([.medium])
    }
}

struct AlertRuleSheet: View {
    let alert: API.ConfigAlert?; let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var a = API.ConfigAlert(enabled: false, threshold: 40, minReceived: 20, cooldownMinutes: 60, shiftStart: "08:00", shiftEnd: "12:00", repeat: false, chatId: "", employeeIds: [])
    @State private var staff: [API.Employee] = []
    @State private var error: String?; @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                Section { Toggle("Bật cảnh báo qua Telegram", isOn: $a.enabled).tint(.good) }
                Section("Điều kiện") {
                    Stepper("Tỷ lệ chốt dưới \(a.threshold)%", value: $a.threshold, in: 1...100)
                    Stepper("Khi đã nhận từ \(a.minReceived) số", value: $a.minReceived, in: 1...10000, step: 5)
                    Stepper("Nhắc lại sau \(a.cooldownMinutes) phút", value: $a.cooldownMinutes, in: 5...1440, step: 5)
                    Toggle("Lặp lại khi vẫn thấp", isOn: $a.repeat).tint(.good)
                }
                Section("Khung giờ ca") {
                    HStack { Text("Từ"); TextField("08:00", text: $a.shiftStart).multilineTextAlignment(.trailing).keyboardType(.numbersAndPunctuation); Text("đến"); TextField("12:00", text: $a.shiftEnd).multilineTextAlignment(.trailing).keyboardType(.numbersAndPunctuation) }
                }
                Section("Gửi tới") { TextField("Chat ID Telegram (dãy số)", text: Binding(get: { a.chatId ?? "" }, set: { a.chatId = $0 })).keyboardType(.numbersAndPunctuation); Text("Để trống thì gửi tới các chat đã được phép nhận cảnh báo.").font(.caption).foregroundStyle(.secondary) }
                Section("Nhân viên theo dõi (\(a.employeeIds.isEmpty ? "tất cả" : "\(a.employeeIds.count)"))") {
                    ForEach(staff.filter { $0.active != false }) { e in
                        Button { if let i = a.employeeIds.firstIndex(of: e.id) { a.employeeIds.remove(at: i) } else { a.employeeIds.append(e.id) } } label: { HStack { Text(e.name).foregroundStyle(.primary); Text(e.department ?? "").font(.caption).foregroundStyle(.secondary); Spacer(); if a.employeeIds.contains(e.id) { Image(systemName: "checkmark").foregroundStyle(Color.good) } } }
                    }
                }
                if let error { Text(error).foregroundStyle(Color.bad).font(.caption) }
            }
            .navigationTitle("Cảnh báo tỷ lệ chốt").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(busy ? "Đang lưu…" : "Lưu") { Task { busy = true; defer { busy = false }; do { try await API.saveAlert(a); done(); dismiss() } catch { self.error = error.localizedDescription } } }.disabled(busy) } }
            .task { if let alert { a = alert }; staff = (try? await API.employees()) ?? [] }
        }
    }
}

struct UsersSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var users: [API.User] = []
    @State private var edit: API.User?
    @State private var create = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(Color.bad).font(.caption) }
                ForEach(users) { u in
                    Button { edit = u } label: {
                        HStack(spacing: 10) {
                            Avatar(name: u.name, size: 34, tint: u.disabled ? .gray : .brand)
                            VStack(alignment: .leading, spacing: 2) { Text(u.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary); Text("\(u.email) · \(roleName(u.role))\(u.team == "sale" ? " · Sale" : u.team == "cskh" ? " · CSKH" : "")").font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                            Spacer(); if u.disabled { Tag(text: "Đã khoá", tone: .red) } else { Text(u.lastLoginAt.map { "vào \(Fmt.day($0))" } ?? "chưa đăng nhập").font(.caption2).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
            .navigationTitle("Người dùng · \(users.count)").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { dismiss() } }; ToolbarItem(placement: .primaryAction) { Button { create = true } label: { Image(systemName: "plus") } } }
            .sheet(item: $edit) { u in UserEditSheet(user: u) { Task { await load() } } }
            .sheet(isPresented: $create) { UserEditSheet(user: nil) { Task { await load() } } }
            .task { await load() }
        }
    }
    private func roleName(_ r: String) -> String { r == "owner" ? "Chủ hệ thống" : r == "director" ? "Giám đốc" : r == "lead" ? "Trưởng nhóm" : "Nhân viên" }
    @MainActor private func load() async { do { users = try await API.users(); error = nil } catch { self.error = error.localizedDescription } }
}

struct UserEditSheet: View {
    let user: API.User?; let done: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""; @State private var email = ""; @State private var password = ""; @State private var title = ""
    @State private var role = "staff"; @State private var team = "all"; @State private var views: Set<String> = []; @State private var posIds: Set<String> = []; @State private var disabled = false
    @State private var error: String?; @State private var busy = false
    static let viewLabels: [(String, String)] = [("center", "Điều khiển trung tâm"), ("overview", "Tổng quan POS"), ("shift", "Điều hành trong ca"), ("calls", "Cuộc gọi CSKH"), ("care", "Khách theo nhân viên"), ("repurchase", "Mua lại & Upsell"), ("dormant", "Khách lâu chưa mua"), ("marketing", "Tổng quan MKT"), ("compare", "So sánh nhân viên"), ("batches", "Data được cấp"), ("pipeline", "Vận hành đơn"), ("customers", "Hồ sơ khách hàng"), ("monthly", "Báo cáo cuối tháng"), ("custom", "Báo cáo tùy chỉnh"), ("raw-orders", "Đơn nguồn Pancake POS")]
    var body: some View {
        NavigationStack {
            Form {
                Section("Tài khoản") {
                    TextField("Họ tên", text: $name)
                    if user == nil { TextField("Email", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never); SecureField("Mật khẩu (từ 8 ký tự)", text: $password) } else { LabeledContent("Email", value: user!.email) }
                    TextField("Chức danh", text: $title)
                    if user?.role != "owner" {
                        Picker("Vai trò", selection: $role) { Text("Nhân viên").tag("staff"); Text("Trưởng nhóm").tag("lead"); Text("Giám đốc").tag("director") }
                        Picker("Đội", selection: $team) { Text("Tất cả").tag("all"); Text("Sale").tag("sale"); Text("CSKH").tag("cskh") }
                        if user != nil { Toggle("Khoá tài khoản", isOn: $disabled).tint(.bad) }
                    }
                }
                if user?.role != "owner" {
                    Section("Trang được xem (\(views.count))") { ForEach(Self.viewLabels, id: \.0) { k, l in Button { if views.contains(k) { views.remove(k) } else { views.insert(k) } } label: { HStack { Text(l).foregroundStyle(.primary); Spacer(); if views.contains(k) { Image(systemName: "checkmark").foregroundStyle(Color.good) } } } } }
                    Section("POS được xem (\(posIds.isEmpty ? "tất cả" : "\(posIds.count)"))") { ForEach(PosBreakdown.order, id: \.self) { id in Button { if posIds.contains(id) { posIds.remove(id) } else { posIds.insert(id) } } label: { HStack { PosBadge(id: id, size: 22); Text(PosBreakdown.names[id] ?? id).foregroundStyle(.primary); Spacer(); if posIds.contains(id) { Image(systemName: "checkmark").foregroundStyle(Color.good) } } } } }
                }
                if let error { Text(error).foregroundStyle(Color.bad).font(.caption) }
            }
            .navigationTitle(user == nil ? "Thêm tài khoản" : "Sửa tài khoản").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(busy ? "Đang lưu…" : "Lưu") { Task { await save() } }.disabled(busy || name.isEmpty || (user == nil && (email.isEmpty || password.count < 8))) } }
            .onAppear { if let u = user { name = u.name; title = u.title ?? ""; role = u.role == "owner" ? "staff" : u.role; team = u.team ?? "all"; views = Set(u.views); posIds = Set(u.posIds); disabled = u.disabled } }
        }
    }
    @MainActor private func save() async {
        busy = true; defer { busy = false }
        do {
            var body: [String: Any] = ["name": name, "title": title, "views": Array(views), "posIds": Array(posIds), "team": team]
            if let u = user { body["id"] = u.id; if u.role != "owner" { body["role"] = role; body["disabled"] = disabled }; try await API.updateUser(body) }
            else { body["email"] = email; body["password"] = password; body["role"] = role; try await API.createUser(body) }
            done(); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct TeamsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthModel.self) private var auth
    @State private var data: API.MktTeams?
    @State private var teams: [API.MktTeam] = []
    @State private var error: String?; @State private var busy = false; @State private var newName = ""
    private var isOwner: Bool { auth.me?.role == "owner" }
    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(Color.bad).font(.caption) }
                ForEach($teams) { $t in
                    Section {
                        if isOwner { TextField("Tên team", text: $t.name).font(.headline) } else { Text(t.name).font(.headline) }
                        ForEach(t.memberIds, id: \.self) { m in
                            HStack { Text(data?.people.first { $0.id == m }?.name ?? m); Spacer(); if isOwner { Button { t.memberIds.removeAll { $0 == m } } label: { Image(systemName: "minus.circle.fill").foregroundStyle(Color.bad) }.buttonStyle(.plain) } }
                        }
                        if isOwner {
                            Menu { ForEach((data?.people ?? []).filter { ($0.marketer ?? false) && !teams.flatMap(\.memberIds).contains($0.id) }) { p in Button(p.name) { t.memberIds.append(p.id) } } } label: { Label("Thêm marketer", systemImage: "plus") }
                            Button(role: .destructive) { teams.removeAll { $0.id == t.id } } label: { Label("Xoá team", systemImage: "trash") }
                        }
                    }
                }
                if isOwner {
                    Section("Team mới") { HStack { TextField("Tên team", text: $newName); Button("Thêm") { teams.append(API.MktTeam(id: "mkt_" + UUID().uuidString.lowercased(), name: newName.trimmingCharacters(in: .whitespaces), memberIds: [])); newName = "" }.disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty) } }
                }
                if let d = data {
                    let free = d.people.filter { ($0.marketer ?? false) && !teams.flatMap(\.memberIds).contains($0.id) }
                    if !free.isEmpty { Section("Marketer chưa có team · \(free.count)") { ForEach(free) { p in Text(p.name).foregroundStyle(.secondary) } } }
                }
            }
            .navigationTitle("Team Marketing").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { dismiss() } }; if isOwner { ToolbarItem(placement: .confirmationAction) { Button(busy ? "Đang lưu…" : "Lưu") { Task { busy = true; defer { busy = false }; do { try await API.saveMarketingTeams(teams); dismiss() } catch { self.error = error.localizedDescription } } }.disabled(busy) } } }
            .task { do { let d = try await API.marketingTeams(); data = d; teams = d.teams } catch { self.error = error.localizedDescription } }
        }
    }
}

struct TelegramSheet: View {
    let tg: API.Telegram?
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthModel.self) private var auth
    @State private var chatId = ""; @State private var msg: String?; @State private var busy = false
    var body: some View {
        NavigationStack {
            List {
                Section("Bot") {
                    LabeledContent("Token", value: tg?.hasToken == true ? "Đã cấu hình (Cloudflare)" : "Chưa có")
                    LabeledContent("Bot", value: tg?.bot?.username.map { "@\($0)" } ?? tg?.botError ?? "—")
                    if let c = tg?.pairingCode, !c.isEmpty { LabeledContent("Mã ghép nối", value: c); Text("Người mới nhắn mã này cho bot để xin quyền nhận thông báo; chủ hệ thống duyệt trên web hoặc bằng lệnh /tuyendung bat.").font(.caption).foregroundStyle(.secondary) }
                }
                Section("Chat được phép · \(tg?.allowed.count ?? 0)") {
                    ForEach(tg?.allowed ?? []) { c in
                        HStack { VStack(alignment: .leading, spacing: 1) { Text(c.name?.isEmpty == false ? c.name! : c.chat_id).font(.subheadline); Text("\(c.chat_id) · \(c.role == "admin" ? "quản trị" : "thành viên")").font(.caption).foregroundStyle(.secondary) }; Spacer()
                            if auth.me?.role == "owner" { Button(role: .destructive) { Task { try? await API.telegramAction(["action": "disallow", "chatId": c.chat_id]); msg = "Đã gỡ \(c.chat_id)." } } label: { Image(systemName: "minus.circle").foregroundStyle(Color.bad) }.buttonStyle(.plain) } }
                    }
                    if (tg?.allowed ?? []).isEmpty { Text("Chưa có chat nào.").font(.caption).foregroundStyle(.secondary) }
                }
                if let recent = tg?.chats, !recent.isEmpty {
                    Section("Chat gần đây với bot") { ForEach(recent) { c in HStack { Text(c.name ?? c.id).font(.subheadline); Spacer(); if auth.me?.role == "owner" { Button("Cho phép") { Task { try? await API.telegramAction(["action": "allow", "chatId": c.id, "name": c.name ?? ""]); msg = "Đã cho phép \(c.name ?? c.id)." } }.font(.caption) } } } }
                }
                Section("Gửi tin thử") {
                    TextField("Chat ID (dãy số)", text: $chatId).keyboardType(.numbersAndPunctuation)
                    Button(busy ? "Đang gửi…" : "Gửi tin nhắn kiểm tra") { Task { busy = true; defer { busy = false }; do { try await API.telegramAction(["action": "test", "chatId": chatId]); msg = "Đã gửi tin thử tới \(chatId)." } catch { msg = error.localizedDescription } } }.disabled(busy || chatId.isEmpty)
                    if let msg { Text(msg).font(.caption).foregroundStyle(Color.good) }
                }
            }
            .navigationTitle("Telegram").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { dismiss() } } }
        }
    }
}

struct ShiftsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthModel.self) private var auth
    @State private var staff: [API.Employee] = []
    @State private var items: [String: (Int, Int)] = [:]
    @State private var error: String?; @State private var busy = false
    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(Color.bad).font(.caption) }
                Text("Đặt giờ ca riêng cho từng người; để trống thì dùng ca chung. Áp dụng cho chế độ Ca cá nhân của Điều hành trong ca.").font(.caption).foregroundStyle(.secondary)
                ForEach(staff.filter { $0.active != false }) { e in
                    HStack {
                        VStack(alignment: .leading, spacing: 1) { Text(e.name).font(.subheadline); Text(e.department ?? "").font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        let v = items[e.id]
                        Menu { Button("Dùng ca chung") { items[e.id] = nil }; ForEach([(8, 12), (8, 17), (12, 17), (13, 22), (17, 22), (8, 22)], id: \.0) { a, b in Button("\(a):00 – \(b):00") { items[e.id] = (a, b) } } } label: { Text(v.map { "\($0.0):00 – \($0.1):00" } ?? "Ca chung").font(.subheadline.weight(.semibold)).foregroundStyle(v == nil ? .secondary : Color.brand) }.disabled(auth.me?.role != "owner")
                    }
                }
            }
            .navigationTitle("Ca làm cá nhân").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { dismiss() } }; if auth.me?.role == "owner" { ToolbarItem(placement: .confirmationAction) { Button(busy ? "Đang lưu…" : "Lưu") { Task { await save() } }.disabled(busy) } } }
            .task { staff = (try? await API.employees()) ?? []; if let s = try? await API.staffSettings() { for it in s.items { if let a = it.shiftStart, let b = it.shiftEnd { items[it.userId] = (a, b) } } } }
        }
    }
    @MainActor private func save() async {
        busy = true; defer { busy = false }
        do { try await API.saveStaffSettings(staff.map { e in var d: [String: Any] = ["userId": e.id]; if let v = items[e.id] { d["shiftStart"] = v.0; d["shiftEnd"] = v.1 } else { d["shiftStart"] = NSNull(); d["shiftEnd"] = NSNull() }; return d }); dismiss() } catch { self.error = error.localizedDescription }
    }
}
