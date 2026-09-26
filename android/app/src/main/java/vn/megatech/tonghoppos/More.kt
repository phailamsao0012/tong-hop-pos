package vn.megatech.tonghoppos

import android.content.Intent
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.time.LocalDate

// ---------- MKT ----------
@Composable fun MktTab() {
    val nav = LocalNav.current
    var period by remember { mutableStateOf<Period>(Period.Month) }
    var team by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf("orders") }
    val (a, b) = period.range
    val d = load(period.key) { coroutineScope { val x = async { Api.marketing(a, b) }; val y = async { runCatching { Api.marketing(period.previous.first, period.previous.second) }.getOrNull() }; x.await() to y.await() } }
    TabPage("Đồng hành cùng nhà chăn nuôi Việt", d.loading && d.data != null, { d.reload() }) {
        PageTitle("Tổng quan MKT", "Số về, xác nhận, doanh thu theo marketer") { PeriodMenu(period) { period = it } }
        val all = d.data?.first?.get("byMarketer")?.list ?: emptyList()
        val teams = all.map { it["marketingTeamName"].s }.filter { it.isNotEmpty() }.distinct().sorted()
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f)) { T("Chọn đội nhóm", 10.sp, color = C.inkSoft); SelectMenu(team.ifEmpty { "Tất cả đội nhóm" }, listOf("" to "Tất cả đội nhóm") + teams.map { it to it }, Icons.Filled.Groups) { team = it } }
            Column(Modifier.weight(1f)) { T("Xếp theo", 10.sp, color = C.inkSoft); SelectMenu(mapOf("orders" to "Số đơn hàng", "net" to "Doanh thu", "rate" to "Tỷ lệ xác nhận")[sort]!!, listOf("orders" to "Số đơn hàng", "net" to "Doanh thu", "rate" to "Tỷ lệ xác nhận"), Icons.Filled.SwapVert) { sort = it } }
        }
        ErrorLine(d.error.takeIf { d.data == null })
        if (d.data == null) { if (d.error == null) { Thinking(); Skeleton() }; return@TabPage }
        val rows0 = all.filter { team.isEmpty() || it["marketingTeamName"].s == team }
        val rows = when (sort) { "net" -> rows0.sortedByDescending { it["net"].d }; "rate" -> rows0.sortedByDescending { it["confirmationRate"].dn ?: -1.0 }; else -> rows0.sortedByDescending { it["createdOrders"].d } }
        val prev = d.data?.second?.get("byMarketer")?.list?.filter { team.isEmpty() || it["marketingTeamName"].s == team }
        fun sum(k: String) = rows.sumOf { it[k].d }
        fun ps(k: String) = prev?.sumOf { it[k].d }
        Grid2(listOf(
            { m -> KpiCard(MI.orders, C.good, "Đơn hàng (số về)", Fmt.int(sum("createdOrders")), Fmt.delta(sum("createdOrders"), ps("createdOrders")), note = "so với kỳ trước", modifier = m) { nav.push(Screen.Orders(OrderQuery(a, b, title = "Số về (đơn tạo)"))) } },
            { m -> KpiCard(MI.customers, C.good, "Số điện thoại", Fmt.int(sum("createdPhones")), Fmt.delta(sum("createdPhones"), ps("createdPhones")), modifier = m) },
            { m -> KpiCard(MI.closed, C.good, "Đơn xác nhận", Fmt.int(sum("confirmedOrders")), Fmt.delta(sum("confirmedOrders"), ps("confirmedOrders")), modifier = m) },
            { m -> KpiCard(MI.customers, C.good, "Khách có mua (giao TC)", Fmt.int(sum("deliveredOrders")), Fmt.delta(sum("deliveredOrders"), ps("deliveredOrders")), modifier = m) },
            { m -> KpiCard(MI.rate, C.purple, "Tỷ lệ xác nhận", Fmt.pct(if (sum("createdOrders") > 0) sum("confirmedOrders") / sum("createdOrders") * 100 else null), note = "${Fmt.int(sum("confirmedOrders"))} / ${Fmt.int(sum("createdOrders"))} đơn", modifier = m) },
            { m -> KpiCard(MI.revenue, C.teal, "Doanh thu", Fmt.short(sum("net")) + " ₫", Fmt.delta(sum("net"), ps("net")), note = "TB đơn ${Fmt.short(if (sum("confirmedOrders") > 0) sum("net") / sum("confirmedOrders") else 0.0)} ₫", modifier = m) },
            { m -> KpiCard(MI.returned, C.warn, "Sau hoàn hủy", Fmt.short(rows.sumOf { it["netAfterRefund"].dn ?: it["net"].d }) + " ₫", note = "Hoàn ${Fmt.int(sum("returnedOrders"))} · hủy ${Fmt.int(sum("cancelledOrders"))}", modifier = m) },
            { m -> KpiCard(MI.aov, C.good, "Doanh thu / SĐT", Fmt.short(if (sum("createdPhones") > 0) sum("net") / sum("createdPhones") else 0.0) + " ₫", note = "Giao TC ${Fmt.pct(if (sum("confirmedOrders") > 0) sum("deliveredOrders") / sum("confirmedOrders") * 100 else null)}", modifier = m) },
        ))
        if (teams.size > 1 && team.isEmpty()) Panel {
            Row { T("Theo marketing team", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Chạm để lọc") }
            val byTeam = teams.map { t -> t to all.filter { it["marketingTeamName"].s == t } }.sortedByDescending { p -> p.second.sumOf { it["createdOrders"].d } }
            val maxO = (byTeam.maxOfOrNull { p -> p.second.sumOf { it["createdOrders"].d } } ?: 1.0).coerceAtLeast(1.0)
            byTeam.forEach { (t, ms) ->
                val o = ms.sumOf { it["createdOrders"].d }; val c = ms.sumOf { it["confirmedOrders"].d }; val n = ms.sumOf { it["net"].d }
                Column(Modifier.clickable { team = t }.padding(vertical = 3.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) { Row { T(t, 12.sp, FontWeight.SemiBold); T("  ${ms.size} người", 9.sp, color = C.inkSoft); Spacer(Modifier.weight(1f)); T("${Fmt.int(o)} số về · XN ${Fmt.pct(if (o > 0) c / o * 100 else null)} · ${Fmt.short(n)} ₫", 10.sp, FontWeight.SemiBold, C.inkSoft) }; Bar(o / maxO, C.good) }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            T("Top nhân viên MKT", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f))
            ExportButton("marketing-$a-$b", listOf("Marketer", "Team", "Số về", "SĐT", "Đơn xác nhận", "Tỷ lệ XN", "Doanh thu", "Hoàn/hủy (tiền)", "Sau hoàn hủy", "Giao TC", "Hoàn", "Hủy")) { rows.map { listOf(it["marketerName"].s, it["marketingTeamName"].s, Fmt.int(it["createdOrders"].d), Fmt.int(it["createdPhones"].d), Fmt.int(it["confirmedOrders"].d), Fmt.pct(it["confirmationRate"].dn), Fmt.int(it["net"].d), Fmt.int(it["refundNet"].d), Fmt.int(it["netAfterRefund"].dn ?: it["net"].d), Fmt.int(it["deliveredOrders"].d), Fmt.int(it["returnedOrders"].d), Fmt.int(it["cancelledOrders"].d)) } }
        }
        Panel(0.dp) {
            val maxV = (rows.maxOfOrNull { when (sort) { "net" -> it["net"].d; "rate" -> it["confirmationRate"].d; else -> it["createdOrders"].d } } ?: 1.0).coerceAtLeast(1.0)
            rows.take(20).forEachIndexed { i, m ->
                Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Medal(i + 1); Spacer(Modifier.width(8.dp)); Avatar(m["marketerName"].s, 34.dp); Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Row { T(m["marketerName"].s, 13.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f)); T(when (sort) { "net" -> Fmt.short(m["net"].d) + " ₫"; "rate" -> Fmt.pct(m["confirmationRate"].dn); else -> "${Fmt.int(m["createdOrders"].d)} đơn" }, 12.sp, FontWeight.Bold) }
                        Bar(when (sort) { "net" -> m["net"].d; "rate" -> m["confirmationRate"].d; else -> m["createdOrders"].d } / maxV, C.good, 5.dp)
                        T("${m["marketingTeamName"].s} · ${Fmt.int(m["createdPhones"].d)} SĐT · XN ${Fmt.pct(m["confirmationRate"].dn)} · ${Fmt.short(m["netAfterRefund"].dn ?: m["net"].d)} ₫ sau hoàn hủy", 9.sp, color = C.inkSoft, maxLines = 1)
                    }
                }
                if (i < minOf(20, rows.size) - 1) Divider0(40.dp)
            }
        }
        Grid2(listOf(
            { m -> Panel(12.dp, m) { T("Doanh thu theo nhân viên MKT", 11.sp, color = C.inkSoft); Rolling(Fmt.short(sum("net")), 22.sp, color = C.good); T("Sau hoàn hủy ${Fmt.short(rows.sumOf { it["netAfterRefund"].dn ?: it["net"].d })} ₫", 10.sp, color = C.inkSoft) } },
            { m -> Panel(12.dp, m) { T("Trạng thái vận chuyển", 11.sp, color = C.inkSoft); T("${Fmt.int(sum("deliveredOrders"))} giao TC", 13.sp, FontWeight.Bold); T("${Fmt.int(sum("returnedOrders"))} hoàn · ${Fmt.int(sum("cancelledOrders"))} hủy", 10.sp, color = C.inkSoft); T("Tỷ lệ giao ${Fmt.pct(if (sum("confirmedOrders") > 0) sum("deliveredOrders") / sum("confirmedOrders") * 100 else null)}", 10.sp, color = C.good) } },
        ))
    }
}

// ---------- Thêm ----------
data class PageItem(val id: String, val title: String, val icon: ImageVector)
val MORE_GROUPS = listOf(
    "Khách hàng & báo cáo" to listOf(PageItem("customers", "Hồ sơ khách hàng", Icons.Filled.Badge), PageItem("monthly", "Báo cáo cuối tháng", Icons.Filled.CalendarMonth), PageItem("custom", "Báo cáo tùy chỉnh", Icons.Filled.Tune), PageItem("raw-orders", "Đơn nguồn Pancake POS", Icons.Filled.Storage)),
    "Nhân sự" to listOf(PageItem("recruit", "Tuyển dụng", Icons.Filled.PersonAdd)),
    "Hệ thống" to listOf(PageItem("config", "Cấu hình & kết nối", Icons.Filled.Settings), PageItem("audit", "Nhật ký hoạt động", Icons.Filled.Assignment), PageItem("security", "Bảo mật tài khoản", Icons.Filled.Shield), PageItem("metrics", "Cách tính", Icons.Filled.Calculate)),
)

@Composable fun MoreTab() {
    val nav = LocalNav.current; val scope = rememberCoroutineScope()
    val me = Auth.me
    TabPage("Vận hành thông minh · Trải nghiệm khác biệt") {
        if (me != null) Panel { Row(verticalAlignment = Alignment.CenterVertically) { Avatar(me["displayName"].s, 48.dp); Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { T(me["displayName"].s, 16.sp, FontWeight.Bold); T(me["title"].sn ?: me["email"].s, 12.sp, color = C.inkSoft) }; Tag(when (Auth.role) { "owner" -> "Chủ hệ thống"; "director" -> "Giám đốc"; "lead" -> "Trưởng nhóm"; else -> "Nhân viên" }) } }
        Panel(0.dp) { ScanQrRow(LocalContext.current as androidx.fragment.app.FragmentActivity) }
        MORE_GROUPS.forEach { (title, pages) ->
            val allowed = pages.filter { Auth.canView(it.id) }
            if (allowed.isNotEmpty()) {
                T(title, 13.sp, FontWeight.Bold, C.inkSoft)
                Panel(0.dp) { allowed.forEachIndexed { i, p -> Row(Modifier.fillMaxWidth().clickable { nav.push(Screen.Page(p.id)) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { IconBox(p.icon, C.brand); Spacer(Modifier.width(12.dp)); T(p.title, 14.sp, FontWeight.Medium, modifier = Modifier.weight(1f)); Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft) }; if (i < allowed.lastIndex) Divider0(58.dp) } }
            }
        }
        PrimaryButton("Đăng xuất", Icons.Filled.Logout, C.bad) { scope.launch { Auth.signOut() } }
        T("Phiên bản ${BuildConfig.VERSION_NAME} · MEGATECH POS Operations", 10.sp, color = C.inkSoft, modifier = Modifier.fillMaxWidth(), align = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable fun PageScreen(id: String) {
    when (id) {
        "customers" -> CustomerSearchScreen()
        "monthly" -> MonthlyScreen()
        "custom" -> CustomReportScreen()
        "raw-orders" -> OrderListScreen(OrderQuery(VNDate.add(-6).toString(), VNDate.today().toString(), title = "Đơn nguồn Pancake POS"), filterable = true)
        "recruit" -> RecruitScreen()
        "config" -> ConfigScreen()
        "audit" -> AuditScreen()
        "security" -> SecurityScreen()
        "metrics" -> MetricSettingsScreen()
        "shift" -> SubPage("Điều hành trong ca") { ShiftContent() }
        "compare" -> SubPage("So sánh nhân viên") { CompareContent("all") }
        "batches" -> SubPage("Data được cấp") { BatchesContent() }
        "pipeline" -> SubPage("Vận hành đơn") { PipelineContent() }
        "calls" -> SubPage("Cuộc gọi CSKH") { CallsContent("cskh") }
        "care" -> SubPage("Khách theo nhân viên") { CareContent() }
        "repurchase" -> SubPage("Mua lại & Upsell") { RepurchaseContent() }
        "dormant" -> SubPage("Khách lâu chưa mua") { DormantContent() }
        "cskh-kpi" -> SubPage("KPI CSKH") { KpiContent() }
        else -> SubPage(id) { T("Trang này chưa có trong app.", 13.sp) }
    }
}

// ---------- Báo cáo cuối tháng ----------
@Composable fun MonthlyScreen() {
    val nav = LocalNav.current; val ctx = LocalContext.current
    var offset by remember { mutableLongStateOf(0) }
    val start = VNDate.monthStart().minusMonths(offset)
    val end = if (offset == 0L) VNDate.today() else start.withDayOfMonth(start.lengthOfMonth())
    val label = "Tháng %02d/%d".format(start.monthValue, start.year); val prevLabel = start.minusMonths(1).let { "Tháng %02d/%d".format(it.monthValue, it.year) }
    val a = start.toString(); val b = end.toString()
    val d = load(offset) { Api.overview(a, b) }
    fun q(g: String, basis: String, title: String) = Screen.Orders(OrderQuery(a, b, group = g, basis = basis, title = title))
    SubPage("Báo cáo cuối tháng", d.loading && d.data != null, { d.reload() }) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlineButton("‹") { offset++ }
            Box(Modifier.weight(1f)) { DatePill(label, false) }
            OutlineButton("›") { if (offset > 0) offset-- }
        }
        ErrorLine(d.error.takeIf { d.data == null })
        val t = d.data?.get("current")?.get("total"); val p = d.data?.get("compare")?.get("total")
        if (t != null) {
            Grid2(listOf(
                { m -> KpiCard(MI.revenue, C.good, "Tổng doanh thu", Fmt.vnd(t["closedNet"].d), Fmt.delta(t["closedNet"].d, p?.get("closedNet")?.dn)?.let { "$it so với tháng trước" }, modifier = m) { nav.push(q("closed", "confirmed", "Đơn chốt")) } },
                { m -> KpiCard(MI.orders, C.good, "Tổng đơn hàng", Fmt.int(t["orders"].d), Fmt.delta(t["orders"].d, p?.get("orders")?.dn)?.let { "$it so với tháng trước" }, modifier = m) { nav.push(q("", "created", "Đơn tạo")) } },
            ))
            val o = t["orders"].d.coerceAtLeast(1.0)
            val dl = t["groups"]["delivered"]["orders"].d; val pr = t["groups"]["confirmed"]["orders"].d + t["groups"]["shipping"]["orders"].d + t["groups"]["new"]["orders"].d; val cn = t["groups"]["cancelled"]["orders"].d
            GridN(3, listOf(
                { m -> SmallStat(Icons.Filled.CheckCircle, C.good, "Đơn đã giao", Fmt.int(dl), dl / o * 100, m) { nav.push(q("delivered", "created", "Đơn đã giao")) } },
                { m -> SmallStat(MI.time, C.warn, "Đơn đang xử lý", Fmt.int(pr), pr / o * 100, m) { nav.push(q("confirmed", "created", "Đang xử lý")) } },
                { m -> SmallStat(MI.cancelled, C.bad, "Đơn hủy", Fmt.int(cn), t["cancelRatio"].dn ?: (cn / o * 100), m) { nav.push(q("cancelled", "created", "Đơn hủy")) } },
            ))
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) { T("Xu hướng doanh thu", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Box(Modifier.size(7.dp).clip(CircleShape).background(C.good.copy(alpha = .35f))); T(" $prevLabel  ", 9.sp, color = C.inkSoft); Box(Modifier.size(7.dp).clip(CircleShape).background(C.good)); T(" $label", 9.sp, color = C.inkSoft) }
                fun cum(s: List<J>): List<Pair<String, Double>> { var acc = 0.0; return byDay(s, "closedNet").map { acc += it.second; it.first.takeLast(2) to acc } }
                val cur = cum(d.data!!["current"]["series"].list); val prv = cum(d.data!!["compare"]["series"].list)
                DualLine(prv, cur)
            }
            Grid2(listOf(
                { m -> Panel(10.dp, m) { T(Fmt.vnd(p?.get("closedNet")?.d ?: 0.0), 13.sp, FontWeight.Bold, maxLines = 1); T(prevLabel, 9.sp, color = C.inkSoft); T("Doanh thu chốt", 8.sp, color = C.inkSoft) } },
                { m -> Panel(10.dp, m) { T(Fmt.vnd(t["closedNet"].d), 13.sp, FontWeight.Bold, maxLines = 1); T(label, 9.sp, color = C.inkSoft); T("Doanh thu chốt", 8.sp, color = C.inkSoft) } },
            ))
            val g = Fmt.delta(t["closedNet"].d, p?.get("closedNet")?.dn)
            Panel(10.dp) { Row(verticalAlignment = Alignment.CenterVertically) { T("Tăng trưởng doanh thu chốt", 12.sp, modifier = Modifier.weight(1f)); T(g ?: "—", 16.sp, FontWeight.Bold, if (g?.startsWith("-") == true) C.bad else C.good) } }
            PosBreakdown(d.data!!["current"]["byPos"].list, t["closedNet"].d) { nav.push(Screen.Orders(OrderQuery(a, b, listOf(it), "closed", basis = "confirmed", title = Pos.name(it)))) }
            PrimaryButton("Xuất báo cáo", Icons.Filled.FileDownload) {
                val text = "BÁO CÁO ${label.uppercase()} · MEGATECH\nDoanh thu đơn chốt: ${Fmt.money(t["closedNet"].d)} (${g ?: "—"} so tháng trước)\nĐơn chốt: ${Fmt.int(t["closedOrders"].d)} · Đơn tạo: ${Fmt.int(t["orders"].d)}\nĐã giao: ${Fmt.int(dl)} · Hoàn: ${Fmt.int(t["groups"]["returned"]["orders"].d)} · Hủy: ${Fmt.int(cn)}\nGiá trị TB đơn: ${Fmt.money(t["averageOrder"].d)}\n" + d.data!!["current"]["byPos"].list.sortedByDescending { it["closedNet"].d }.joinToString("\n") { "- ${Pos.name(it["posId"].s)}: ${Fmt.money(it["closedNet"].d)} · ${Fmt.int(it["closedOrders"].d)} đơn" }
                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Xuất báo cáo"))
            }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.blue.copy(alpha = .08f)).padding(12.dp)) { Icon(Icons.Filled.Info, null, tint = C.blue); Spacer(Modifier.width(8.dp)); Column { T("Ghi chú & Định nghĩa số liệu", 12.sp, FontWeight.Bold); T("Doanh thu: tổng tiền hàng sau chiết khấu, chưa gồm phí vận chuyển. Đơn chốt tính theo giờ xác nhận lần đầu (như Pancake); đơn đã giao, đang xử lý, hủy tính theo ngày tạo đơn trong tháng.", 10.sp, color = C.inkSoft) } }
        } else if (d.error == null) { Thinking(); Skeleton() }
    }
}

@Composable fun SmallStat(icon: ImageVector, tint: Color, label: String, value: String, pct: Double?, modifier: Modifier, onClick: () -> Unit) {
    Panel(10.dp, modifier, onClick) { IconBox(icon, tint, 26.dp); T(label, 9.sp, color = C.inkSoft, maxLines = 1); Row(verticalAlignment = Alignment.Bottom) { Rolling(value, 15.sp); T(" (${Fmt.pct0(pct)})", 9.sp, color = C.inkSoft) } }
}

@Composable fun DualLine(a: List<Pair<String, Double>>, b: List<Pair<String, Double>>) {
    val maxV = ((a + b).maxOfOrNull { it.second } ?: 1.0).coerceAtLeast(1.0)
    val prog = remember(b) { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(b) { prog.animateTo(1f, androidx.compose.animation.core.tween(900)) }
    Box(Modifier.fillMaxWidth().height(150.dp)) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            val w = size.width; val h = size.height - 6; val n = (maxOf(a.size, b.size) - 1).coerceAtLeast(1)
            for (i in 0..4) { val y = 3 + h * i / 4; drawLine(Color(0x0D000000), androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(w, y), 2f) }
            fun pts(s: List<Pair<String, Double>>) = s.mapIndexed { i, p -> androidx.compose.ui.geometry.Offset(w * i / n, (3 + h * (1 - p.second / maxV)).toFloat()) }
            listOf(pts(a) to C.good.copy(alpha = .35f), pts(b) to C.good).forEach { (pp, c) ->
                if (pp.size > 1) { val cut = (pp.size * prog.value).toInt().coerceIn(1, pp.size); val path = androidx.compose.ui.graphics.Path().apply { moveTo(pp[0].x, pp[0].y); pp.take(cut).drop(1).forEach { lineTo(it.x, it.y) } }; drawPath(path, c, style = androidx.compose.ui.graphics.drawscope.Stroke(5f)) }
            }
            pts(b).lastOrNull()?.let { drawCircle(C.good, 7f, it) }
        }
        b.lastOrNull()?.let { Box(Modifier.align(Alignment.TopEnd).clip(RoundedCornerShape(5.dp)).background(C.brandDeep).padding(horizontal = 6.dp, vertical = 3.dp)) { T(Fmt.vnd(it.second), 9.sp, FontWeight.Bold, Color.White) } }
    }
    Row(Modifier.fillMaxWidth()) { val step = maxOf(1, b.size / 6); b.forEachIndexed { i, p -> if (b.size <= 8 || i % step == 0) T(p.first, 8.sp, color = C.inkSoft, modifier = Modifier.weight(1f)) } }
}

// ---------- Báo cáo tùy chỉnh ----------
val METRICS = listOf("closedNet" to "Doanh thu", "closedOrders" to "Số đơn hàng", "orders" to "Đơn tạo", "delivered" to "Giao thành công")
@Composable fun CustomReportScreen() {
    val nav = LocalNav.current; val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("megatech", 0) }
    var metrics by remember { mutableStateOf(prefs.getString("cr_metrics", "closedNet,closedOrders")!!.split(",").filter { it.isNotEmpty() }) }
    var groupBy by remember { mutableStateOf(prefs.getString("cr_group", "day")!!) }
    var dim by remember { mutableStateOf(prefs.getString("cr_dim", "time")!!) }
    var chart by remember { mutableStateOf(prefs.getString("cr_chart", "bar")!!) }
    var period by remember { mutableStateOf<Period>(Period.Month) }
    var pos by remember { mutableStateOf("") }
    var saved by remember { mutableStateOf(prefs.contains("cr_metrics")) }
    val main = metrics.firstOrNull() ?: "closedNet"
    val (a, b) = period.range
    val d = load(period.key, groupBy, pos) { Api.overview(a, b, if (pos.isEmpty()) emptyList() else listOf(pos), groupBy = groupBy, compare = "none") }
    fun fmt(v: Double) = if (main == "closedNet") Fmt.short(v) else Fmt.int(v)
    fun label(bk: String) = if (groupBy == "month") "T" + bk.takeLast(2) else bk.takeLast(5).let { "${it.takeLast(2)}/${it.take(2)}" }
    SubPage("Báo cáo tùy chỉnh", d.loading && d.data != null, { d.reload() }) {
        PageTitle("Báo cáo tùy chỉnh", "Tự chọn chỉ số, cách nhóm và kiểu hiển thị") { OutlineButton("↺ Đặt lại") { metrics = listOf("closedNet", "closedOrders"); groupBy = "day"; dim = "time"; chart = "bar"; period = Period.Month; pos = "" } }
        Panel {
            StepTitle(1, "Chọn chỉ số (Tối đa 3 chỉ số)")
            ChipRow {
                metrics.forEach { m -> Row(Modifier.clip(CircleShape).background(C.brandSoft).clickable { metrics = metrics - m }.padding(horizontal = 10.dp, vertical = 6.dp)) { T("${METRICS.first { it.first == m }.second}  ✕", 11.sp, FontWeight.SemiBold, C.good) } }
                if (metrics.size < 3) { var o by remember { mutableStateOf(false) }; Box { Chip("+ Thêm chỉ số", false) { o = true }; DropdownMenu(o, { o = false }) { METRICS.filter { it.first !in metrics }.forEach { (k, l) -> DropdownMenuItem({ T(l, 13.sp) }, { metrics = metrics + k; o = false }) } } } }
            }
        }
        Panel {
            StepTitle(2, "Chọn nhóm phân tích")
            ChipRow { listOf("time" to "Thời gian", "pos" to "Điểm bán (POS)", "staff" to "Nhân viên", "status" to "Trạng thái đơn").forEach { (k, l) -> Chip(l, dim == k) { dim = k } } }
            if (dim == "time") Segmented(groupBy, listOf("day" to "Ngày", "week" to "Tuần", "month" to "Tháng")) { groupBy = it }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { PeriodMenu(period, listOf(Period.Week, Period.Month, Period.Last, Period.D90)) { period = it }; PosSelectMenu(pos, modifier = Modifier.weight(1f)) { pos = it } }
        }
        Panel {
            StepTitle(3, "Chọn kiểu hiển thị")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(Triple("bar", "Biểu đồ cột", Icons.Filled.BarChart), Triple("line", "Biểu đồ đường", Icons.Filled.ShowChart), Triple("pie", "Biểu đồ tròn", Icons.Filled.PieChart), Triple("table", "Bảng tổng hợp", Icons.Filled.TableChart)).forEach { (k, l, ic) ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(if (chart == k) C.brandDeep else C.card).clickable { chart = k }.padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) { Icon(ic, null, tint = if (chart == k) Color.White else C.ink); T(l, 8.sp, FontWeight.SemiBold, if (chart == k) Color.White else C.ink, 1) }
            } }
        }
        val mName = METRICS.first { it.first == main }.second
        Row(verticalAlignment = Alignment.CenterVertically) { T("Xem trước báo cáo", 14.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); SelectMenu("$mName theo ${when (dim) { "time" -> if (groupBy == "day") "ngày" else if (groupBy == "week") "tuần" else "tháng"; "pos" -> "POS"; "staff" -> "nhân viên"; else -> "trạng thái" }}", metrics.map { it to METRICS.first { x -> x.first == it }.second }, modifier = Modifier.width(190.dp)) { m -> metrics = listOf(m) + (metrics - m) } }
        val r = d.data
        if (r != null) {
            val cur = r["current"]; val series = cur["series"].list
            val buckets = byDay(series, main)
            val pts: List<Pair<String, Double>> = when (dim) {
                "pos" -> cur["byPos"].list.map { Pos.short(it["posId"].s) to (if (main == "delivered") 0.0 else it[main].d) }.sortedByDescending { it.second }
                "staff" -> cur["byEmployee"].list.filter { it["sellerId"].s.isNotEmpty() }.map { it["name"].s to (if (main == "delivered") it["groups"]["delivered"]["orders"].d else it[main].d) }.sortedByDescending { it.second }.take(10)
                "status" -> STATUS_ITEMS.map { it.second to (if (main == "closedNet") cur["total"]["groups"][it.first]["net"].d else cur["total"]["groups"][it.first]["orders"].d) }
                else -> buckets.map { label(it.first) to it.second }
            }
            Panel {
                when (chart) {
                    "line" -> LineChart(pts, C.good)
                    "pie" -> Row(verticalAlignment = Alignment.CenterVertically) { val cols = listOf(C.good, C.blue, C.warn, C.purple, C.teal, C.bad, C.gray); Donut(pts.take(7).mapIndexed { i, p -> Triple(p.first, p.second, cols[i % 7]) }, fmt(pts.sumOf { it.second }), mName); Spacer(Modifier.width(12.dp)); Column { val tot = pts.sumOf { it.second }.coerceAtLeast(1.0); pts.take(7).forEachIndexed { i, p -> Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(8.dp).clip(CircleShape).background(cols[i % 7])); Spacer(Modifier.width(6.dp)); T(p.first, 10.sp, maxLines = 1, modifier = Modifier.weight(1f)); T(Fmt.pct0(p.second / tot * 100), 10.sp, FontWeight.Bold) } } } }
                    "table" -> pts.forEach { p -> Row(Modifier.padding(vertical = 4.dp)) { T(p.first, 12.sp, modifier = Modifier.weight(1f), maxLines = 1); T(if (main == "closedNet") Fmt.money(p.second) else Fmt.int(p.second), 12.sp, FontWeight.Bold) }; Divider0() }
                    else -> BarChart(pts, main == "closedNet") { i ->
                        if (dim == "time") { val bk = buckets[i].first; val s = if (groupBy == "month") "$bk-01" else bk; val e = when (groupBy) { "day" -> bk; "week" -> LocalDate.parse(bk).plusDays(6).toString(); else -> VNDate.monthEnd(bk) }
                            nav.push(Screen.Orders(OrderQuery(s, e, if (pos.isEmpty()) emptyList() else listOf(pos), if (main == "delivered") "delivered" else if (main == "orders") "" else "closed", basis = if (main == "orders" || main == "delivered") "created" else "confirmed", title = mName))) }
                    }
                }
                Row { T("■ $mName", 9.sp, color = C.good, modifier = Modifier.weight(1f)); Hint("Tổng ${fmt(if (main == "delivered") cur["total"]["groups"]["delivered"]["orders"].d else cur["total"][main].d)}") }
            }
        } else Skeleton(220.dp)
        PrimaryButton(if (saved) "Đã lưu báo cáo tùy chỉnh" else "Lưu báo cáo tùy chỉnh", if (saved) Icons.Filled.Check else Icons.Filled.Bookmark) { prefs.edit().putString("cr_metrics", metrics.joinToString(",")).putString("cr_group", groupBy).putString("cr_dim", dim).putString("cr_chart", chart).apply(); saved = true }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.warn.copy(alpha = .1f)).padding(12.dp)) { Icon(Icons.Filled.Lightbulb, null, tint = C.warn); Spacer(Modifier.width(8.dp)); T("Báo cáo tùy chỉnh được lưu trên máy này và mở lại đúng bộ lọc lần sau. Chạm một cột để xem đơn cấu thành.", 10.sp, color = C.inkSoft) }
    }
}
@Composable fun StepTitle(n: Int, text: String) { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(18.dp).clip(CircleShape).background(C.brandDeep), contentAlignment = Alignment.Center) { T("$n", 10.sp, FontWeight.Bold, Color.White) }; Spacer(Modifier.width(8.dp)); T(text, 13.sp, FontWeight.Bold) } }

// ---------- Tuyển dụng ----------
val RECRUIT_ORDER = listOf("new", "review", "booked", "interviewed", "passed", "trial", "failed", "rejected")
fun recruitTone(s: String) = when (s) { "new" -> Tone.Blue; "review", "booked" -> Tone.Orange; "interviewed" -> Tone.Purple; "passed", "trial" -> Tone.Green; "failed", "rejected" -> Tone.Red; else -> Tone.Gray }

@Composable fun RecruitScreen() {
    val nav = LocalNav.current; val ctx = LocalContext.current
    var tab by remember { mutableStateOf("overview") }
    var status by remember { mutableStateOf("") }
    var position by remember { mutableStateOf("") }
    var q by remember { mutableStateOf("") }
    var sortNew by remember { mutableStateOf(true) }
    val d = load(Unit) { Api.recruit() }
    SubPage("Tuyển dụng", d.loading && d.data != null, { d.reload() }) {
        PageTitle("Tuyển dụng", "Đúng người, đúng việc. Kiến tạo đội ngũ mạnh.")
        ChipRow { listOf("overview" to "Tổng quan", "list" to "Ứng viên", "positions" to "Vị trí tuyển", "interviews" to "Lịch phỏng vấn").forEach { (k, l) -> Chip(l, tab == k) { tab = k; if (k == "interviews") status = "booked" } } }
        ErrorLine(d.error.takeIf { d.data == null })
        val data = d.data ?: run { if (d.error == null) Thinking(); return@SubPage }
        val all = data["candidates"].list; val labels = data["statusLabels"]
        fun cnt(ks: List<String>) = all.count { it["status"].s in ks }.toDouble()
        val positions = all.mapNotNull { it["position"].sn }.distinct().sorted()
        if (tab == "overview" || tab == "positions") Grid2(listOf(
            { m -> StatCard(Icons.Filled.Badge, C.good, "Tổng ứng viên", Fmt.int(all.size), "Từ ${data["sources"].size} file Google Sheets", m) { status = ""; tab = "list" } },
            { m -> StatCard(Icons.Filled.HourglassTop, C.warn, "Đang xét duyệt", Fmt.int(cnt(listOf("new", "review"))), "Mới nhận + đang xem", m) { status = "review"; tab = "list" } },
            { m -> StatCard(Icons.Filled.RecordVoiceOver, C.blue, "Phỏng vấn", Fmt.int(cnt(listOf("booked", "interviewed"))), "Đã book + đã đến PV", m) { status = "booked"; tab = "list" } },
            { m -> StatCard(Icons.Filled.CheckCircle, C.good, "Đã tuyển", Fmt.int(cnt(listOf("passed", "trial"))), "Pass PV + thử việc", m) { status = "trial"; tab = "list" } },
        ))
        if (tab == "positions") Panel { T("Vị trí tuyển dụng", 14.sp, FontWeight.Bold); positions.forEach { p -> Row(Modifier.fillMaxWidth().clickable { position = p; tab = "list" }.padding(vertical = 6.dp)) { T(p, 12.sp, modifier = Modifier.weight(1f)); T("${all.count { it["position"].s == p }} ứng viên ›", 12.sp, FontWeight.Bold) }; Divider0() } }
        else {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) { T("Vị trí tuyển dụng", 10.sp, color = C.inkSoft); SelectMenu(position.ifEmpty { "Tất cả vị trí" }, listOf("" to "Tất cả vị trí") + positions.map { it to it }) { position = it } }
                Column(Modifier.weight(1f)) { T("Trạng thái", 10.sp, color = C.inkSoft); SelectMenu(if (status.isEmpty()) "Tất cả" else labels[status].sn ?: status, listOf("" to "Tất cả") + RECRUIT_ORDER.map { it to (labels[it].sn ?: it) }) { status = it } }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) { SearchBox(q, "Tìm theo tên, SĐT, email…", Modifier.weight(1f), { q = it }) {}; OutlineButton(if (sortNew) "↕ Mới nhất" else "↕ Tên A–Z") { sortNew = !sortNew } }
            val rows = all.filter { c -> (status.isEmpty() || c["status"].s == status) && (position.isEmpty() || c["position"].s == position) && (q.isEmpty() || listOf("name", "phone", "position", "handler").any { c[it].s.contains(q, true) }) }.let { r -> if (sortNew) r.sortedByDescending { it["updatedAt"].s } else r.sortedBy { it["name"].s } }
            SectionHead("Danh sách ứng viên", "${rows.size} người")
            rows.take(80).forEach { c ->
                Panel(12.dp, onClick = { nav.push(Screen.Candidate(c["id"].s)) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(c["name"].s, 42.dp, recruitTone(c["status"].s).color); Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) { T(c["name"].s, 13.sp, FontWeight.SemiBold, maxLines = 1); T(c["position"].sn ?: "Chưa ghi vị trí", 11.sp, color = C.inkSoft, maxLines = 1); T("Ứng tuyển: ${c["receivedOn"].sn ?: Fmt.day(c["firstSeenAt"].sn)}", 10.sp, color = C.inkSoft) }
                        Column(horizontalAlignment = Alignment.End) { Tag(labels[c["status"].s].sn ?: c["status"].s, recruitTone(c["status"].s)); T("Cập nhật ${Fmt.ago(c["updatedAt"].sn)}", 9.sp, color = C.inkSoft); if (c["cvViewable"].b) T("📄 Có CV", 9.sp, FontWeight.SemiBold, C.brand) }
                    }
                }
            }
            data["sources"][0]["fileId"].sn?.let { f -> PrimaryButton("Thêm ứng viên mới (mở Google Sheet)", Icons.Filled.Add) { openUrl(ctx, "https://docs.google.com/spreadsheets/d/$f") } }
        }
    }
}

@Composable fun CandidateScreen(id: String) {
    val ctx = LocalContext.current
    val d = load(id) { Api.candidate(id) }
    SubPage("Ứng viên") {
        ErrorLine(d.error)
        val x = d.data ?: run { if (d.error == null) Thinking(); return@SubPage }
        val c = x["candidate"]
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) { Avatar(c["name"].s, 56.dp, recruitTone(c["status"].s).color); Spacer(Modifier.width(12.dp)); Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { T(c["name"].s, 16.sp, FontWeight.Bold); T(listOfNotNull(c["position"].sn, c["team"].sn, c["birthYear"].sn?.let { "sinh $it" }).joinToString(" · "), 11.sp, color = C.inkSoft); Tag(c["status"].s, recruitTone(c["status"].s)) } }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                c["phone"].sn?.let { p -> ActionPill(Icons.Filled.Call, "Gọi", C.good, Modifier.weight(1f)) { openUrl(ctx, "tel:" + p.filter(Char::isDigit)) } }
                if (x["cv"]["viewable"].b) ActionPill(Icons.Filled.Description, "Xem CV", C.brand, Modifier.weight(1f)) { openPdf(ctx, Api.base + "/api/recruit/cv?id=" + Api.enc(id), x["cv"]["name"].sn ?: "cv.pdf") }
                else c["cvUrl"].sn?.let { u -> ActionPill(Icons.Filled.Link, "Link CV", C.brand, Modifier.weight(1f)) { openUrl(ctx, u) } }
            }
        }
        Panel {
            T("Thông tin trên sheet", 13.sp, FontWeight.Bold)
            c["handler"].sn?.let { KV("Người phụ trách", it) }; c["receivedOn"].sn?.let { KV("Ngày nhận", it) }; c["phone"].sn?.let { KV("SĐT", it) }
            c["data"].keys.sorted().forEach { k -> c["data"][k].sn?.takeIf { it.length < 400 }?.let { KV(k, it) } }
            KV("Nguồn", "${c["fileName"].s} › ${c["tab"].s} · dòng ${c["rowNum"].i}")
        }
        val ev = x["events"].list
        if (ev.isNotEmpty()) Panel {
            T("Lịch sử cập nhật", 13.sp, FontWeight.Bold)
            ev.forEach { e -> Column { T(when (e["kind"].s) { "new" -> "Ứng viên mới"; "delete" -> "Bị xóa khỏi sheet"; "cv" -> "Có CV"; else -> "Cập nhật" }, 12.sp, FontWeight.SemiBold); e["changes"].list.forEach { ch -> T("${ch["field"].s}: ${ch["from"].sn ?: "—"} → ${ch["to"].sn ?: "—"}", 10.sp, color = C.inkSoft) }; T(Fmt.dateTime(e["createdAt"].sn), 9.sp, color = C.inkSoft) } }
        }
    }
}

/** Tải CV (có phiên đăng nhập) về bộ nhớ đệm rồi mở bằng trình xem PDF của máy. */
fun openPdf(ctx: android.content.Context, url: String, name: String) {
    kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
        runCatching {
            val req = okhttp3.Request.Builder().url(url).build()
            val f = java.io.File(java.io.File(ctx.cacheDir, "exports").apply { mkdirs() }, name.replace("/", "_").ifEmpty { "cv.pdf" }.let { if (it.endsWith(".pdf")) it else "$it.pdf" })
            Api.http.newCall(req).execute().use { r -> f.outputStream().use { o -> r.body.byteStream().copyTo(o) } }
            val uri = androidx.core.content.FileProvider.getUriForFile(ctx, "vn.megatech.tonghoppos.files", f)
            ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}

// ---------- Nhật ký hoạt động ----------
@Composable fun AuditScreen() {
    var q by remember { mutableStateOf("") }
    var group by remember { mutableStateOf("") }
    var day by remember { mutableStateOf<Period>(Period.Today) }
    var items by remember { mutableStateOf<List<J>>(emptyList()) }
    var meta by remember { mutableStateOf<J?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    suspend fun load(next: Boolean) { runCatching { Api.audit(q, if (next) (meta?.get("page")?.i ?: 0) + 1 else 1, group, day.range.first, day.range.second) }.onSuccess { r -> items = if (next) items + r["items"].list else r["items"].list; meta = r } }
    LaunchedEffect(group, day.key, tick) { load(false) }
    SubPage("Nhật ký hoạt động") {
        PageTitle("Nhật ký hoạt động", "Minh bạch – An toàn – Trách nhiệm")
        ChipRow { Chip("Tất cả", group.isEmpty()) { group = "" }; meta?.get("groups")?.list?.forEach { g -> Chip(g["label"].s, group == g["id"].s) { group = g["id"].s } } }
        PeriodMenu(day, listOf(Period.Today, Period.Yesterday, Period.Week, Period.Month, Period.D90)) { day = it }
        SearchBox(q, "Tìm theo nội dung, người dùng…", Modifier.fillMaxWidth(), { q = it }) { tick++ }
        Panel(12.dp) {
            if (items.isEmpty()) T(if (meta == null) "Đang tải…" else "Không có sự kiện.", 12.sp, color = C.inkSoft)
            items.forEach { a ->
                val act = a["action"].s; val err = a["status"].i >= 400
                val (ic, c) = when { err -> Icons.Filled.Error to C.bad; act.startsWith("login") -> Icons.Filled.Login to C.good; act == "logout" -> Icons.Filled.Logout to C.inkSoft; act == "export" -> Icons.Filled.Description to C.blue; listOf("password", "totp", "passkey", "device").any { act.startsWith(it) } -> Icons.Filled.Lock to C.purple; act == "view" -> Icons.Filled.Visibility to C.gray; else -> Icons.Filled.Edit to C.warn }
                Row(Modifier.padding(vertical = 5.dp)) {
                    Box(Modifier.size(26.dp).clip(CircleShape).background(c), contentAlignment = Alignment.Center) { Icon(ic, null, tint = Color.White, modifier = Modifier.size(14.dp)) }
                    Spacer(Modifier.width(8.dp)); T(Fmt.dateTime(a["at"].sn).take(5), 11.sp, FontWeight.SemiBold, modifier = Modifier.width(40.dp).padding(top = 5.dp))
                    Column(Modifier.weight(1f)) { T(a["name"].sn ?: a["email"].sn ?: "Hệ thống", 12.sp, FontWeight.Bold); T(meta?.get("labels")?.get(act)?.sn ?: act, 11.sp); T(listOfNotNull(a["detail"].sn, a["target"].sn).joinToString(" · "), 10.sp, color = C.inkSoft, maxLines = 2); T("${a["ip"].sn?.let { "IP: $it" } ?: ""}${a["device"].sn?.let { " · $it" } ?: ""} · ${Fmt.day(a["at"].sn)}", 9.sp, color = C.inkSoft, maxLines = 1); if (err) Tag("Lỗi ${a["status"].i}", Tone.Red) }
                }
            }
            if (meta != null && items.size < (meta?.get("total")?.d ?: 0.0)) TextButton({ scope.launch { load(true) } }, Modifier.fillMaxWidth()) { T("Tải thêm", 12.sp, FontWeight.SemiBold, C.brand) }
        }
        meta?.let { T("${Fmt.int(it["total"].d)} sự kiện", 11.sp, color = C.inkSoft) }
    }
}
