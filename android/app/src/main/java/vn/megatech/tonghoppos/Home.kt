package vn.megatech.tonghoppos

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import androidx.compose.material.icons.automirrored.filled.List
import kotlinx.coroutines.coroutineScope

val STATUS_ITEMS = listOf(Triple("new", "Mới / chờ XN", C.gray), Triple("confirmed", "Đã xác nhận", C.brand), Triple("shipping", "Đang giao", C.blue), Triple("delivered", "Đã nhận", C.good), Triple("returned", "Hoàn", C.warn), Triple("cancelled", "Hủy", C.bad))

/** Mọi số liệu Trang chủ của một bộ lọc. */
class HomeData(val today: J?, val week: J?, val badge: J?, val trend: J?, val shift: J?, val pipeline: J?, val targets: J?, val repurchase: J?, val batches: J?, val customers: J?)

@Composable fun HomeTab() {
    val nav = LocalNav.current
    var period by remember { mutableStateOf<Period>(Period.Today) }
    var team by remember { mutableStateOf("all") }
    var pos by remember { mutableStateOf("") }
    var product by remember { mutableStateOf("all") }
    val posIds = if (pos.isEmpty()) emptyList() else listOf(pos)
    val (a, b) = period.range
    val d = load(period.key, team, pos, product) {
        val today = VNDate.today().toString()
        coroutineScope {
            val o = async { Api.overview(a, b, posIds, team = team, product = product) }
            val w = async { runCatching { Api.overview(VNDate.add(-6).toString(), today, posIds, team = team, compare = "none", product = product) }.getOrNull() }
            val bd = async { runCatching { Api.cskhBadge() }.getOrNull() }
            val tr = async { runCatching { Api.overview(VNDate.add(-29).toString(), today, posIds, team = team, compare = "none", product = product) }.getOrNull() }
            val sh = async { runCatching { Api.shift(today, "auto", posIds, team) }.getOrNull() }
            val pl = async { runCatching { Api.pipeline(a, b, "confirmed", posIds, team, product) }.getOrNull() }
            val tg = async { runCatching { Api.targets(b.take(7)) }.getOrNull() }
            val rp = async { runCatching { Api.repurchase(a, b, "", posIds, team, product) }.getOrNull() }
            val bt = async { runCatching { Api.batches(a, b, posIds, team) }.getOrNull() }
            val cu = async { runCatching { Api.customers("", "spend", "", 1, 1) }.getOrNull() }
            HomeData(o.await(), w.await(), bd.await(), tr.await(), sh.await(), pl.await(), tg.await(), rp.await(), bt.await(), cu.await())
        }
    }
    fun q(group: String, basis: String, title: String, ids: List<String> = posIds) = Screen.Orders(OrderQuery(a, b, ids, group, basis = basis, title = title, team = team, product = product))
    TabPage(refreshing = d.loading && d.data != null, onRefresh = { d.reload() }) {
        PageTitle("Điều khiển trung tâm", "Tổng quan hoạt động toàn hệ thống · ${period.label}") { PeriodMenu(period) { period = it } }
        Segmented(team, listOf("all" to "Tất cả", "sale" to "Sale", "cskh" to "CSKH")) { team = it }
        PosChipRow(pos) { pos = it ?: "" }
        ChipRow {
            T("Thẻ", 10.sp, FontWeight.Bold, C.inkSoft)
            Chip("Tất cả", product == "all") { product = "all" }; Chip("Gentadox", product == "gentadox") { product = "gentadox" }; Chip("SK + GK", product == "skgk") { product = "skgk" }
        }
        ErrorLine(d.error.takeIf { d.data == null })
        val data = d.data
        val t = data?.today?.get("current")?.get("total")
        // Ô POS
        val totalNet = data?.today?.get("current")?.get("byPos")?.list?.sumOf { it["closedNet"].d } ?: 0.0
        val weekSeries = data?.week?.get("current")?.get("series")?.list
        GridN(2, Pos.order.filter { pos.isEmpty() || it == pos }.map { id ->
            { m: Modifier ->
                val p = Sync.pos.firstOrNull { it["posId"].s == id }
                val st = when { p == null -> C.gray to "Đang kiểm tra"; p["lastError"].sn != null -> C.bad to "Ngoại tuyến"; Sync.age(p) > 15 -> C.warn to "Tạm chậm"; else -> C.good to "Hoạt động" }
                val row = data?.today?.get("current")?.get("byPos")?.list?.firstOrNull { it["posId"].s == id }
                val prev = data?.today?.get("compare")?.get("byPos")?.list?.firstOrNull { it["posId"].s == id }
                val spark = weekSeries?.filter { it["posId"].s == id }?.let { byDay(it, "closedNet").map { x -> x.second } }
                PosTile(id, row, prev, totalNet, spark, st, data == null, m) { nav.push(Screen.Overview(id)) }
            }
        }, 10.dp)
        T("Số ${period.title.lowercase()} của từng POS · doanh thu đơn chốt, đơn chốt / đơn tạo, tỷ lệ chốt · chạm để mở Tổng quan POS đó", 9.sp, color = C.inkSoft)
        // Doanh thu kỳ
        if (t != null) {
            Panel(onClick = { nav.push(Screen.Overview(pos.ifEmpty { null })) }) {
                Row {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) { T("Doanh thu ${period.title.lowercase()}", 13.sp, FontWeight.SemiBold); Spacer(Modifier.width(6.dp)); Icon(Icons.Filled.Visibility, null, Modifier.size(14.dp), tint = C.inkSoft) }
                        Rolling(Fmt.vnd(t["closedNet"].d), 22.sp)
                        val dl = Fmt.delta(t["closedNet"].d, data.today["compare"]["total"]["closedNet"].dn)
                        if (dl != null) T("${if (dl.startsWith("-")) "▼" else "▲"} $dl so với ${if (period == Period.Today) "hôm qua" else "kỳ trước"}", 11.sp, FontWeight.SemiBold, if (dl.startsWith("-")) C.bad else C.good)
                        else T("${Fmt.int(t["closedOrders"].d)} đơn chốt · chạm để xem Tổng quan POS", 11.sp, color = C.inkSoft)
                    }
                    val s = data.week?.get("current")?.get("series")?.list
                    if (!s.isNullOrEmpty()) Box(Modifier.width(120.dp)) { LineChart(byDay(s, "closedNet").map { "" to it.second }, C.good, 60.dp) }
                }
            }
            val un = t["groups"]["new"]["orders"].d
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.brandSoft).border(1.dp, C.good.copy(alpha = .25f), RoundedCornerShape(14.dp)).clickable { nav.push(q("unconfirmed", "created", "Chờ xác nhận")) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(C.brandDeep), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Bolt, null, tint = C.lime) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    T(if (period == Period.Today) "Ưu tiên hôm nay" else "Ưu tiên · ${period.title.lowercase()}", 10.sp, FontWeight.SemiBold, C.good)
                    T(if (un > 0) "Cần xử lý ${Fmt.int(un)} đơn chờ xác nhận" else "Không còn đơn chờ xác nhận", 14.sp, FontWeight.Bold)
                    T(if (un > 0) "Vui lòng kiểm tra và xác nhận sớm" else "Đơn tạo trong kỳ đã được xử lý hết", 11.sp, color = C.inkSoft)
                }
                Box(Modifier.size(28.dp).clip(CircleShape).background(C.card), contentAlignment = Alignment.Center) { Icon(Icons.Filled.ChevronRight, null, tint = C.warn) }
            }
        } else if (d.error == null) Thinking()
        if (data != null) CenterBlocks(period, team, pos, product, data)
        // Hành động khẩn cấp (cuối trang)
        val actions = buildList {
            val un = t?.get("groups")?.get("new")?.get("orders")?.d ?: 0.0
            if (un > 0) add(Triple(Icons.Filled.PendingActions to Tone.Red, "${Fmt.int(un)} đơn chờ xác nhận" to "Tạo ${period.title.lowercase()} · Cần xử lý gấp", q("unconfirmed", "created", "Chờ xác nhận") as Screen))
            Sync.pos.filter { it["lastError"].sn != null || Sync.age(it) > 15 }.forEach { p -> add(Triple(Icons.Filled.Warning to Tone.Orange, "${Pos.short(p["posId"].s)} ${if (p["lastError"].sn != null) "lỗi đồng bộ" else "đang chậm"}" to (p["lastError"].sn ?: "Chưa đồng bộ ${Fmt.ago(p["lastSyncAt"].sn)} · Kiểm tra kết nối"), Screen.Page("config"))) }
            val over20 = data?.badge?.get("over20")?.d ?: 0.0
            if (over20 > 0 && Auth.canView("care")) add(Triple(Icons.Filled.PersonOff to Tone.Orange, "${Fmt.int(over20)} khách quá 20 ngày chưa ghi chú" to "CSKH · hôm nay đã ghi ${Fmt.int(data?.badge?.get("callsToday")?.d ?: 0.0)} cuộc gọi", Screen.Page("care")))
        }
        SectionHead("Hành động khẩn cấp", "Xem tất cả", actions.size) { nav.push(Screen.Alerts) }
        if (actions.isEmpty()) Panel { Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.CheckCircle, null, tint = C.good); Spacer(Modifier.width(6.dp)); T("Không có việc khẩn cấp lúc này.", 13.sp, color = C.good) } }
        actions.forEach { (ic, txt, route) ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.card).clickable { nav.push(route) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                IconBox(ic.first, ic.second.color, 36.dp); Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) { T(txt.first, 13.sp, FontWeight.SemiBold); T(txt.second, 11.sp, color = C.inkSoft, maxLines = 2) }
                Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft)
            }
        }
    }
}

fun byDay(series: List<J>, key: String): List<Pair<String, Double>> {
    val m = sortedMapOf<String, Double>()
    series.forEach { r -> m[r["bucket"].s] = (m[r["bucket"].s] ?: 0.0) + (if (key == "delivered") r["groups"]["delivered"]["orders"].d else r[key].d) }
    return m.map { it.key to it.value }
}

@Composable fun CenterBlocks(period: Period, team: String, pos: String, product: String, data: HomeData) {
    val nav = LocalNav.current
    val (a, b) = period.range
    val posIds = if (pos.isEmpty()) emptyList() else listOf(pos)
    fun q(group: String, basis: String, title: String, ids: List<String> = posIds) = Screen.Orders(OrderQuery(a, b, ids, group, basis = basis, title = title, team = team, product = product))
    val report = data.today
    val t = report?.get("current")?.get("total"); val p = report?.get("compare")?.get("total")
    T("Số liệu theo kỳ", 15.sp, FontWeight.Bold, modifier = Modifier.padding(top = 6.dp))
    T(buildString { append("${period.label} · so với kỳ liền trước"); if (team != "all") append(" · " + if (team == "sale") "Sale" else "CSKH"); if (pos.isNotEmpty()) append(" · " + Pos.short(pos)); if (product != "all") append(" · " + if (product == "gentadox") "Gentadox" else "SK + GK") }, 10.sp, color = C.inkSoft)
    if (t != null) {
        val shift = data.shift
        val shiftName = mapOf("morning" to "ca sáng", "afternoon" to "ca chiều", "evening" to "ca tối", "day" to "cả ngày")[shift?.get("shift")?.s] ?: "ca hiện tại"
        Grid2(listOf(
            { m -> KpiCard(Icons.Filled.ShoppingCart, C.blue, "Đơn tạo mới", Fmt.int(t["orders"].d), Fmt.delta(t["orders"].d, p?.get("orders")?.dn), note = "${Fmt.int(t["customers"].d)} khách", modifier = m) { nav.push(q("", "created", "Đơn tạo mới")) } },
            { m -> KpiCard(Icons.Filled.Verified, C.good, "Đơn chốt", Fmt.int(t["closedOrders"].d), Fmt.delta(t["closedOrders"].d, p?.get("closedOrders")?.dn), note = "Tỷ lệ chốt/tạo ${Fmt.pct(t["closeRate"].dn)}", modifier = m) { nav.push(q("closed", "confirmed", "Đơn chốt")) } },
            { m -> KpiCard(Icons.Filled.Payments, C.teal, "Doanh thu đơn chốt", Fmt.short(t["closedNet"].d) + " ₫", Fmt.delta(t["closedNet"].d, p?.get("closedNet")?.dn), note = "GTTB ${Fmt.short(t["averageOrder"].d)} ₫", modifier = m) { nav.push(q("closed", "confirmed", "Đơn chốt")) } },
            { m -> KpiCard(Icons.Filled.Functions, C.gray, "Giá trị TB đơn (AOV)", Fmt.short(t["averageOrder"].d) + " ₫", Fmt.delta(t["averageOrder"].d, p?.get("averageOrder")?.dn), note = "Doanh thu ÷ đơn chốt", modifier = m) },
            { m -> KpiCard(Icons.Filled.Inventory2, C.good, "Giao thành công", Fmt.int(t["groups"]["delivered"]["orders"].d), Fmt.delta(t["groups"]["delivered"]["orders"].d, p?.get("groups")?.get("delivered")?.get("orders")?.dn), note = "${Fmt.short(t["groups"]["delivered"]["net"].d)} ₫ · theo ngày tạo", modifier = m) { nav.push(q("delivered", "created", "Giao thành công")) } },
            { m -> val r = shift?.get("total")?.get("rate")?.dn; val y = shift?.get("yesterday")?.get("rate")?.dn
                KpiCard(Icons.Filled.LocalFireDepartment, C.warn, "Chốt nóng $shiftName hôm nay", Fmt.pct(r), if (r != null && y != null) Fmt.points(r - y) else null, (r ?: 0.0) >= (y ?: 0.0), note = shift?.let { "${Fmt.int(it["total"]["closed"].d)} chốt / ${Fmt.int(it["total"]["received"].d)} số nhận" }, modifier = m) { nav.push(Screen.Page("shift")) } },
        ))
        val goal = data.targets?.get("items")?.list?.filter { it["scope"].s == "pos" && (pos.isEmpty() || it["refId"].s == pos) }?.sumOf { it["revenue"].d } ?: 0.0
        Panel(12.dp, onClick = { nav.push(Screen.Page("cskh-kpi")) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconBox(Icons.Filled.TrackChanges, C.purple); Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) { T("Mục tiêu tháng ${b.substring(5, 7)}", 11.sp, color = C.inkSoft); Rolling(if (goal > 0) Fmt.pct0(t["closedNet"].d / goal * 100) else "—", 19.sp) }
                T(if (goal > 0) "${Fmt.short(t["closedNet"].d)} / ${Fmt.short(goal)} ₫ · còn ${Fmt.short(maxOf(0.0, goal - t["closedNet"].d))} ₫" else "Chưa đặt mục tiêu (Cấu hình → Mục tiêu tháng)", 10.sp, color = C.inkSoft, modifier = Modifier.width(150.dp))
            }
            Bar(if (goal > 0) t["closedNet"].d / goal else 0.0, C.purple, 7.dp)
        }
    }
    // Xu hướng 30 ngày
    Panel {
        SectionHead("Xu hướng 30 ngày", "Xem chi tiết") { nav.push(Screen.Overview(pos.ifEmpty { null })) }
        T("Doanh thu đơn chốt theo ngày", 10.sp, color = C.inkSoft)
        val s = data.trend?.get("current")?.get("series")?.list
        if (!s.isNullOrEmpty()) {
            LineChart(byDay(s, "closedNet").map { Fmt.day(it.first).take(5) to it.second }, C.brand, 120.dp)
            T("Đơn chốt 30 ngày: ${Fmt.int(byDay(s, "closedOrders").sumOf { it.second })}", 9.sp, color = C.inkSoft)
        } else Skeleton(120.dp)
    }
    if (t != null) Panel {
        Row { T("Trạng thái đơn", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Đơn tạo trong kỳ") }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Donut(STATUS_ITEMS.map { Triple(it.second, t["groups"][it.first]["orders"].d, it.third) }, Fmt.int(t["orders"].d), "đơn tạo")
            Spacer(Modifier.width(14.dp))
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                STATUS_ITEMS.forEach { (k, title, c) ->
                    Row(Modifier.clickable { nav.push(q(k, "created", title)) }, verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(c)); Spacer(Modifier.width(6.dp)); T(title, 11.sp, modifier = Modifier.weight(1f), maxLines = 1)
                        T(Fmt.int(t["groups"][k]["orders"].d), 11.sp, FontWeight.Bold); T(Fmt.pct0(if (t["orders"].d > 0) t["groups"][k]["orders"].d / t["orders"].d * 100 else null), 10.sp, color = C.inkSoft, modifier = Modifier.width(36.dp), align = androidx.compose.ui.text.style.TextAlign.End)
                    }
                }
            }
        }
    }
    data.pipeline?.let { pl ->
        val T0 = pl["total"]; val closed = T0["closed"]["orders"].d
        Panel {
            SectionHead("Vận hành đơn", "Xem chi tiết") { nav.push(Screen.Page("pipeline")) }
            T("Chốt → xuất đi → đã nhận · theo giờ chốt trong kỳ", 10.sp, color = C.inkSoft)
            FunnelLine("Đơn chốt", closed, closed, C.good) { nav.push(q("closed", "confirmed", "Đơn chốt")) }
            FunnelLine("Đã xuất đi", T0["shipped"]["orders"].d, closed, C.blue) { nav.push(q("shipped", "confirmed", "Đã xuất đi")) }
            FunnelLine("Đã nhận", T0["delivered"]["orders"].d, closed, C.good) { nav.push(q("delivered", "confirmed", "Đã nhận")) }
            ChipRow {
                Box(Modifier.clickable { nav.push(q("shipping", "confirmed", "Đang giao")) }) { Tag("Đang giao ${Fmt.int(T0["shipping"]["orders"].d)}", Tone.Orange) }
                Box(Modifier.clickable { nav.push(q("returned", "confirmed", "Hoàn")) }) { Tag("Hoàn ${Fmt.int(T0["returned"]["orders"].d)}", Tone.Purple) }
                Box(Modifier.clickable { nav.push(q("cancelled", "confirmed", "Hủy sau chốt")) }) { Tag("Hủy ${Fmt.int(T0["cancelled"]["orders"].d)}", Tone.Red) }
                Box(Modifier.clickable { nav.push(q("processing", "confirmed", "Chưa xuất kho")) }) { Tag("Chưa xuất ${Fmt.int(T0["processing"]["orders"].d)}", Tone.Gray) }
            }
        }
    }
    // Xếp hạng POS
    val rows = report?.get("current")?.get("byPos")?.list
    if (rows != null && t != null) Panel {
        Row { T("Xếp hạng POS", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Doanh thu đơn chốt") }
        val sorted = rows.sortedByDescending { it["closedNet"].d }; val maxV = (sorted.firstOrNull()?.get("closedNet")?.d ?: 1.0).coerceAtLeast(1.0)
        sorted.forEachIndexed { i, x ->
            val id = x["posId"].s; val prev = report["compare"]["byPos"].list.firstOrNull { it["posId"].s == id }
            Column(Modifier.clickable { nav.push(q("closed", "confirmed", Pos.name(id), listOf(id))) }.padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    T("${i + 1}", 10.sp, FontWeight.Bold, C.inkSoft, modifier = Modifier.width(16.dp)); PosBadge(id, 20.dp); Spacer(Modifier.width(6.dp))
                    T(Pos.name(id), 12.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
                    Column(horizontalAlignment = Alignment.End) { T(Fmt.short(x["closedNet"].d) + " ₫", 12.sp, FontWeight.Bold); Fmt.delta(x["closedNet"].d, prev?.get("closedNet")?.dn)?.let { T(it, 9.sp, FontWeight.SemiBold, if (it.startsWith("-")) C.bad else C.good) } }
                }
                Bar(x["closedNet"].d / maxV, posColor(id), 5.dp, Modifier.padding(start = 42.dp))
                T("${Fmt.int(x["closedOrders"].d)} chốt · tỷ trọng ${Fmt.pct0(if (t["closedNet"].d > 0) x["closedNet"].d / t["closedNet"].d * 100 else null)} · AOV ${Fmt.short(if (x["closedOrders"].d > 0) x["closedNet"].d / x["closedOrders"].d else 0.0)} ₫ · kỳ trước ${prev?.let { Fmt.short(it["closedNet"].d) } ?: "—"} ₫", 9.sp, color = C.inkSoft, modifier = Modifier.padding(start = 42.dp))
            }
        }
    }
    // Cảnh báo & đồng bộ
    Panel {
        val alerts = data.shift?.get("alerts")?.list ?: emptyList()
        SectionHead("Cảnh báo & đồng bộ" + if (alerts.isNotEmpty()) " (${alerts.size})" else "", "Xem ca") { nav.push(Screen.Page("shift")) }
        if (data.shift != null && alerts.isEmpty()) T("✓ Không có cảnh báo trong ca.", 11.sp, color = C.good)
        alerts.take(5).forEach { al ->
            val c = if (al["level"].s == "high") C.bad else C.warn
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(c.copy(alpha = .08f)).padding(8.dp)) { Icon(Icons.Filled.Warning, null, tint = c, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(8.dp)); Column { T(al["title"].s, 11.sp, FontWeight.SemiBold); T(al["detail"].s, 10.sp, color = C.inkSoft) } }
        }
        T("ĐỒNG BỘ PANCAKE", 9.sp, FontWeight.Bold, C.inkSoft)
        Pos.order.forEach { id ->
            val sp = Sync.pos.firstOrNull { it["posId"].s == id }
            Row(verticalAlignment = Alignment.CenterVertically) {
                PosBadge(id, 20.dp); Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) { T(Pos.name(id), 11.sp, FontWeight.SemiBold); T(sp?.get("lastError")?.sn ?: "đồng bộ lúc ${Fmt.dateTime(sp?.get("lastSyncAt")?.sn)}", 9.sp, color = if (sp?.get("lastError")?.sn != null) C.bad else C.inkSoft, maxLines = 1) }
                T(sp?.let { Fmt.ago(it["lastSyncAt"].sn) } ?: "—", 10.sp, color = when { sp == null -> C.inkSoft; sp["lastError"].sn != null -> C.bad; Sync.age(sp) > 15 -> C.warn; else -> C.good })
            }
        }
    }
    // Nhân viên
    report?.get("current")?.get("byEmployee")?.list?.let { emps ->
        val staff = emps.filter { it["sellerId"].s.isNotEmpty() && it["assignedOrders"].d >= 10 && (it["department"].sn == null || Regex("sale|bán hàng|cskh|chăm sóc", RegexOption.IGNORE_CASE).containsMatchIn(it["department"].s)) }
        Panel {
            SectionHead("Nhân viên", "So sánh nhân viên") { nav.push(Screen.Compare("all")) }
            T("Tỷ lệ chốt · từ 10 đơn chia · Sale và CSKH", 10.sp, color = C.inkSoft)
            T("TOP 5", 9.sp, FontWeight.Bold, C.good)
            EmpRows(staff.sortedByDescending { it["assignedCloseRate"].dn ?: -1.0 }.take(5), C.good, a, b)
            T("CẦN HỖ TRỢ", 9.sp, FontWeight.Bold, C.bad)
            EmpRows(staff.sortedBy { it["assignedCloseRate"].dn ?: 999.0 }.take(5), C.bad, a, b)
        }
    }
    // Mua lại & data
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) { T("Mua lại & data", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); T("Mua lại ›", 11.sp, FontWeight.SemiBold, C.brand, modifier = Modifier.clickable { nav.push(Screen.Page("repurchase")) }); Spacer(Modifier.width(10.dp)); T("Data ›", 11.sp, FontWeight.SemiBold, C.brand, modifier = Modifier.clickable { nav.push(Screen.Page("batches")) }) }
        val rp = data.repurchase; val bt = data.batches?.get("batches")?.list ?: emptyList()
        val recv = bt.sumOf { it["received"].d }; val buy = bt.sumOf { it["buyers"].d }
        GridN(2, listOf(
            { m -> MiniCell("Tỷ lệ mua lại (trọn đời)", rp?.let { Fmt.pct(if (it["funnel"]["once"].d > 0) it["funnel"]["twice"].d / it["funnel"]["once"].d * 100 else null) } ?: "—", m) },
            { m -> MiniCell("Doanh thu mua lại", rp?.let { Fmt.short(it["summary"]["repurchase"]["net"].d) + " ₫" } ?: "—", m) },
            { m -> MiniCell("Đơn mua lại", rp?.let { Fmt.int(it["summary"]["repurchase"]["orders"].d) } ?: "—", m) },
            { m -> MiniCell("Khách mua lại", rp?.let { Fmt.int(it["summary"]["repurchase"]["customers"].d) } ?: "—", m) },
            { m -> MiniCell("Data được cấp", if (data.batches == null) "—" else Fmt.int(recv), m) },
            { m -> MiniCell("Đã mua", if (data.batches == null) "—" else "${Fmt.int(buy)} · ${Fmt.pct0(if (recv > 0) buy / recv * 100 else null)}", m) },
        ))
    }
    // Khách hàng + Khách lâu chưa mua
    data.customers?.let { c ->
        val g = c["groups"]; val seg = c["segments"]
        Panel {
            SectionHead("Khách hàng", "Xem chi tiết") { nav.push(Screen.Page("customers")) }
            T("Toàn bộ lịch sử · bấm một ô để mở trang tương ứng", 10.sp, color = C.inkSoft)
            GridN(3, listOf(
                { m -> MiniCell("Tổng khách", Fmt.int(g["total"].d), m) { nav.push(Screen.Page("customers")) } },
                { m -> MiniCell("Hoạt động 30 ngày", Fmt.int(seg["active"].d), m) { nav.push(Screen.Page("customers")) } },
                { m -> MiniCell("Thân thiết", Fmt.int(seg["loyal"].d), m) { nav.push(Screen.Page("customers")) } },
                { m -> MiniCell("Nguy cơ rời bỏ", Fmt.int(seg["risk"].d), m) { nav.push(Screen.Page("dormant")) } },
                { m -> MiniCell("Lâu chưa mua (>90)", Fmt.int(seg["dormant"].d), m) { nav.push(Screen.Page("dormant")) } },
                { m -> MiniCell("Tổng chi tiêu", Fmt.short(seg["ltvTotal"].d) + " ₫", m) },
            ))
        }
        Panel {
            SectionHead("Khách lâu chưa mua", "Xem chi tiết") { nav.push(Screen.Page("dormant")) }
            T("Theo số ngày từ lần mua thành công gần nhất tới hôm nay", 10.sp, color = C.inkSoft)
            val buckets = listOf("30-45" to "30–45 ngày", "46-60" to "46–60 ngày", "61-90" to "61–90 ngày", "90+" to "Trên 90 ngày")
            val buyers = (g["total"].d - g["never"].d).coerceAtLeast(1.0); val maxV = buckets.maxOf { g[it.first].d }.coerceAtLeast(1.0)
            buckets.forEach { (k, label) ->
                val n = g[k].d; val net = c["groupNets"][k].dn
                Column(Modifier.clickable { nav.push(Screen.Page("dormant")) }.padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row { T(label, 12.sp, FontWeight.SemiBold, modifier = Modifier.weight(1f)); Column(horizontalAlignment = Alignment.End) { T(Fmt.int(n), 12.sp, FontWeight.Bold); T("${Fmt.pct0(n / buyers * 100)} khách đã mua", 9.sp, color = C.inkSoft) } }
                    Bar(n / maxV, if (k == "90+") C.bad else if (k == "61-90") C.warn else C.good, 5.dp)
                    T("Đã mua ${net?.let { Fmt.short(it) + " ₫" } ?: "—"}${if (net != null && n > 0) " · TB ${Fmt.short(net / n)} ₫/khách" else ""}", 9.sp, color = C.inkSoft)
                }
            }
        }
    }
}

@Composable fun EmpRows(rows: List<J>, tone: Color, a: String, b: String) {
    val nav = LocalNav.current
    if (rows.isEmpty()) T("Chưa đủ dữ liệu (từ 10 đơn chia).", 10.sp, color = C.inkSoft)
    rows.forEachIndexed { i, e ->
        Row(Modifier.fillMaxWidth().clickable { nav.push(Screen.Orders(OrderQuery(a, b, group = "closed", sellerId = e["sellerId"].s, basis = "confirmed", title = e["name"].sn ?: "Nhân viên"))) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            T("${i + 1}", 10.sp, FontWeight.Bold, C.inkSoft, modifier = Modifier.width(16.dp)); Avatar(e["name"].s, 26.dp, tone); Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) { T(e["name"].s, 11.sp, FontWeight.SemiBold, maxLines = 1); T(e["department"].s, 9.sp, color = C.inkSoft, maxLines = 1) }
            Column(horizontalAlignment = Alignment.End) { T(Fmt.pct(e["assignedCloseRate"].dn), 11.sp, FontWeight.Bold, tone); T("${Fmt.int(e["closedOrders"].d)} / ${Fmt.int(e["assignedOrders"].d)}", 9.sp, color = C.inkSoft) }
            Spacer(Modifier.width(8.dp)); Box(Modifier.width(56.dp)) { Bar((e["assignedCloseRate"].d / 100), tone, 4.dp) }
        }
    }
}

// ---------- Tổng quan POS ----------
@Composable fun OverviewScreen(initialPos: String?) {
    val nav = LocalNav.current
    var period by remember { mutableStateOf<Period>(Period.Today) }
    var pos by remember { mutableStateOf(initialPos) }
    var explain by remember { mutableStateOf<Explain?>(null) }
    val (a, b) = period.range
    val posIds = listOfNotNull(pos)
    val d = load(period.key, pos) {
        coroutineScope {
            val o = async { Api.overview(a, b, posIds) }
            val h = async { if (a == b) runCatching { Api.shift(a, "day", posIds) }.getOrNull() else null }
            o.await() to h.await()
        }
    }
    val label = (if (a == b) Fmt.day(a) else "${Fmt.day(a)} – ${Fmt.day(b)}") + " · " + (pos?.let { Pos.name(it) } ?: "Tất cả POS")
    fun q(g: String, basis: String, title: String) = OrderQuery(a, b, posIds, g, basis = basis, title = title)
    SubPage("Tổng quan POS", d.loading && d.data != null, { d.reload() }) {
        PageTitle("Tổng quan POS", "Hiệu suất bán hàng theo từng điểm") { Hint("Số liệu Pancake") }
        PeriodMenu(period) { period = it }
        PosChipRow(pos, label = null) { pos = it }
        ErrorLine(d.error.takeIf { d.data == null })
        val r = d.data?.first; val t = r?.get("current")?.get("total"); val p = r?.get("compare")?.get("total")
        if (t != null) {
            val rec = r["current"]["reconcile"].let { rc -> if (rc.isNull) null else { val ok = (t["closedOrders"].d - rc["orders"].d).toInt() == 0 && kotlin.math.abs(t["closedNet"].d - rc["net"].d) < 1000; ok to (if (ok) "Khớp với đơn gốc: ${Fmt.int(rc["orders"].d)} đơn · ${Fmt.money(rc["net"].d)}." else "Lệch: bảng số liệu ${Fmt.int(t["closedOrders"].d)} / ${Fmt.money(t["closedNet"].d)}; đơn gốc ${Fmt.int(rc["orders"].d)} / ${Fmt.money(rc["net"].d)}. Kéo để làm mới.") } }
            Grid2(listOf(
                { m -> KpiCard(Icons.Filled.ShoppingCart, C.good, "Tổng đơn hàng", Fmt.int(t["orders"].d), Fmt.delta(t["orders"].d, p?.get("orders")?.dn), modifier = m) { explain = Explain("Tổng đơn hàng", Fmt.int(t["orders"].d), "Số đơn được tạo trong kỳ (theo ngày tạo), không tính đơn đã xóa.", label, p?.let { "Kỳ trước" to Fmt.int(it["orders"].d) }, null, t["orders"].i, q("", "created", "Đơn tạo")) } },
                { m -> KpiCard(Icons.Filled.AccountBalanceWallet, C.teal, "Doanh thu", Fmt.vnd(t["closedNet"].d), Fmt.delta(t["closedNet"].d, p?.get("closedNet")?.dn), modifier = m) { explain = Explain("Doanh thu", Fmt.money(t["closedNet"].d), "Doanh thu (sau giảm giá và quà) của các đơn đã xác nhận trở đi, xếp theo ngày xác nhận lần đầu. Trùng ô \"Tổng cộng · Doanh thu\" trên Pancake.", label, p?.let { "Kỳ trước" to Fmt.money(it["closedNet"].d) }, rec, t["closedOrders"].i, q("closed", "confirmed", "Đơn chốt")) } },
                { m -> val cr = t["closeRate"].dn; val pr = p?.get("closeRate")?.dn
                    KpiCard(Icons.Filled.Percent, C.purple, "Tỷ lệ chốt đơn", Fmt.pct(cr), if (cr != null && pr != null) Fmt.points(cr - pr) else null, (cr ?: 0.0) >= (pr ?: 0.0), modifier = m) { explain = Explain("Tỷ lệ chốt đơn", Fmt.pct(cr), "Đơn chốt ÷ đơn tạo trong kỳ.\n${Fmt.int(t["closedOrders"].d)} ÷ ${Fmt.int(t["orders"].d)}.", label, pr?.let { "Kỳ trước" to Fmt.pct(it) }, null, t["closedOrders"].i, q("closed", "confirmed", "Đơn chốt")) } },
                { m -> KpiCard(Icons.Filled.Groups, C.blue, "Khách mua hàng", Fmt.int(t["customers"].d), Fmt.delta(t["customers"].d, p?.get("customers")?.dn), modifier = m) { explain = Explain("Khách mua hàng", Fmt.int(t["customers"].d), "Số SĐT khác nhau có đơn tạo trong kỳ. Trong đó ${Fmt.int(t["closedCustomers"].d)} SĐT có đơn chốt.", label, p?.let { "Kỳ trước" to Fmt.int(it["customers"].d) }, null, t["orders"].i, q("", "created", "Đơn tạo")) } },
            ))
            if (rec != null) ReconcileLine(rec)
            Panel {
                Row { T("Xu hướng doanh thu", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint(if (a == b) "Theo giờ" else "Theo ngày") }
                val hourly = d.data?.second?.get("hourly")?.list
                if (a == b) { if (hourly.isNullOrEmpty()) T("Chưa có đơn chốt trong ngày.", 12.sp, color = C.inkSoft) else LineChart(hourly.map { it["hour"].s.take(2) + "h" to it["value"].d }) }
                else r["current"]["series"].list.takeIf { it.isNotEmpty() }?.let { LineChart(byDay(it, "closedNet").map { x -> x.first.takeLast(2) to x.second }) }
            }
            Panel {
                Row { T("Trạng thái đơn hàng", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Đơn tạo trong kỳ") }
                StackedBar(listOf(Triple("Đã thanh toán", t["groups"]["delivered"]["orders"].d, C.good), Triple("Đang xử lý", t["groups"]["confirmed"]["orders"].d + t["groups"]["shipping"]["orders"].d, C.warn), Triple("Chờ xác nhận", t["groups"]["new"]["orders"].d, Color(0xFFF2A33A)), Triple("Đã hủy", t["groups"]["cancelled"]["orders"].d + t["groups"]["returned"]["orders"].d, C.bad)))
                Row { STATUS_ITEMS.forEach { (k, title, c) -> Column(Modifier.weight(1f).clickable { nav.push(Screen.Orders(q(k, "created", title))) }, horizontalAlignment = Alignment.CenterHorizontally) { T(Fmt.int(t["groups"][k]["orders"].d), 13.sp, FontWeight.Bold, c); T(title, 8.sp, color = C.inkSoft, maxLines = 1) } } }
            }
            if (pos == null) PosBreakdown(r["current"]["byPos"].list, t["closedNet"].d) { pos = it }
            r["syncedAt"].sn?.let { T("Đồng bộ Pancake lúc ${Fmt.dateTime(it)}", 11.sp, color = C.inkSoft) }
        } else if (d.error == null) { Thinking(); Skeleton() }
    }
    explain?.let { ex -> ExplainSheet(ex, { explain = null }) { explain = null; nav.push(Screen.Orders(it)) } }
}

@Composable fun ReconcileLine(rec: Pair<Boolean, String>) {
    val c = if (rec.first) C.good else C.warn
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = .1f)).padding(10.dp)) { Icon(if (rec.first) Icons.Filled.Verified else Icons.Filled.Warning, null, tint = c, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); T(rec.second, 11.sp, color = c) }
}

@Composable fun PosBreakdown(rows: List<J>, total: Double, pick: (String) -> Unit) {
    Panel {
        Row { T("Theo POS", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); T("chạm để chỉ xem POS đó", 9.sp, color = C.inkSoft) }
        rows.sortedByDescending { it["closedNet"].d }.forEach { r ->
            Column(Modifier.clickable { pick(r["posId"].s) }, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { PosBadge(r["posId"].s, 20.dp); Spacer(Modifier.width(8.dp)); T(Pos.name(r["posId"].s), 13.sp, FontWeight.Medium, modifier = Modifier.weight(1f)); T(Fmt.short(r["closedNet"].d) + " ₫", 13.sp, FontWeight.SemiBold) }
                Bar(if (total > 0) r["closedNet"].d / total else 0.0, posColor(r["posId"].s))
                T("${Fmt.int(r["closedOrders"].d)} đơn chốt · ${Fmt.int(r["orders"].d)} đơn tạo", 11.sp, color = C.inkSoft)
            }
        }
    }
}

/** Bảng giải thích cách tính: số, kỳ, so kỳ trước, đối chiếu, xem đơn cấu thành. */
data class Explain(val title: String, val value: String, val definition: String, val period: String, val previous: Pair<String, String>?, val reconcile: Pair<Boolean, String>?, val count: Int?, val query: OrderQuery?)

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ExplainSheet(m: Explain, dismiss: () -> Unit, open: (OrderQuery) -> Unit) {
    ModalBottomSheet(dismiss, containerColor = C.cream) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            T(m.title, 16.sp, FontWeight.Bold)
            Panel { T(m.value, 30.sp, FontWeight.Bold); T(m.period, 11.sp, color = C.inkSoft); m.previous?.let { Row { T(it.first, 13.sp, modifier = Modifier.weight(1f)); T(it.second, 13.sp, color = C.inkSoft) } } }
            T("Cách tính", 13.sp, FontWeight.Bold, C.inkSoft); Panel { T(m.definition, 13.sp) }
            m.reconcile?.let { T("Đối chiếu", 13.sp, FontWeight.Bold, C.inkSoft); ReconcileLine(it) }
            m.query?.let { q -> PrimaryButton(m.count?.let { "Xem ${Fmt.int(it)} đơn cấu thành" } ?: "Xem đơn cấu thành", Icons.AutoMirrored.Filled.List) { open(q) } }
        }
    }
}

@Composable fun AlertsScreen() {
    val shift = load(Unit) { Sync.refresh(); Api.shift(VNDate.today().toString(), "auto") }
    SubPage("Thông báo", shift.loading, { shift.reload() }) {
        T("Đồng bộ", 13.sp, FontWeight.Bold, C.inkSoft)
        Panel { Sync.pos.forEach { p -> Row(verticalAlignment = Alignment.CenterVertically) { PosBadge(p["posId"].s, 20.dp); Spacer(Modifier.width(6.dp)); Box(Modifier.size(8.dp).clip(CircleShape).background(if (p["lastError"].sn != null) C.bad else if (Sync.age(p) > 15) C.warn else C.good)); Spacer(Modifier.width(8.dp)); Column { T(Pos.name(p["posId"].s), 13.sp, FontWeight.SemiBold); T(p["lastError"].sn ?: if (Sync.age(p) > 15) "Chưa đồng bộ ${Fmt.ago(p["lastSyncAt"].sn)}" else "Đồng bộ ${Fmt.dateTime(p["lastSyncAt"].sn)}", 11.sp, color = C.inkSoft) } } } }
        val alerts = shift.data?.get("alerts")?.list ?: emptyList()
        if (alerts.isNotEmpty()) { T("Trong ca", 13.sp, FontWeight.Bold, C.inkSoft); Panel { alerts.forEach { a -> Row { Icon(Icons.Filled.Warning, null, tint = if (a["level"].s == "high") C.bad else C.warn, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(8.dp)); Column { T(a["title"].s, 13.sp, FontWeight.SemiBold); T(a["detail"].s, 11.sp, color = C.inkSoft) } } } } }
    }
}
