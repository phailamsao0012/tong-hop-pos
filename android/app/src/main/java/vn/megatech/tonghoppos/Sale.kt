package vn.megatech.tonghoppos

import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.LocalTime

val SALE_TABS = listOf(SubTab("shift", "Trong ca"), SubTab("compare", "Nhân viên"), SubTab("batches", "Data"), SubTab("pipeline", "Đơn hàng"))

@Composable fun SaleTab() {
    val tabs = SALE_TABS.filter { Auth.canView(it.id) }
    var page by remember { mutableStateOf(tabs.firstOrNull()?.id ?: "shift") }
    TabPage("Dữ liệu vận hành · Tăng trưởng bền vững") {
        ChipRow { tabs.forEach { Chip(it.title, page == it.id) { page = it.id } } }
        when (page) { "compare" -> CompareContent("sale"); "batches" -> BatchesContent(); "pipeline" -> PipelineContent(); else -> ShiftContent() }
    }
}

// ---------- Điều hành trong ca ----------
val SHIFTS = listOf("auto" to "Ca hiện tại", "morning" to "Ca sáng", "afternoon" to "Ca chiều", "evening" to "Ca tối", "day" to "Cả ngày", "personal" to "Ca cá nhân")

@Composable fun ShiftContent() {
    val nav = LocalNav.current
    var shift by remember { mutableStateOf("auto") }
    var day by remember { mutableStateOf(VNDate.today().toString()) }
    var showAll by remember { mutableStateOf(false) }
    val d = load(day, shift) { Api.shift(day, shift) }
    PageTitle("Điều hành trong ca", "Bám sát hoạt động, tối ưu hiệu suất") {
        SelectMenu("${SHIFTS.first { it.first == shift }.second} · ${Fmt.day(day).take(5)}", SHIFTS.map { it } + listOf("@today" to "Hôm nay", "@yesterday" to "Hôm qua"), Icons.Filled.CalendarMonth, Modifier.width(170.dp)) {
            when (it) { "@today" -> day = VNDate.today().toString(); "@yesterday" -> day = VNDate.add(-1).toString(); else -> shift = it }
        }
    }
    ErrorLine(d.error.takeIf { d.data == null })
    val s = d.data ?: run { if (d.error == null) { Skeleton(); Skeleton() }; return }
    val h0 = s["hours"]["start"].i; val h1 = s["hours"]["end"].i
    val now = LocalTime.now(Fmt.tz); val h = now.hour + now.minute / 60.0
    val prog = if (!s["isToday"].b) 1.0 else ((h - h0) / (h1 - h0)).coerceIn(0.0, 1.0)
    val left = h1 - h
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Ring(prog, 70.dp, 8.dp); Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { T("Tiến độ ca làm", 14.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Tag(if (prog in 0.001..0.999) "Đang diễn ra" else if (prog >= 1) "Đã xong" else "Chưa bắt đầu", Tone.Green, true) }
                T("${SHIFTS.firstOrNull { it.first == s["shift"].s }?.second ?: s["shift"].s} (${"%02d".format(h0)}:00 - ${"%02d".format(h1)}:00)", 12.sp, color = C.inkSoft)
                T(if (prog >= 1) "Đã kết thúc" else if (prog <= 0) "Bắt đầu lúc $h0:00" else "Còn khoảng ${left.toInt()} giờ ${((left - left.toInt()) * 60).toInt()} phút", 12.sp, color = C.inkSoft)
            }
        }
    }
    val tot = s["total"]; val y = s["yesterday"]; val staff = s["staff"].list
    Grid2(listOf(
        { m -> KpiCard(Icons.Filled.PhoneCallback, C.blue, "Số đã nhận", Fmt.int(tot["received"].d), Fmt.delta(tot["received"].d, y["received"].dn), modifier = m) { nav.push(Screen.Orders(OrderQuery(day, day, basis = "assigned", title = "Số đã nhận"))) } },
        { m -> KpiCard(Icons.Filled.Bolt, C.good, "Số đã chốt", Fmt.int(tot["closed"].d), Fmt.delta(tot["closed"].d, y["closed"].dn), modifier = m) { nav.push(Screen.Orders(OrderQuery(day, day, group = "closed", basis = "confirmed", title = "Số đã chốt"))) } },
        { m -> KpiCard(Icons.Filled.Percent, C.purple, "Tỷ lệ chốt nóng", Fmt.pct(tot["rate"].dn), note = "hôm qua ${Fmt.pct(y["rate"].dn)}", modifier = m) },
        { m -> KpiCard(Icons.Filled.Payments, C.teal, "Giá trị đơn chốt", Fmt.short(staff.sumOf { it["hotValue"].d }) + " ₫", note = "so cùng ca hôm qua", modifier = m) { nav.push(Screen.Orders(OrderQuery(day, day, group = "closed", basis = "confirmed", title = "Đơn chốt"))) } },
    ))
    SectionHead("Hiệu suất nhân viên", if (showAll) "Thu gọn" else "Xem tất cả") { showAll = !showAll }
    if (staff.isEmpty()) Panel { T("Chưa có nhân viên nhận số trong ca.", 13.sp, color = C.inkSoft) }
    else Panel(0.dp) {
        val maxR = (staff.maxOfOrNull { it["received"].d } ?: 1.0).coerceAtLeast(1.0)
        val list = if (showAll) staff else staff.take(5)
        list.forEachIndexed { i, e ->
            val r = e["rate"].dn
            Row(Modifier.fillMaxWidth().clickable { nav.push(Screen.Orders(OrderQuery(day, day, group = "closed", sellerId = e["employeeId"].s, basis = "confirmed", title = e["name"].s))) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(e["name"].s, 38.dp); Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row { T(e["name"].s, 13.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f)); T("${Fmt.int(e["closed"].d)} đơn", 13.sp, FontWeight.Bold) }
                    T("${e["department"].sn ?: "Tư vấn bán hàng"} · ${e["posIds"].strings.take(2).joinToString(", ") { Pos.short(it) }}", 10.sp, color = C.inkSoft, maxLines = 1)
                    Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.weight(1f)) { Bar(e["received"].d / maxR, rateTone(r), 5.dp) }; T(if (e["assignedHidden"].b) "—" else if (r == null) "—" else if (r >= 50) "Tốt · ${Fmt.pct(r)}" else if (r >= 35) "Khá · ${Fmt.pct(r)}" else "Cần cải thiện", 10.sp, FontWeight.SemiBold, rateTone(r), modifier = Modifier.width(92.dp), align = androidx.compose.ui.text.style.TextAlign.End) }
                    T("nhận ${Fmt.int(e["received"].d)} · ${Fmt.short(e["hotValue"].d)} ₫${if (e["pending"].d > 0) " · chờ XN ${Fmt.int(e["pending"].d)}" else ""}", 9.sp, color = C.inkSoft)
                }
            }
            if (i < list.lastIndex) Divider0(60.dp)
        }
    }
    s["alerts"].list.forEach { a ->
        val c = if (a["level"].s == "high") C.bad else C.warn
        val emp = staff.firstOrNull { a["detail"].s.startsWith(it["name"].s) }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.copy(alpha = .08f)).border(1.dp, c.copy(alpha = .25f), RoundedCornerShape(14.dp)).clickable {
            if (emp != null) nav.push(Screen.Orders(OrderQuery(day, day, group = if (a["title"].s.contains("quá tải")) "unconfirmed" else "", sellerId = emp["employeeId"].s, basis = "assigned", title = emp["name"].s))) else nav.push(Screen.Page("config"))
        }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(c), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Warning, null, tint = Color.White, modifier = Modifier.size(18.dp)) }
            Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { T(a["title"].s, 13.sp, FontWeight.Bold, c); T(a["detail"].s, 11.sp, color = C.inkSoft) }; Icon(Icons.Filled.ChevronRight, null, tint = c)
        }
    }
    Panel {
        Row { T("Diễn biến trong ca (theo giờ)", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Số chốt / số nhận") }
        val hrs = s["hourly"].list; val maxV = (hrs.maxOfOrNull { it["received"].d } ?: 1.0).coerceAtLeast(1.0)
        Row(Modifier.fillMaxWidth().height(110.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom) {
            hrs.forEach { hr ->
                Column(Modifier.weight(1f).fillMaxHeight().clickable { nav.push(Screen.Orders(OrderQuery(day, day, basis = "assigned", hour = hr["hour"].s.take(2).toIntOrNull(), title = "Số nhận ${hr["hour"].s}"))) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                    Box(Modifier.fillMaxWidth().height(80.dp), contentAlignment = Alignment.BottomCenter) {
                        GrowCol(hr["received"].d / maxV, C.good.copy(alpha = .3f)); GrowCol(hr["closed"].d / maxV, C.good)
                    }
                    T("${hr["hour"].s.take(2).toIntOrNull() ?: 0}h", 9.sp, color = C.inkSoft)
                }
            }
        }
    }
    Panel {
        T("Xác nhận mới nhất", 15.sp, FontWeight.Bold)
        val feed = s["feed"].list
        if (feed.isEmpty()) T("Chưa có đơn nào được xác nhận trong ca.", 12.sp, color = C.inkSoft)
        feed.take(8).forEach { f -> Row(Modifier.fillMaxWidth().clickable { nav.push(Screen.Order(f["id"].s)) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(7.dp).clip(CircleShape).background(C.good)); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T("Đơn #${f["orderId"].s} · ${Fmt.money(f["net"].d)}", 12.sp, FontWeight.SemiBold); T("${f["closer"].s} · ${f["posName"].s}${f["customer"].sn?.let { " · $it" } ?: ""}", 10.sp, color = C.inkSoft, maxLines = 1) }; T(f["at"].s.drop(11).take(5), 11.sp, color = C.inkSoft) } }
    }
    s["syncedAt"].sn?.let { T("Đồng bộ Pancake lúc ${Fmt.dateTime(it)}", 11.sp, color = C.inkSoft) }
}

@Composable fun GrowCol(frac: Double, color: Color) {
    val anim = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(frac) { anim.animateTo(frac.toFloat().coerceIn(0f, 1f), androidx.compose.animation.core.spring(dampingRatio = .7f, stiffness = 90f)) }
    Box(Modifier.fillMaxWidth().fillMaxHeight(anim.value.coerceAtLeast(.03f)).clip(RoundedCornerShape(3.dp)).background(color))
}

// ---------- So sánh nhân viên ----------
@Composable fun CompareContent(team: String) {
    val nav = LocalNav.current
    var teamPick by remember { mutableStateOf("sale") }
    var period by remember { mutableStateOf<Period>(Period.Month) }
    var sort by remember { mutableStateOf("closedNet") }
    var dept by remember { mutableStateOf("") }
    var pos by remember { mutableStateOf("") }
    var q by remember { mutableStateOf("") }
    val (a, b) = period.range
    val tm = if (team == "all") teamPick else team
    val d = load(period.key, tm, pos) { Api.overview(a, b, if (pos.isEmpty()) emptyList() else listOf(pos), team = tm) }
    PageTitle("So sánh nhân viên", "Tỷ lệ chốt = đơn chốt ÷ đơn chia (như Pancake) · so với kỳ liền trước") { PeriodMenu(period) { period = it } }
    if (team == "all") Segmented(teamPick, listOf("sale" to "Sale", "cskh" to "CSKH", "all" to "Tất cả")) { teamPick = it }
    ChipRow { Chip("Tất cả POS", pos.isEmpty()) { pos = "" }; Pos.order.forEach { id -> Chip(Pos.short(id), pos == id) { pos = if (pos == id) "" else id } } }
    val data = d.data
    val allRows = data?.get("current")?.get("byEmployee")?.list?.filter { it["sellerId"].s.isNotEmpty() } ?: emptyList()
    val depts = allRows.mapNotNull { it["department"].sn }.distinct().sorted()
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        SelectMenu(dept.ifEmpty { "Tất cả bộ phận" }, listOf("" to "Tất cả bộ phận") + depts.map { it to it }, Icons.Filled.Groups, Modifier.weight(1f)) { dept = it }
        SearchBox(q, "Tìm tên", Modifier.weight(1f), { q = it }) {}
    }
    ErrorLine(d.error.takeIf { data == null })
    if (data == null) { if (d.error == null) { Skeleton(); Skeleton(220.dp) }; return }
    val prevBy = data["compare"]["byEmployee"].list.associateBy { it["sellerId"].s }
    val all = allRows.filter { (dept.isEmpty() || it["department"].s == dept) && (q.isEmpty() || it["name"].s.contains(q, true)) }
    val list = when (sort) { "closedOrders" -> all.sortedByDescending { it["closedOrders"].d }; "rate" -> all.sortedByDescending { it["assignedCloseRate"].dn ?: -1.0 }; else -> all.sortedByDescending { it["closedNet"].d } }
    fun median(xs: List<Double>): Double? { val s = xs.sorted(); if (s.isEmpty()) return null; return if (s.size % 2 == 1) s[s.size / 2] else (s[s.size / 2 - 1] + s[s.size / 2]) / 2 }
    val assigned = list.sumOf { it["assignedOrders"].d }; val closed = list.sumOf { it["closedOrders"].d }
    val pA = list.sumOf { prevBy[it["sellerId"].s]?.get("assignedOrders")?.d ?: 0.0 }; val pC = list.sumOf { prevBy[it["sellerId"].s]?.get("closedOrders")?.d ?: 0.0 }
    val qualified = list.filter { it["assignedOrders"].d >= 10 }
    val med = median(qualified.mapNotNull { it["assignedCloseRate"].dn }); val pMed = median(qualified.mapNotNull { prevBy[it["sellerId"].s]?.get("assignedCloseRate")?.dn })
    val best = qualified.maxByOrNull { it["assignedCloseRate"].dn ?: -1.0 }
    fun emp(e: J) = Screen.Orders(OrderQuery(a, b, if (pos.isEmpty()) emptyList() else listOf(pos), "closed", e["sellerId"].s, "confirmed", title = e["name"].s))
    Grid2(listOf(
        { m -> KpiCard(Icons.Filled.Groups, C.good, "Tổng nhân sự", Fmt.int(list.size), note = "Có đơn chia hoặc đơn chốt trong kỳ", modifier = m) },
        { m -> KpiCard(Icons.Filled.Inbox, C.blue, "Tổng đơn chia", Fmt.int(assigned), Fmt.delta(assigned, pA), note = "Trung bình ${Fmt.int(assigned / list.size.coerceAtLeast(1))} đơn/người", modifier = m) },
        { m -> KpiCard(Icons.Filled.Verified, C.good, "Tổng đơn chốt", Fmt.int(closed), Fmt.delta(closed, pC), note = "Tỷ lệ chốt chung ${Fmt.pct(if (assigned > 0) closed / assigned * 100 else null)}", modifier = m) { nav.push(Screen.Orders(OrderQuery(a, b, if (pos.isEmpty()) emptyList() else listOf(pos), "closed", basis = "confirmed", title = "Đơn chốt", team = tm))) } },
        { m -> KpiCard(Icons.Filled.Percent, C.purple, "Trung vị tỷ lệ chốt", Fmt.pct(med), if (med != null && pMed != null) Fmt.points(med - pMed) else null, (med ?: 0.0) >= (pMed ?: 0.0), note = "Mục tiêu tham chiếu 40%", modifier = m) },
    ))
    best?.let { e -> Panel(12.dp, onClick = { nav.push(emp(e)) }) { Row(verticalAlignment = Alignment.CenterVertically) { IconBox(Icons.Filled.EmojiEvents, C.good); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T("NHÂN VIÊN NỔI BẬT", 9.sp, FontWeight.Bold, C.inkSoft); Rolling(Fmt.pct(e["assignedCloseRate"].dn), 19.sp); T("${e["name"].s} · ${Fmt.int(e["closedOrders"].d)} / ${Fmt.int(e["assignedOrders"].d)} đơn", 11.sp, color = C.inkSoft) }; Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft) } } }
    Panel {
        Row { T("Hiệu suất đội ngũ", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Vạch xám: trung vị · xanh: 40%") }
        T("Tỷ lệ chốt (%) của 15 nhân viên cao nhất", 10.sp, color = C.inkSoft)
        all.sortedByDescending { it["assignedCloseRate"].dn ?: -1.0 }.take(15).forEach { e ->
            Row(Modifier.fillMaxWidth().clickable { nav.push(emp(e)) }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                T(e["name"].s, 11.sp, maxLines = 1, modifier = Modifier.width(118.dp), align = androidx.compose.ui.text.style.TextAlign.End); Spacer(Modifier.width(8.dp))
                Box(Modifier.weight(1f).height(10.dp)) {
                    Bar((e["assignedCloseRate"].d / 100), C.good, 10.dp)
                    Canvas(Modifier.fillMaxSize()) { med?.let { mm -> val x = size.width * (mm / 100).toFloat(); drawLine(C.inkSoft, Offset(x, 0f), Offset(x, size.height), 3f) }; val x2 = size.width * .4f; drawLine(C.good.copy(alpha = .6f), Offset(x2, 0f), Offset(x2, size.height), 3f) }
                }
                T(Fmt.pct(e["assignedCloseRate"].dn), 11.sp, FontWeight.Bold, modifier = Modifier.width(50.dp), align = androidx.compose.ui.text.style.TextAlign.End)
            }
        }
    }
    Panel {
        Row { T("Đơn chia vs. tỷ lệ chốt", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Cỡ chấm theo doanh thu") }
        val maxX = (all.maxOfOrNull { it["assignedOrders"].d } ?: 1.0).coerceAtLeast(1.0); val maxW = (all.maxOfOrNull { it["closedNet"].d } ?: 1.0).coerceAtLeast(1.0)
        Canvas(Modifier.fillMaxWidth().height(180.dp)) {
            val w = size.width; val h = size.height
            listOf(0f, .25f, .5f, .75f, 1f).forEach { f -> drawLine(Color(0x10000000), Offset(0f, h * (1 - f)), Offset(w, h * (1 - f)), 2f) }
            drawLine(Color(0x10000000), Offset(w / 2, 0f), Offset(w / 2, h), 2f)
            all.forEach { e -> drawCircle(C.good.copy(alpha = .7f), (8 + 22 * (e["closedNet"].d / maxW)).toFloat(), Offset((w * e["assignedOrders"].d / maxX).toFloat(), (h * (1 - (e["assignedCloseRate"].d / 100).coerceIn(0.0, 1.0))).toFloat())) }
        }
        Row { T("Chốt tốt, cần thêm data", 9.sp, color = C.inkSoft, modifier = Modifier.weight(1f)); T("Hiệu suất cao", 9.sp, color = C.inkSoft) }
        Row { T("Cần hỗ trợ, ưu tiên coaching", 9.sp, color = C.inkSoft, modifier = Modifier.weight(1f)); T("Cân bằng data · trục ngang: đơn chia (0–${Fmt.int(maxX)})", 9.sp, color = C.inkSoft) }
    }
    val medAssigned = median(all.map { it["assignedOrders"].d }) ?: 0.0
    RankBlock("Nhân viên nổi bật", "Tỷ lệ cao nhất, ≥ 10 đơn chia", Icons.Filled.WorkspacePremium, C.good, qualified.sortedByDescending { it["assignedCloseRate"].dn ?: -1.0 }.take(3), prevBy) { nav.push(emp(it)) }
    RankBlock("Cần hỗ trợ", "Tỷ lệ thấp nhất, ≥ 10 đơn chia", Icons.Filled.SupportAgent, C.bad, qualified.sortedBy { it["assignedCloseRate"].dn ?: 999.0 }.take(3), prevBy) { nav.push(emp(it)) }
    RankBlock("Cân bằng data", "Chốt tốt nhưng ít data, nên cấp thêm số", Icons.Filled.SwapHoriz, C.warn, qualified.filter { (it["assignedCloseRate"].dn ?: 0.0) >= (med ?: 0.0) && it["assignedOrders"].d <= medAssigned }.sortedByDescending { it["assignedCloseRate"].d }.take(3), prevBy) { nav.push(emp(it)) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        T("Chi tiết (${list.size} người)", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f))
        ExportButton("so-sanh-nhan-vien-$a-$b", listOf("Nhân viên", "Bộ phận", "Đơn chia", "Đơn chốt", "Tỷ lệ chốt", "Doanh thu", "AOV", "Tỷ lệ kỳ trước", "Doanh thu kỳ trước")) { list.map { e -> val p = prevBy[e["sellerId"].s]; listOf(e["name"].s, e["department"].s, Fmt.int(e["assignedOrders"].d), Fmt.int(e["closedOrders"].d), Fmt.pct(e["assignedCloseRate"].dn), Fmt.int(e["closedNet"].d), Fmt.int(e["averageOrder"].d), Fmt.pct(p?.get("assignedCloseRate")?.dn), Fmt.int(p?.get("closedNet")?.d ?: 0.0)) } }
        Spacer(Modifier.width(6.dp))
        SelectMenu(when (sort) { "closedOrders" -> "Đơn chốt"; "rate" -> "Tỷ lệ"; else -> "Doanh thu" }, listOf("closedNet" to "Theo doanh thu", "closedOrders" to "Theo đơn chốt", "rate" to "Theo tỷ lệ chốt"), modifier = Modifier.width(110.dp)) { sort = it }
    }
    Panel(0.dp) {
        list.take(60).forEachIndexed { i, e ->
            val p = prevBy[e["sellerId"].s]
            Row(Modifier.fillMaxWidth().clickable { nav.push(emp(e)) }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Medal(i + 1); Spacer(Modifier.width(8.dp)); Avatar(e["name"].s, 34.dp); Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) { T(e["name"].s, 13.sp, FontWeight.SemiBold, maxLines = 1); T("${e["department"].sn ?: "—"} · kỳ trước ${Fmt.pct(p?.get("assignedCloseRate")?.dn)} · ${Fmt.short(p?.get("closedNet")?.d ?: 0.0)} ₫", 9.sp, color = C.inkSoft, maxLines = 1) }
                Column(Modifier.width(62.dp), horizontalAlignment = Alignment.End) { T(Fmt.pct(e["assignedCloseRate"].dn), 13.sp, FontWeight.Bold); T("${Fmt.int(e["closedOrders"].d)} / ${Fmt.int(e["assignedOrders"].d)}", 9.sp, color = C.inkSoft) }
                Column(Modifier.width(70.dp), horizontalAlignment = Alignment.End) { T(Fmt.short(e["closedNet"].d), 13.sp, FontWeight.Bold); T("AOV ${Fmt.short(e["averageOrder"].d)}", 9.sp, color = C.inkSoft) }
            }
            if (i < minOf(60, list.size) - 1) Divider0(40.dp)
        }
    }
    T("Cách tính: đơn chia = đơn có người bán được gán trong kỳ; đơn chốt theo ngày xác nhận lần đầu; tỷ lệ chốt = chốt ÷ chia. Nổi bật và cần hỗ trợ chỉ xét người có từ 10 đơn chia.", 9.sp, color = C.inkSoft)
}

@Composable fun RankBlock(title: String, sub: String, icon: androidx.compose.ui.graphics.vector.ImageVector, tone: Color, rows: List<J>, prev: Map<String, J>, open: (J) -> Unit) {
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, tint = tone); Spacer(Modifier.width(6.dp)); T(title, 14.sp, FontWeight.Bold) }
        T(sub, 10.sp, color = C.inkSoft)
        if (rows.isEmpty()) T("Chưa đủ dữ liệu.", 11.sp, color = C.inkSoft)
        rows.forEachIndexed { i, e ->
            Row(Modifier.fillMaxWidth().clickable { open(e) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                T("${i + 1}", 10.sp, FontWeight.Bold, tone, modifier = Modifier.width(16.dp))
                Column(Modifier.weight(1f)) { T(e["name"].s, 12.sp, FontWeight.SemiBold); T("Kỳ trước ${Fmt.pct(prev[e["sellerId"].s]?.get("assignedCloseRate")?.dn)} · ${Fmt.short(e["closedNet"].d)} ₫ · ${e["department"].s}", 9.sp, color = C.inkSoft, maxLines = 1) }
                T(Fmt.pct(e["assignedCloseRate"].dn), 13.sp, FontWeight.Bold, tone); Spacer(Modifier.width(6.dp)); T("${Fmt.int(e["closedOrders"].d)} / ${Fmt.int(e["assignedOrders"].d)}", 10.sp, color = C.inkSoft)
            }
        }
    }
}

// ---------- Data được cấp ----------
@Composable fun BatchesContent() {
    val nav = LocalNav.current
    var period by remember { mutableStateOf<Period>(Period.D90) }
    var filter by remember { mutableStateOf("all") }
    val (a, b) = period.range
    val d = load(period.key) { Api.batches(a, b) }
    PageTitle("Data được cấp", "Mỗi đợt số được giao, kết quả rõ ràng.") { PeriodMenu(period, listOf(Period.Month, Period.Last, Period.D90)) { period = it } }
    ErrorLine(d.error.takeIf { d.data == null })
    val all = d.data?.get("batches")?.list ?: run { if (d.error == null) Skeleton(); return }
    val recv = all.sumOf { it["received"].d }; val buy = all.sumOf { it["buyers"].d }
    Grid2(listOf(
        { m -> StatCard(Icons.Filled.PhoneIphone, C.good, "Tổng số điện thoại đã nhận", Fmt.int(recv), "${all.size} đợt", m) },
        { m -> StatCard(Icons.Filled.TrackChanges, C.good, "Tỷ lệ mua (toàn bộ)", Fmt.pct(if (recv > 0) buy / recv * 100 else null), "${Fmt.int(buy)} SĐT đã mua", m) },
    ))
    val thisMonth = VNDate.today().toString().take(7)
    val months = all.map { it["month"].s }.distinct().sortedDescending()
    ChipRow {
        Chip("Tất cả (${months.size})", filter == "all") { filter = "all" }
        Chip("Đang triển khai (${months.count { it == thisMonth }})", filter == "active") { filter = "active" }
        Chip("Đã hoàn thành (${months.count { it != thisMonth }})", filter == "done") { filter = "done" }
    }
    SectionHead("Danh sách đợt", "Mới nhất")
    months.filter { filter == "all" || (if (filter == "active") it == thisMonth else it != thisMonth) }.forEach { m ->
        val rows = all.filter { it["month"].s == m }
        val r = rows.sumOf { it["received"].d }; val bb = rows.sumOf { it["buyers"].d }; val net = rows.sumOf { it["net"].d }
        Panel(12.dp, onClick = { nav.push(Screen.Orders(OrderQuery("$m-01", VNDate.monthEnd(m), basis = "assigned", title = "Data tháng ${m.takeLast(2)}/${m.take(4)}"))) }) {
            Row(verticalAlignment = Alignment.CenterVertically) { T("#BT${m.replace("-", "")}", 13.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Tag(if (m == thisMonth) "Đang triển khai" else "Đã hoàn thành", if (m == thisMonth) Tone.Green else Tone.Blue) }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column { T(Fmt.int(r), 12.sp, FontWeight.Bold); T("điện thoại", 9.sp, color = C.inkSoft) }
                Column { T("${rows.size} nhân viên", 12.sp, FontWeight.Bold); T("được giao", 9.sp, color = C.inkSoft) }
                Column { T("${m.takeLast(2)}/${m.take(4)}", 12.sp, FontWeight.Bold); T("tháng giao", 9.sp, color = C.inkSoft) }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                rows.take(3).forEach { x -> Box(Modifier.offset(x = (-4).dp)) { Avatar(x["sellerName"].s, 24.dp) } }
                if (rows.size > 3) T("+${rows.size - 3}", 9.sp, FontWeight.Bold, C.inkSoft)
                Spacer(Modifier.weight(1f)); T("mua ${Fmt.pct(if (r > 0) bb / r * 100 else null)} · ${Fmt.short(net)} ₫", 11.sp, FontWeight.SemiBold, C.good)
            }
        }
    }
}

// ---------- Vận hành đơn ----------
@Composable fun PipelineContent() {
    val nav = LocalNav.current
    var period by remember { mutableStateOf<Period>(Period.Month) }
    var basis by remember { mutableStateOf("confirmed") }
    var pos by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    var q by remember { mutableStateOf("") }
    var tick by remember { mutableIntStateOf(0) }
    val (a, b) = period.range
    fun oq(g: String, title: String, ids: List<String> = emptyList()) = OrderQuery(a, b, ids, g, basis = if (basis == "confirmed") "confirmed" else "created", title = title)
    val d = load(period.key, basis) { Api.pipeline(a, b, basis) }
    val recent = load(period.key, basis, pos, status, tick) { Api.orders(oq(status, "Đơn", if (pos.isEmpty()) emptyList() else listOf(pos)).copy(q = q), 1)["orders"].list }
    PageTitle("Vận hành đơn", "Theo dõi từng bước, giao đúng hẹn.") { PeriodMenu(period) { period = it } }
    Segmented(basis, listOf("confirmed" to "Theo giờ chốt", "created" to "Theo ngày tạo")) { basis = it }
    ErrorLine(d.error.takeIf { d.data == null })
    val T0 = d.data?.get("total") ?: run { if (d.error == null) Skeleton(); return }
    fun n(k: String) = T0[k]["orders"].d
    val stages = listOf(Triple("unconfirmed", "Mới", Icons.Filled.NoteAdd to C.good), Triple("processing", "Xác nhận", Icons.Filled.Verified to C.warn), Triple("shipping", "Giao vận", Icons.Filled.LocalShipping to C.blue), Triple("delivered", "Đã giao", Icons.Filled.CheckCircle to C.good), Triple("returned", "Trả hàng", Icons.Filled.AssignmentReturn to C.bad))
    Row(verticalAlignment = Alignment.CenterVertically) {
        stages.forEachIndexed { i, (k, label, ic) ->
            Column(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(ic.second.copy(alpha = .08f)).clickable { nav.push(Screen.Orders(oq(k, label))) }.padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                IconBox(ic.first, ic.second, 28.dp); T(label, 9.sp, FontWeight.SemiBold, maxLines = 1); Rolling(Fmt.int(if (k == "unconfirmed" && basis != "created") 0.0 else n(k)), 14.sp)
            }
            if (i < stages.lastIndex) Icon(Icons.Filled.ArrowForward, null, tint = C.inkSoft, modifier = Modifier.size(10.dp))
        }
    }
    val shipped = n("shipped")
    Grid2(listOf(
        { m -> KpiCard(Icons.Filled.Verified, C.good, "Tỷ lệ giao thành công", Fmt.pct(if (shipped > 0) n("delivered") / shipped * 100 else null), note = "${Fmt.int(n("delivered"))} / ${Fmt.int(shipped)} đã xuất", modifier = m) { nav.push(Screen.Orders(oq("delivered", "Đã giao"))) } },
        { m -> KpiCard(Icons.Filled.Inventory2, C.good, "Tổng đơn chốt", Fmt.int(n("closed")), note = Fmt.short(T0["closed"]["net"].d) + " ₫", modifier = m) { nav.push(Screen.Orders(oq("closed", "Đơn chốt"))) } },
    ))
    Panel(12.dp, Modifier.border(1.dp, C.bad.copy(alpha = .2f), RoundedCornerShape(14.dp))) {
        Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.Error, null, tint = C.bad); Spacer(Modifier.width(6.dp)); T("Đơn cần lưu ý", 14.sp, FontWeight.Bold, C.bad, modifier = Modifier.weight(1f)); T("Xem tất cả ›", 11.sp, FontWeight.SemiBold, C.brand, modifier = Modifier.clickable { nav.push(Screen.Orders(oq("processing", "Chưa xuất kho"))) }) }
        listOf(Triple("waiting", "Chờ chuyển hàng (đã đóng, chưa giao)", C.bad), Triple("confirmed", "Đã xác nhận, chưa đóng hàng", C.warn), Triple("returned", "Hoàn / trả hàng", C.warn), Triple("cancelled", "Hủy sau khi chốt", C.bad)).forEach { (k, label, c) ->
            Row(Modifier.fillMaxWidth().clickable { nav.push(Screen.Orders(oq(if (k == "confirmed") "justconfirmed" else k, label))) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(8.dp).clip(CircleShape).background(c)); Spacer(Modifier.width(8.dp)); T(label, 12.sp, modifier = Modifier.weight(1f), maxLines = 1); T("${Fmt.int(n(k))} đơn", 12.sp, FontWeight.Bold); Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft, modifier = Modifier.size(16.dp)) }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        SearchBox(q, "Tìm mã đơn, SĐT khách hàng…", Modifier.weight(1f), { q = it }) { tick++ }
        SelectMenu(if (pos.isEmpty()) "POS" else Pos.short(pos), listOf("" to "Tất cả POS") + Pos.order.map { it to Pos.name(it) }, modifier = Modifier.width(110.dp)) { pos = it }
    }
    ChipRow { listOf("" to "Tất cả", "unconfirmed" to "Mới", "processing" to "Xác nhận", "shipping" to "Giao vận", "delivered" to "Đã giao").forEach { (k, l) -> Chip(l, status == k) { status = k } } }
    SectionHead("Danh sách đơn hàng", "Mới nhất") { nav.push(Screen.Orders(oq(status, "Đơn hàng", if (pos.isEmpty()) emptyList() else listOf(pos)))) }
    if (recent.loading && recent.data == null) Skeleton(90.dp)
    recent.data?.take(8)?.forEach { OrderCard(it) }
    if (recent.data?.isEmpty() == true) Panel { T("Không có đơn khớp bộ lọc.", 12.sp, color = C.inkSoft) }
}
