import SwiftUI

/// Tuyển dụng (ảnh 6.2): 4 ô tổng, lọc vị trí và trạng thái, tìm, danh sách ứng viên có avatar và chip, thêm ứng viên (mở sheet).
struct RecruitView: View {
    @State private var data: API.RecruitList?
    @State private var error: String?
    @State private var tab = "overview"
    @State private var status = ""
    @State private var position = ""
    @State private var q = ""
    @State private var sort = "new"
    static let statusOrder = ["new", "review", "booked", "interviewed", "passed", "trial", "failed", "rejected"]
    static func tone(_ s: String) -> Tone { switch s { case "new": return .blue; case "review", "booked": return .orange; case "interviewed": return .purple; case "passed", "trial": return .green; case "failed", "rejected": return .red; default: return .gray } }
    private var positions: [String] { Array(Set((data?.candidates ?? []).compactMap { $0.position?.isEmpty == false ? $0.position : nil })).sorted() }
    private var rows: [API.Candidate] {
        let t = q.trimmingCharacters(in: .whitespaces).lowercased()
        let r = (data?.candidates ?? []).filter { c in (status.isEmpty || c.status == status) && (position.isEmpty || c.position == position) && (t.isEmpty || c.name.lowercased().contains(t) || (c.phone ?? "").contains(t) || (c.position ?? "").lowercased().contains(t) || (c.handler ?? "").lowercased().contains(t)) }
        return sort == "new" ? r.sorted { $0.updatedAt > $1.updatedAt } : r.sorted { $0.name < $1.name }
    }
    private func count(_ keys: [String]) -> Int { (data?.candidates ?? []).filter { keys.contains($0.status) }.count }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageTitle(title: "Tuyển dụng", subtitle: "Đúng người, đúng việc. Kiến tạo đội ngũ mạnh.", trailing: AnyView(
                    Menu { ForEach(data?.sources ?? []) { s in Link(destination: URL(string: "https://docs.google.com/spreadsheets/d/\(s.fileId)")!) { Label(s.fileName, systemImage: "tablecells") } } } label: { Image(systemName: "plus").font(.system(size: 15, weight: .bold)).foregroundStyle(.white).frame(width: 34, height: 34).background(Color.brandDeep, in: .circle) }))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(label: "Tổng quan", on: tab == "overview") { tab = "overview" }
                        FilterChip(label: "Ứng viên", on: tab == "list") { tab = "list" }
                        FilterChip(label: "Vị trí tuyển", on: tab == "positions") { tab = "positions" }
                        FilterChip(label: "Lịch phỏng vấn", on: tab == "interviews") { tab = "interviews"; status = "booked" }
                    }
                }
                if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
                if let d = data {
                    if tab == "overview" || tab == "positions" {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                            Button { status = ""; tab = "list" } label: { StatCard(icon: "person.text.rectangle.fill", tint: .good, label: "Tổng ứng viên", value: Fmt.int(Double(d.candidates.count)), sub: "Từ \(d.sources?.count ?? 4) file Google Sheets") }
                            Button { status = "review"; tab = "list" } label: { StatCard(icon: "hourglass", tint: .warn, label: "Đang xét duyệt", value: Fmt.int(Double(count(["new", "review"]))), sub: "Mới nhận + đang xem") }
                            Button { status = "booked"; tab = "list" } label: { StatCard(icon: "person.wave.2.fill", tint: .blue, label: "Phỏng vấn", value: Fmt.int(Double(count(["booked", "interviewed"]))), sub: "Đã book + đã đến PV") }
                            Button { status = "trial"; tab = "list" } label: { StatCard(icon: "checkmark.circle.fill", tint: .good, label: "Đã tuyển", value: Fmt.int(Double(count(["passed", "trial"]))), sub: "Pass PV + thử việc") }
                        }.buttonStyle(.plain)
                    }
                    if tab == "positions" {
                        Panel { Text("Vị trí tuyển dụng").font(.system(size: 14, weight: .bold)); ForEach(positions, id: \.self) { p in let n = d.candidates.filter { $0.position == p }.count; Button { position = p; tab = "list" } label: { HStack { Text(p).font(.system(size: 12)).foregroundStyle(Color.ink); Spacer(); Text("\(n) ứng viên").font(.system(size: 12, weight: .bold)); Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.inkSoft) }.padding(.vertical, 6).contentShape(.rect) }.buttonStyle(.plain); Divider() } }
                    } else {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 4) { Text("Vị trí tuyển dụng").font(.system(size: 10)).foregroundStyle(Color.inkSoft); Menu { Button("Tất cả vị trí") { position = "" }; ForEach(positions, id: \.self) { p in Button(p) { position = p } } } label: { SelectBox(text: position.isEmpty ? "Tất cả vị trí" : position) } }
                            VStack(alignment: .leading, spacing: 4) { Text("Trạng thái").font(.system(size: 10)).foregroundStyle(Color.inkSoft); Menu { Button("Tất cả") { status = "" }; ForEach(Self.statusOrder, id: \.self) { s in Button(d.statusLabels[s] ?? s) { status = s } } } label: { SelectBox(text: status.isEmpty ? "Tất cả" : (d.statusLabels[status] ?? status)) } }
                        }
                        HStack(spacing: 8) {
                            HStack(spacing: 6) { Image(systemName: "magnifyingglass").font(.system(size: 11)).foregroundStyle(Color.inkSoft); TextField("Tìm theo tên, SĐT, email…", text: $q).font(.system(size: 12)) }.padding(.horizontal, 10).padding(.vertical, 9).background(Color.card, in: .rect(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.black.opacity(0.1)))
                            Button { sort = sort == "new" ? "name" : "new" } label: { HStack(spacing: 4) { Image(systemName: "arrow.up.arrow.down").font(.system(size: 10)); Text(sort == "new" ? "Mới nhất" : "Tên A–Z").font(.system(size: 11, weight: .semibold)) }.foregroundStyle(Color.ink).padding(.horizontal, 10).padding(.vertical, 9).background(Color.card, in: .rect(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.black.opacity(0.1))) }.buttonStyle(.plain)
                        }
                        SectionHead(title: "Danh sách ứng viên", action: "\(rows.count) người")
                        VStack(spacing: 10) {
                            ForEach(rows.prefix(80)) { c in
                                NavigationLink { CandidateView(id: c.id, labels: d.statusLabels).brandNav() } label: {
                                    HStack(spacing: 10) {
                                        Avatar(name: c.name, size: 42, tint: Self.tone(c.status).color)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(c.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                                            Text(c.position?.isEmpty == false ? c.position! : "Chưa ghi vị trí").font(.system(size: 11)).foregroundStyle(Color.inkSoft).lineLimit(1)
                                            Text("Ứng tuyển: \(c.receivedOn?.isEmpty == false ? c.receivedOn! : Fmt.day(c.firstSeenAt))").font(.system(size: 10)).foregroundStyle(Color.inkSoft)
                                        }
                                        Spacer()
                                        VStack(alignment: .trailing, spacing: 4) {
                                            Tag(text: d.statusLabels[c.status] ?? c.status, tone: Self.tone(c.status))
                                            Text("Cập nhật \(ago(c.updatedAt))").font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                                            if c.cvViewable == true { HStack(spacing: 3) { Image(systemName: "doc.fill").font(.system(size: 8)); Text("Có CV") }.font(.system(size: 9, weight: .semibold)).foregroundStyle(Color.brand) }
                                        }
                                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.inkSoft)
                                    }.padding(12).background(Color.card, in: .rect(cornerRadius: 14)).cardShadow()
                                }.buttonStyle(.plain)
                            }
                            if rows.isEmpty { Panel { Text("Không có ứng viên khớp bộ lọc.").font(.system(size: 12)).foregroundStyle(Color.inkSoft) } }
                        }
                        if let s = d.sources?.first, let u = URL(string: "https://docs.google.com/spreadsheets/d/\(s.fileId)") {
                            Link(destination: u) { HStack(spacing: 8) { Image(systemName: "plus"); Text("Thêm ứng viên mới (mở Google Sheet)") }.font(.system(size: 13, weight: .bold)).foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 13).background(Color.brandDeep, in: .rect(cornerRadius: 12)) }
                        }
                    }
                } else if error == nil { SkeletonGrid(tiles: 4); Skeleton(height: 200) }
            }.padding(16)
        }
        .navigationTitle("Tuyển dụng").navigationBarTitleDisplayMode(.inline).brandNav()
        .refreshable { await load() }
        .task { await load() }
    }
    private func ago(_ iso: String) -> String { guard let d = Fmt.parseISO(iso) else { return "—" }; let m = Int(Date.now.timeIntervalSince(d) / 60); return m < 60 ? "\(max(1, m)) phút trước" : m < 1440 ? "\(m / 60) giờ trước" : "\(m / 1440) ngày trước" }
    @MainActor private func load() async { do { data = try await API.recruit(); error = nil } catch { self.error = error.localizedDescription } }
}

struct CandidateView: View {
    let id: String; let labels: [String: String]
    @State private var d: API.CandidateDetail?
    @State private var error: String?
    @State private var showCv = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let error { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
                if let d {
                    let c = d.candidate
                    Panel {
                        HStack(spacing: 12) {
                            Avatar(name: c.name, size: 56, tint: RecruitView.tone(c.status).color)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(c.name).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.ink)
                                Text([c.position, c.team, c.birthYear.map { "sinh \($0)" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 11)).foregroundStyle(Color.inkSoft)
                                Tag(text: labels[c.status] ?? c.status, tone: RecruitView.tone(c.status))
                            }
                            Spacer()
                        }
                        HStack(spacing: 8) {
                            if let p = c.phone, !p.isEmpty, let u = URL(string: "tel:\(p.filter(\.isNumber))") { Link(destination: u) { ActionPill(icon: "phone.fill", text: "Gọi", tint: .good) } }
                            if d.cv?.viewable == true { Button { showCv = true } label: { ActionPill(icon: "doc.text.fill", text: "Xem CV", tint: .brand) }.buttonStyle(.plain) }
                            else if let u = c.cvUrl.flatMap(URL.init) { Link(destination: u) { ActionPill(icon: "link", text: "Link CV", tint: .brand) } }
                        }.padding(.top, 8)
                    }
                    Panel {
                        Text("Thông tin trên sheet").font(.system(size: 13, weight: .bold))
                        if let h = c.handler, !h.isEmpty { InfoRow(k: "Người phụ trách", v: h) }
                        if let r = c.receivedOn, !r.isEmpty { InfoRow(k: "Ngày nhận", v: r) }
                        if let p = c.phone, !p.isEmpty { InfoRow(k: "SĐT", v: p) }
                        ForEach(c.data.keys.sorted(), id: \.self) { k in if let v = c.data[k], !v.isEmpty, v.count < 400 { InfoRow(k: k, v: v) } }
                        InfoRow(k: "Nguồn", v: "\(c.fileName) › \(c.tab) · dòng \(c.rowNum)")
                    }
                    if !d.events.isEmpty {
                        Panel {
                            Text("Lịch sử cập nhật").font(.system(size: 13, weight: .bold))
                            ForEach(Array(d.events.enumerated()), id: \.element.id) { i, e in
                                HStack(alignment: .top, spacing: 10) {
                                    VStack(spacing: 0) { Circle().fill(e.kind == "new" ? Color.good : e.kind == "delete" ? Color.bad : Color.blue).frame(width: 9, height: 9).padding(.top, 4); if i < d.events.count - 1 { Rectangle().fill(Color.black.opacity(0.08)).frame(width: 2).frame(maxHeight: .infinity) } }
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(e.kind == "new" ? "Ứng viên mới" : e.kind == "delete" ? "Bị xóa khỏi sheet" : e.kind == "cv" ? "Có CV" : "Cập nhật").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink)
                                        ForEach(Array(e.changes.enumerated()), id: \.offset) { _, ch in Text("\(ch.field ?? ""): \(ch.from ?? "—") → \(ch.to ?? "—")").font(.system(size: 10)).foregroundStyle(Color.inkSoft) }
                                        Text(Fmt.dateTime(e.createdAt)).font(.system(size: 9)).foregroundStyle(Color.inkSoft)
                                    }.padding(.bottom, 8)
                                }
                            }
                        }
                    }
                } else if error == nil { Skeleton(height: 120); Skeleton(height: 200) }
            }.padding(16)
        }
        .navigationTitle("Ứng viên").navigationBarTitleDisplayMode(.inline).brandNav()
        .sheet(isPresented: $showCv) {
            NavigationStack {
                WebView(url: URL(string: "/api/recruit/cv?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)", relativeTo: API.base)!)
                    .navigationTitle(d?.cv?.name ?? "CV").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { showCv = false } } }
            }
        }
        .task { do { d = try await API.candidate(id: id) } catch { self.error = error.localizedDescription } }
    }
}
struct InfoRow: View { let k: String; let v: String; var body: some View { HStack(alignment: .top) { Text(k).font(.system(size: 11)).foregroundStyle(Color.inkSoft).frame(width: 110, alignment: .leading); Text(v).font(.system(size: 11)).foregroundStyle(Color.ink).textSelection(.enabled); Spacer() }.padding(.vertical, 3) } }
