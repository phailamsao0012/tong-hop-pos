#if DEBUG
import Foundation

/// I2: mẫu cố định, chỉ dữ liệu giả; chạy trước giao diện và mạng.
enum DecodeSelfTest {
    static func runAndExit() -> Never {
        var r = Run()
        table(&r)
        compare(&r)
        teams(&r)
        paths(&r)
        marketingRank(&r)
        emit(r.failed == 0 ? "DECODE_TEST OK \(r.total) cases" : "DECODE_TEST FAILED \(r.failed)/\(r.total)")
        exit(r.failed == 0 ? 0 : 1)
    }
    private struct Run {
        var total = 0
        var failed = 0
        mutating func check(_ code: String, _ ok: Bool) {
            total += 1
            if !ok { failed += 1; emit("DECODE_TEST FAIL \(code)") }
        }
        mutating func decode<T: Decodable>(_ code: String, _ type: T.Type, _ json: String) -> T? {
            do {
                let value = try JSONDecoder().decode(type, from: Data(json.utf8))
                check(code, true)
                return value
            } catch {
                // Không in JSON hay lỗi giải mã (có thể chứa giá trị); chỉ mã ca thử.
                check(code, false)
                return nil
            }
        }
    }
    private static func marketingRank(_ r: inout Run) {
        let fields = API.MarketingRankRow.fields.map { "\"\($0)\":12" }.joined(separator: ",")
        let person = "\"marketerId\":\"m-a\",\"marketerName\":\"NV A\",\"marketingTeamName\":\"Team A\""
        let team = "\"marketingTeamId\":\"team-a\",\"marketingTeamName\":\"Team A\",\"marketerCount\":2"
        let full = "{\(fields)}"
        let json = "{\"summary\":\(full),\"byMarketer\":[{\(person),\(fields)}],\"byTeam\":[{\(team),\(fields)}],\"definitions\":{\"scope\":\"Số giả\"}}"
        if let d = r.decode("MKTR_FULL", API.MarketingRankReport.self, json) {
            r.check("MKTR_FIELDS", API.MarketingRankRow.fields.allSatisfy { d.summary.values[$0] == 12 && d.byMarketer.first?.values[$0] == 12 && d.byTeam.first?.values[$0] == 12 })
            r.check("MKTR_IDS", d.byMarketer.first?.id == "m-a" && d.byTeam.first?.id == "team-a" && d.byTeam.first?.marketerCount == 2)
            r.check("MKTR_RETURNED", MarketingRankSort.returned.value(d.summary) == 24)
        }
        let sparse = "{\"summary\":{},\"byMarketer\":[{\(person)}],\"byTeam\":[{\(team)}],\"definitions\":{}}"
        if let d = r.decode("MKTR_MISSING", API.MarketingRankReport.self, sparse) {
            r.check("MKTR_DEFAULTS", API.MarketingRankRow.fields.filter { $0 != "confirmationRate" && $0 != "deliveryRate" }.allSatisfy { d.summary.values[$0] == 0 })
            r.check("MKTR_RATES", d.summary.values["confirmationRate"] == nil && d.summary.values["deliveryRate"] == nil)
        }
        let ignored = String(sparse.dropLast()) + ",\"recentOrders\":{\"unexpected\":[true]},\"marketerOptions\":false}"
        _ = r.decode("MKTR_IGNORE_ORDERS", API.MarketingRankReport.self, ignored)
        if let row = r.decode("MKTR_NULL", API.MarketingRankRow.self, #"{"net":null,"confirmationRate":null,"deliveryRate":null,"marketerCount":null}"#) {
            r.check("MKTR_NULL_DEFAULTS", row.n("net") == 0 && row.marketerCount == 0 && row.values["confirmationRate"] == nil && row.values["deliveryRate"] == nil)
        }
        let path = API.marketingRankPath(start: "2026-10-01", end: "2026-10-12", pos: "pos-a", team: "__unassigned")
        r.check("MKTR_PATH", path.contains("posIds=pos-a&basis=confirmed&stage=confirmed&marketingTeamId=__unassigned") && !path.contains("marketerId="))
        r.check("MKTR_ALL", API.marketingRankPath(start: "a", end: "b", pos: "", team: nil).hasSuffix("marketingTeamId=__all"))
    }
    private static func emit(_ value: String) {
        FileHandle.standardOutput.write(Data((value + "\n").utf8))
    }

    private static let metrics = #"""
    "created":30,"createdClosed":12,"closed":12,"closedNet":30,
    "closeRate":null,"aov":null,"waiting":1
    """#
    private static let w1 = #"""
    "packed":10,"confirmedNotPacked":2,"cancelledBeforePack":0,"packedRate":null,
    "closedFromCreated":12,"closedFromEarlier":0,"createdOpen":30
    """#
    private static func table(_ r: inout Run) {
        // Hai giờ khác nhau để bắt trường bị đảo; khóa lạ vẫn được bỏ qua.
        let order = #"""
        {"id":"order-a","source_order_id":"12","pos_id":"pos-a","posName":"POS A",
        "created_at":"2026-10-01T01:00:00Z","first_confirmed_at":"2026-10-01T02:00:00Z",
        "confirmed_at":"2026-10-01T03:00:00Z","confirm_by_name":"NV A","net":30,
        "products":["SP A"],"extra":{"ignored":true}}
        """#
        for newer in [false, true] {
            let extra = newer ? "," + w1 : ""
            let total = ",\"staffTotal\":{\"people\":1," + metrics + extra + "}"
            let json = """
            {"period":{"start":"2026-10-01","end":"2026-10-12"},"team":"sale",
            "staff":[{"sellerId":"staff-a","name":"NV A","department":null,\(metrics)\(extra)}],
            "definitions":{"packed":"Đang đóng hàng","closed":"Đơn chốt","rate":"Tỷ lệ"},
            "orders":\(newer ? "[" + order + "]" : "null")\(total),"total":{"closed":30}}
            """
            let code = newer ? "PG_W1" : "PG_OLD"
            guard let t = r.decode(code, API.StaffTable.self, json), let s = t.staff.first else { continue }
            r.check(code + "_PERIOD", t.period.start == "2026-10-01" && t.period.end == "2026-10-12" && t.team == "sale")
            r.check(code + "_IDENTITY", s.sellerId == "staff-a" && s.id == "staff-a" && s.name == "NV A" && s.department == nil)
            r.check(code + "_NUMBERS", s.created == 30 && s.createdClosed == 12 && s.closed == 12 && s.closedNet == 30)
            r.check(code + "_CONFIRMED", s.waiting == 1)
            r.check(code + "_NULL", s.closeRate == nil && s.aov == nil && s.packedRate == nil)
            r.check(code + "_DEFINITIONS", t.definitions.packed == "Đang đóng hàng" && t.definitions.closed == "Đơn chốt" && t.definitions.rate == "Tỷ lệ")
            if newer {
                r.check(code + "_EXTRA", s.packed == 10 && s.confirmedNotPacked == 2 && s.cancelledBeforePack == 0 && s.packedRate == nil && s.closedFromCreated == 12 && s.closedFromEarlier == 0 && s.createdOpen == 30)
                r.check(code + "_SUM", t.staffTotal?.people == 1 && t.staffTotal?.closed == 12 && t.staffTotal?.created == 30 && t.staffTotal?.closedNet == 30)
                r.check(code + "_SUM_EXTRA", t.staffTotal?.packed == 10 && t.staffTotal?.confirmedNotPacked == 2 && t.staffTotal?.cancelledBeforePack == 0 && t.staffTotal?.packedRate == nil && t.staffTotal?.closedFromCreated == 12 && t.staffTotal?.closedFromEarlier == 0 && t.staffTotal?.createdOpen == 30)
                r.check(code + "_ORDERS", t.orders?.count == 1)
                if let o = t.orders?.first {
                    r.check("ORDER_ID", o.id == "order-a" && o.orderCode == "12" && o.posId == "pos-a" && o.posName == "POS A")
                    r.check("ORDER_CREATED", o.createdAt == "2026-10-01T01:00:00Z")
                    r.check("ORDER_CLOSED", o.closedAt == "2026-10-01T02:00:00Z")
                    r.check("ORDER_DETAILS", o.net == 30 && o.products == ["SP A"])
                }
            } else {
                r.check(code + "_SUM_MISSING_PACKED", t.staffTotal != nil && t.staffTotal?.packed == nil && t.staffTotal?.confirmedNotPacked == nil && t.staffTotal?.cancelledBeforePack == nil && t.staffTotal?.packedRate == nil && t.orders == nil)
                r.check(code + "_NO_EXTRA", s.packed == nil && s.confirmedNotPacked == nil && s.cancelledBeforePack == nil && s.packedRate == nil && s.closedFromCreated == nil && s.closedFromEarlier == nil && s.createdOpen == nil)
            }
        }
        let nullableOrder = #"""
        {"id":"order-b","source_order_id":"30","pos_id":"pos-a","posName":"POS A",
        "created_at":null,"first_confirmed_at":null,"confirmed_at":null,"confirm_by_name":null,"net":null,"products":[]}
        """#
        if let o = r.decode("ORDER_NULL", API.PGOrder.self, nullableOrder) {
            r.check("ORDER_NULL_VALUES", o.createdAt == nil && o.closedAt == nil && o.net == nil && o.products.isEmpty)
        }
        if let s = r.decode("PG_PACKED_RATE", API.StaffRow.self, """
        {"sellerId":"staff-a","name":"NV A",\(metrics),"packed":10,
        "confirmedNotPacked":2,"cancelledBeforePack":0,"packedRate":83.25}
        """) {
            r.check("PG_PACKED_RATE_VALUE", s.packed == 10 && s.confirmedNotPacked == 2 && s.cancelledBeforePack == 0 && s.packedRate == 83.25)
        }
        if let d = r.decode("PG_MISSING_DEFINITION", API.StaffDefinitions.self, #"{"closed":"Đơn chốt","rate":"Tỷ lệ"}"#) {
            r.check("PG_MISSING_DEFINITION_NIL", d.packed == nil)
        }
        // Các số tùy chọn bị thiếu cũng là nil, không mặc định thành 0.
        if let s = r.decode("PG_MISSING_RATES", API.StaffRow.self, """
        {"sellerId":"staff-a","name":"NV A","created":0,"createdClosed":0,"closed":0,"closedNet":0,
        "waiting":0}
        """) {
            r.check("PG_MISSING_VALUES", s.department == nil && s.closeRate == nil && s.packedRate == nil && s.packed == nil && s.confirmedNotPacked == nil && s.cancelledBeforePack == nil && s.aov == nil)
        }
    }

    private static let cell = #"{"closed":12,"closedNet":30,"created":30,"createdClosed":12,"closeRate":null}"#
    private static let series = #"{"current":[[12,30,30,12],[],[12]],"previous":[[0,0,0,0]]}"#
    private static let rate = #"{"current":[12,null,30],"previous":[null]}"#
    private static let chart = #"""
    {"len":3,"current":[{"closed":12,"closedNet":30,"closeRate":null,"cumClosed":30,"cumClosedNet":12},null,null],
    "previous":[{"closed":30,"closedNet":12,"closeRate":12,"cumClosed":12,"cumClosedNet":30},null,null]}
    """#
    private static func compare(_ r: inout Run) {
        // W2 và W5 độc lập: kiểm đủ bốn tổ hợp, không buộc máy chủ triển khai cùng lúc.
        for w2 in [false, true] {
            for w5 in [false, true] {
                let code = "CMP_\(w2 ? 1 : 0)_\(w5 ? 1 : 0)"
                let rateField = w2 ? ",\"seriesRate\":" + rate : ""
                let chartField = w5 ? ",\"chart\":" + chart : ""
                let totals = w2 ? ",\"rowsTotal\":{\"current\":" + cell + ",\"previous\":" + cell + ",\"series\":" + series + rateField + "}" : ""
                let json = """
                {"mode":"previous","step":1,"bucket":"hour","group":1,
                "period":{"start":"2026-10-12","end":"2026-10-12"},
                "compare":{"start":"2026-10-11","end":"2026-10-11","cutoff":\(w2 ? "\"12:30\"" : "null")},
                "current":{"total":\(cell)},"previous":{"total":\(cell)},
                "staff":[{"sellerId":"staff-a","current":\(cell),"previous":\(cell),"series":\(series)\(rateField)\(chartField)}]\(totals)\(chartField)}
                """
                guard let c = r.decode(code, API.StaffCompare.self, json), let s = c.staff.first else { continue }
                r.check(code + "_META", c.mode == "previous" && c.step == 1 && c.bucket == "hour" && c.group == 1)
                r.check(code + "_PERIOD", c.period.start == "2026-10-12" && c.compare.end == "2026-10-11")
                r.check(code + "_CUTOFF", c.compare.cutoff == (w2 ? "12:30" : nil))
                r.check(code + "_TOTALS", c.current.total.closed == 12 && c.previous.total.closedNet == 30 && c.current.total.created == 30 && c.previous.total.createdClosed == 12 && c.current.total.closeRate == nil)
                r.check(code + "_STAFF", s.id == "staff-a" && s.current.closed == 12 && s.previous.closedNet == 30 && s.current.closeRate == nil)
                r.check(code + "_SERIES", s.series.current == [[12,30,30,12],[],[12]] && s.series.previous == [[0,0,0,0]])
                r.check(code + "_RATE", w2 ? s.seriesRate?.current == [12,nil,30] && s.seriesRate?.previous == [nil] : s.seriesRate == nil)
                r.check(code + "_ROWS", w2 ? c.rowsTotal?.current.closed == 12 && c.rowsTotal?.previous.created == 30 && c.rowsTotal?.series.current == [[12,30,30,12],[],[12]] && c.rowsTotal?.seriesRate?.current == [12,nil,30] : c.rowsTotal == nil)
                r.check(code + "_CHART_PRESENT", (c.chart != nil) == w5 && (s.chart != nil) == w5)
                if w5 {
                    for (index, ch) in [c.chart, s.chart].enumerated() {
                        r.check(code + "_CHART_LEN_\(index)", ch?.len == 3 && ch?.current.count == 3 && ch?.previous.count == 3)
                        r.check(code + "_CHART_NULL_\(index)", ch?.current[1] == nil && ch?.current[2] == nil && ch?.previous[1] == nil)
                        r.check(code + "_POINT_\(index)", ch?.current[0]?.closed == 12 && ch?.current[0]?.closedNet == 30 && ch?.current[0]?.closeRate == nil && ch?.current[0]?.cumClosed == 30 && ch?.current[0]?.cumClosedNet == 12)
                        r.check(code + "_PREV_POINT_\(index)", ch?.previous[0]?.closed == 30 && ch?.previous[0]?.closedNet == 12 && ch?.previous[0]?.closeRate == 12 && ch?.previous[0]?.cumClosed == 12 && ch?.previous[0]?.cumClosedNet == 30)
                    }
                }
            }
        }
        if let c = r.decode("CMP_EXPLICIT_NULL", API.CmpStaff.self, """
        {"sellerId":"staff-a","current":\(cell),"previous":\(cell),"series":\(series),"seriesRate":null,"chart":null}
        """) {
            r.check("CMP_EXPLICIT_NULL_VALUES", c.chart == nil && c.seriesRate == nil)
        }
    }
    private static func teams(_ r: inout Run) {
        if let list = r.decode("TEAMS", API.HrTeamList.self, #"""
        {"teams":[{"id":"team-a","name":"Team A","office":null,"dept":"sale","people":12,"mentor":null},
        {"id":"team-b","name":"Team B","office":"CN A","dept":"cskh","people":30,"mentor":"NV A"}]}
        """#) {
            r.check("TEAMS_COUNT", list.teams.count == 2)
            if list.teams.count == 2 {
                r.check("TEAMS_NULL", list.teams[0].office == nil && list.teams[0].mentor == nil)
                r.check("TEAMS_FIRST", list.teams[0].id == "team-a" && list.teams[0].name == "Team A" && list.teams[0].dept == "sale" && list.teams[0].people == 12)
                r.check("TEAMS_SECOND", list.teams[1].office == "CN A" && list.teams[1].mentor == "NV A" && list.teams[1].dept == "cskh" && list.teams[1].people == 30)
            }
        }
        if let list = r.decode("TEAMS_EMPTY", API.HrTeamList.self, #"{"teams":[]}"#) {
            r.check("TEAMS_EMPTY_COUNT", list.teams.isEmpty)
        }
    }

    private static func paths(_ r: inout Run) {
        let posCases: [([String], String)] = [([], ""), (["pos-a"], "pos-a"), (["pos-a","pos-b"], "pos-a,pos-b")]
        for (p, pos) in posCases {
            for (team, by) in [("sale","seller"), ("cskh","care")] {
                for hr in [nil, "team-a"] as [String?] {
                    let suffix = hr == nil ? "" : "&hrTeam=team-a"
                    let expected = "/api/reports/product-groups?start=2026-10-01&end=2026-10-12&posIds=\(pos)&team=\(team)&dim=tag&basis=both&by=\(by)" + suffix
                    r.check("PATH_TABLE", API.staffTablePath(start: "2026-10-01", end: "2026-10-12", posIds: p, team: team, by: by, hrTeam: hr) == expected)
                    for packed in [false, true] {
                        let q = StaffOrderQuery(team: team, by: by, start: "2026-10-01", end: "2026-10-12", posIds: p, staffId: "staff-a", packed: packed, hrTeam: hr, title: "Đơn chốt")
                        r.check("PATH_ORDERS", API.staffOrdersPath(q) == expected + "&staffId=staff-a" + (packed ? "&packed=1" : ""))
                        r.check("QUERY_HASH", Set([q, q]).count == 1)
                    }
                    for (mode, levels) in [("previous",[1,2,3,4]), ("weekday",[1,2,3,4,8]), ("monthday",[1,2,3,6,12]), ("year",[1,2]), ("custom",[1])] {
                        let prefix = "/api/reports/staff-compare?start=2026-10-01&end=2026-10-12&posIds=\(pos)&team=\(team)&by=\(by)&mode=\(mode)"
                        for step in levels {
                            let range = mode == "custom" ? "&cstart=2026-09-01&cend=2026-09-12" : "&step=\(step)"
                            r.check("PATH_COMPARE", API.staffComparePath(start: "2026-10-01", end: "2026-10-12", posIds: p, team: team, by: by, mode: mode, step: step, cstart: "2026-09-01", cend: "2026-09-12", hrTeam: hr) == prefix + range + suffix)
                        }
                        if mode != "custom" {
                            r.check("PATH_INVALID_STEP", API.staffComparePath(start: "2026-10-01", end: "2026-10-12", posIds: p, team: team, by: by, mode: mode, step: 30, hrTeam: hr) == prefix + "&step=1" + suffix)
                        }
                    }
                }
            }
        }
        r.check("PATH_EMPTY_TEAM", API.staffTablePath(start: "2026-10-01", end: "2026-10-12", posIds: [], team: "sale", by: "seller", hrTeam: "") == "/api/reports/product-groups?start=2026-10-01&end=2026-10-12&posIds=&team=sale&dim=tag&basis=both&by=seller")
        let encoded = StaffOrderQuery(team: "sale", by: "seller", start: "2026-10-01", end: "2026-10-12", posIds: ["pos&a", "pos+b"], staffId: "staff=a&b#c", packed: true, hrTeam: "team a&b", title: "Đơn chốt")
        r.check("PATH_ENCODE", API.staffOrdersPath(encoded) == "/api/reports/product-groups?start=2026-10-01&end=2026-10-12&posIds=pos%26a,pos%2Bb&team=sale&dim=tag&basis=both&by=seller&hrTeam=team%20a%26b&staffId=staff%3Da%26b%23c&packed=1")
        r.check("PATH_CUSTOM_NO_DATES", API.staffComparePath(start: "2026-10-01", end: "2026-10-12", posIds: [], team: "sale", by: "seller", mode: "custom", step: 30) == "/api/reports/staff-compare?start=2026-10-01&end=2026-10-12&posIds=&team=sale&by=seller&mode=custom&cstart=&cend=")
    }
}
#endif
