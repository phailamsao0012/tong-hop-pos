import SwiftUI

/// Tuyển dụng: ứng viên từ 4 file Google Sheets; lọc theo trạng thái, tìm tên/SĐT/vị trí; chi tiết có CV xem ngay trong app.
struct RecruitView: View {
    @State private var data: API.RecruitList?
    @State private var error: String?
    @State private var status = ""
    @State private var q = ""
    static let statusOrder = ["new", "review", "booked", "interviewed", "passed", "trial", "failed", "rejected"]
    static func tint(_ s: String) -> Color {
        switch s { case "new": return .blue; case "review", "booked": return .orange; case "interviewed": return .purple; case "passed", "trial": return .good; case "failed", "rejected": return .bad; default: return .gray }
    }
    private var rows: [API.Candidate] {
        let t = q.trimmingCharacters(in: .whitespaces).lowercased()
        return (data?.candidates ?? []).filter { c in
            (status.isEmpty || c.status == status) &&
            (t.isEmpty || c.name.lowercased().contains(t) || (c.phone ?? "").contains(t) || (c.position ?? "").lowercased().contains(t) || (c.handler ?? "").lowercased().contains(t))
        }
    }
    var body: some View {
        List {
            if let error, data == nil { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if let d = data {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Chip(label: "Tất cả · \(d.candidates.count)", on: status.isEmpty) { status = "" }
                            ForEach(Self.statusOrder, id: \.self) { s in
                                let n = d.candidates.filter { $0.status == s }.count
                                if n > 0 { Chip(label: "\(d.statusLabels[s] ?? s) · \(n)", on: status == s) { status = status == s ? "" : s } }
                            }
                        }
                    }.listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 0)).listRowBackground(Color.clear)
                }
                Section("\(rows.count) ứng viên") {
                    ForEach(rows) { c in
                        NavigationLink { CandidateView(id: c.id, labels: d.statusLabels) } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(c.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                                    if c.cvViewable == true { Image(systemName: "doc.fill").font(.caption2).foregroundStyle(Color.brand) }
                                    Spacer()
                                    Text(d.statusLabels[c.status] ?? c.status).font(.caption2.weight(.semibold)).foregroundStyle(Self.tint(c.status)).padding(.horizontal, 6).padding(.vertical, 2).background(Self.tint(c.status).opacity(0.12), in: .capsule)
                                }
                                Text([c.position, c.team, c.handler.map { "PT: \($0)" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                Text("\(c.fileName) › \(c.tab) · cập nhật \(Fmt.dateTime(c.updatedAt))").font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
                            }
                        }
                    }
                }
            } else if error == nil { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
        }
        .navigationTitle("Tuyển dụng")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $q, prompt: "Tên, SĐT, vị trí, người phụ trách")
        .refreshable { await load() }
        .task { await load() }
    }
    @MainActor private func load() async { do { data = try await API.recruit(); error = nil } catch { self.error = error.localizedDescription } }
}

struct CandidateView: View {
    let id: String; let labels: [String: String]
    @State private var d: API.CandidateDetail?
    @State private var error: String?
    @State private var showCv = false
    var body: some View {
        List {
            if let error { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(Color.bad) }
            if let d {
                let c = d.candidate
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.name).font(.title3.weight(.bold))
                        Text([c.position, c.team, c.birthYear.map { "sinh \($0)" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                        Text(labels[c.status] ?? c.status).font(.caption.weight(.semibold)).foregroundStyle(RecruitView.tint(c.status))
                    }
                    if let p = c.phone, !p.isEmpty, let u = URL(string: "tel:\(p.filter(\.isNumber))") { Link(destination: u) { Label("Gọi \(p)", systemImage: "phone.fill") } }
                    if d.cv?.viewable == true {
                        Button { showCv = true } label: { Label("Xem CV · \(d.cv?.name ?? "PDF")", systemImage: "doc.text.fill") }
                    } else if let u = c.cvUrl.flatMap(URL.init) { Link(destination: u) { Label("Mở link CV", systemImage: "link") } }
                }
                Section("Thông tin trên sheet") {
                    if let h = c.handler, !h.isEmpty { row("Người phụ trách", h) }
                    if let r = c.receivedOn, !r.isEmpty { row("Ngày nhận", r) }
                    ForEach(c.data.keys.sorted(), id: \.self) { k in
                        if let v = c.data[k], !v.isEmpty, v.count < 400 { row(k, v) }
                    }
                    row("Nguồn", "\(c.fileName) › \(c.tab) · dòng \(c.rowNum)")
                }
                if !d.events.isEmpty {
                    Section("Lịch sử cập nhật") {
                        ForEach(d.events) { e in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.kind == "new" ? "Ứng viên mới" : e.kind == "delete" ? "Bị xóa khỏi sheet" : e.kind == "cv" ? "Có CV" : "Cập nhật").font(.subheadline.weight(.semibold))
                                ForEach(Array(e.changes.enumerated()), id: \.offset) { _, ch in
                                    Text("\(ch.field ?? ""): \(ch.from ?? "—") → \(ch.to ?? "—")").font(.caption).foregroundStyle(.secondary)
                                }
                                Text(Fmt.dateTime(e.createdAt)).font(.caption2).foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
            } else if error == nil { ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear) }
        }
        .navigationTitle("Ứng viên")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showCv) {
            NavigationStack {
                WebView(url: URL(string: "/api/recruit/cv?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)", relativeTo: API.base)!)
                    .navigationTitle(d?.cv?.name ?? "CV").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Đóng") { showCv = false } } }
            }
        }
        .task { do { d = try await API.candidate(id: id) } catch { self.error = error.localizedDescription } }
    }
    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .firstTextBaseline) { Text(k).foregroundStyle(.secondary); Spacer(); Text(v).multilineTextAlignment(.trailing) }.font(.subheadline)
    }
}
