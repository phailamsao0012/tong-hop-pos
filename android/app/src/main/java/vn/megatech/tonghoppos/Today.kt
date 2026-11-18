package vn.megatech.tonghoppos

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalTime
import java.time.format.DateTimeFormatter

// Android 1.0 bước A2: tab Trang chủ "Hôm nay" và trang Thông báo, như HomeFeed.swift / AlertsPage của iPhone 1.0.
// Mọi số lấy từ API web, app không tự tính cách khác; chọn POS nào chỉ tính POS đó (AppPos).

/** POS chung của cả app (như AppNav.pos của iPhone): "" = mọi POS được xem. */
object AppPos {
    var pos by mutableStateOf("")
    /** Kỳ và nhóm đơn chung của tab Tổng quan (AppNav.period / product của iPhone). */
    var period by mutableStateOf<Period>(Period.Month)
    var product by mutableStateOf("all")
    val ids: List<String> get() = if (pos.isEmpty()) emptyList() else listOf(pos)
}

/** Ẩn số tiền như app ngân hàng (con mắt ở đầu trang), nhớ trên máy. */
object HideMoney {
    private var read = false
    var on by mutableStateOf(false)
    fun load() { if (!read) { read = true; on = runCatching { AppLock.prefs.getBoolean("thp_hide_money", false) }.getOrDefault(false) } }
    fun toggle() { on = !on; runCatching { AppLock.prefs.edit().putBoolean("thp_hide_money", on).apply() } }
    fun money(n: Double) = if (on) "••• tr ₫" else Fmt.shortMoney(n)
    fun full(n: Double) = if (on) "••••••" else Fmt.money(n)
}

/** Màu từng bộ phận (Palette.sale / cskh / mkt / vandon của iPhone). */
object DeptColor {
    val sale get() = C.good
    val cskh get() = if (Theme.dark) Color(0xFF7CDDF2) else Color(0xFF00637A)
    val mkt get() = if (Theme.dark) Color(0xFFFDE68A) else Color(0xFF78350F)
    val vandon get() = if (Theme.dark) Color(0xFFDDD6FE) else Color(0xFF4C1D95)
    val orange get() = if (Theme.dark) Color(0xFFF2A07A) else Color(0xFFBB4F16)
}

/** Việc cần xử lý (AlertCenter của iPhone): đơn mới chưa chốt, khách quá 20 ngày, nhân sự chờ duyệt, POS lỗi / chậm đồng bộ. */
object Alerts {
    var unconfirmed by mutableDoubleStateOf(0.0)
    var over20 by mutableDoubleStateOf(0.0)
    var callsToday by mutableDoubleStateOf(0.0)
    var shift by mutableStateOf<J?>(null)
    var loaded by mutableStateOf(false)
    var failed by mutableStateOf(false)
    var failText by mutableStateOf<String?>(null)
    var updatedAt by mutableStateOf<String?>(null)
    /** Yêu cầu nhân sự chờ duyệt: phần Nhân sự (bước A7) gán. */
    var hrPending by mutableIntStateOf(0)
    private var lastAt = 0L
    private var askedPos: String? = null

    data class Item(val id: String, val icon: ImageVector, val tone: Color, val title: String, val sub: String, val route: Screen?, val label: String, val count: String)
    data class Group(val id: String, val title: String, val n: Int, val color: Color)

    private val canCare get() = Auth.canView("care")

    /** Bỏ qua nếu vừa hỏi chưa quá maxAge giây (0 = hỏi ngay). */
    suspend fun refresh(maxAge: Int = 60) {
        val now = System.currentTimeMillis()
        val p = AppPos.pos
        if (askedPos == p && now - lastAt < maxAge * 1000L) return
        lastAt = now; askedPos = p
        val ids = AppPos.ids
        val today = VNDate.today().toString()
        val care = canCare
        val (o, s, b) = coroutineScope {
            val o = async { runCatching { Api.overview(today, today, ids, compare = "none") } }
            val s = async { runCatching { Api.shift(today, "auto", ids) } }
            val b = async { if (care) runCatching { Api.cskhBadge(ids) } else null }
            Triple(o.await(), s.await(), b.await())
        }
        if (p != AppPos.pos) { lastAt = 0; return }
        val got = o.isSuccess || s.isSuccess || b?.isSuccess == true
        o.getOrNull()?.let { unconfirmed = it["current"]["total"]["groups"]["new"]["orders"].d }
        s.getOrNull()?.let { shift = it }
        b?.getOrNull()?.let { over20 = it["over20"].d; callsToday = it["callsToday"].d }
        if (!care) over20 = 0.0
        loaded = true; failed = !got
        failText = if (got) null else (o.exceptionOrNull() ?: s.exceptionOrNull())?.let { loadErrorText(it) } ?: "Không tải được"
        if (got) updatedAt = LocalTime.now(Fmt.tz).format(DateTimeFormatter.ofPattern("HH:mm")) else lastAt = 0
    }

    /** POS lỗi đồng bộ hoặc chậm quá 15 phút (đã chọn POS thì chỉ POS đó). */
    fun syncIssues(): List<J> = Sync.pos.filter { (AppPos.pos.isEmpty() || it["posId"].s == AppPos.pos) && (it["lastError"].sn != null || Sync.age(it) > 15) }

    fun groups(): List<Group> = buildList {
        add(Group("don", "Đơn hàng", unconfirmed.toInt(), DeptColor.orange))
        if (canCare) add(Group("cham", "Chăm sóc", over20.toInt(), DeptColor.cskh))
        add(Group("ns", "Nhân sự", hrPending, C.purple))
        add(Group("db", "Đồng bộ", syncIssues().size, C.warn))
    }

    private fun newOrders(): Screen? = if (Auth.canView("raw-orders")) VNDate.today().toString().let { d -> Screen.Orders(OrderQuery(d, d, AppPos.ids, "new", basis = "created", title = "Đơn mới chưa chốt")) } else null
    private fun syncRoute(): Screen? = if (Auth.canView("config")) Screen.Page("config") else null
    private fun issueNames(list: List<J>) = list.joinToString(", ") { Pos.short(it["posId"].s) }

    /** Việc đang có (Trang chủ, số trên chuông). */
    fun items(): List<Item> = buildList {
        if (unconfirmed > 0) add(Item("unconfirmed", Icons.Filled.PendingActions, C.bad, "${Fmt.int(unconfirmed)} đơn mới chưa chốt", "Tạo hôm nay · đang ở trạng thái Mới", newOrders(), "Đơn mới chưa chốt", Fmt.int(unconfirmed)))
        if (canCare && over20 > 0) add(Item("over20", Icons.Filled.PersonOff, DeptColor.orange, "${Fmt.int(over20)} khách quá 20 ngày chưa ghi chú", "CSKH · hôm nay đã ghi ${Fmt.int(callsToday)} cuộc gọi", Screen.Page("care"), "Khách quá 20 ngày chưa ghi chú", Fmt.int(over20)))
        if (hrPending > 0) add(Item("hr", Icons.Filled.Verified, C.purple, "$hrPending yêu cầu nhân sự chờ duyệt", "Phòng Nhân sự · thêm, đổi chức vụ, đổi trạng thái", null, "Yêu cầu nhân sự chờ duyệt", "$hrPending"))
        val issues = syncIssues()
        if (issues.isNotEmpty()) {
            val err = issues.any { it["lastError"].sn != null }
            add(Item("sync", Icons.Filled.Warning, if (err) C.bad else DeptColor.orange, "Đồng bộ ${if (err) "lỗi" else "chậm"}: ${issueNames(issues)}", "Kiểm tra ở khối Đồng bộ Pancake", syncRoute(), "Đồng bộ lỗi / chậm", issueNames(issues)))
        }
    }

    /** Hàng "Ưu tiên" ở trang Thông báo: luôn đủ các dòng theo quyền, dòng chưa có việc hiện số 0. */
    fun priority(): List<Item> = buildList {
        add(Item("unconfirmed", Icons.Filled.PendingActions, C.bad, "", "Tính theo ngày tạo đơn", newOrders(), "Đơn mới chưa chốt", Fmt.int(unconfirmed)))
        if (canCare) add(Item("over20", Icons.Filled.PersonOff, DeptColor.orange, "", "CSKH phụ trách · hôm nay đã ghi ${Fmt.int(callsToday)} cuộc gọi", Screen.Page("care"), "Khách quá 20 ngày chưa ghi chú", Fmt.int(over20)))
        add(Item("hr", Icons.Filled.Verified, C.purple, "", "Đổi phòng / team, chức vụ, trạng thái", null, "Yêu cầu nhân sự chờ duyệt", "$hrPending"))
        val issues = syncIssues()
        add(Item("sync", Icons.Filled.Warning, C.warn, "", "Kiểm tra ở khối Đồng bộ Pancake bên dưới", syncRoute(), "Đồng bộ lỗi / chậm", if (issues.isEmpty()) "0" else issueNames(issues)))
    }

    private val highShiftAlerts get() = shift?.get("alerts")?.list?.count { it["level"].s == "high" } ?: 0
    /** Số đỏ trên chuông: việc cần xử lý + cảnh báo đỏ trong ca. */
    fun count(): Int = items().size + highShiftAlerts
}

// ---------- Mảnh giao diện chung (khung Gemini) ----------

/** Đầu trang tiêu đề lớn: dòng chào nhỏ, tiêu đề, các nút vuông bên phải. */
@Composable fun BigHeader(title: String, greeting: String? = null, actions: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().background(C.cream).statusBarsPadding().padding(horizontal = 16.dp).padding(top = 10.dp, bottom = 6.dp), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) {
            if (greeting != null) T(greeting, 12.sp, FontWeight.Medium, C.inkSoft, 1)
            T(title, 28.sp, FontWeight.Bold, C.ink, 1)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = actions)
    }
}

/** Nút vuông bo góc ở đầu trang (làm mới, con mắt, chuông). */
@Composable fun SquareAction(icon: ImageVector, badge: Int = 0, dot: Color? = null, size: Dp = 44.dp, onClick: () -> Unit) {
    Box(Modifier.size(size)) {
        Box(Modifier.fillMaxSize().clip(RoundedCornerShape(14.dp)).background(C.card).border(1.dp, C.line, RoundedCornerShape(14.dp)).clickable { onClick() }, contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = C.ink, modifier = Modifier.size(size * .5f))
        }
        if (badge > 0) Box(Modifier.align(Alignment.TopEnd).offset(5.dp, (-5).dp).size(18.dp).clip(CircleShape).background(Color(0xFFD8424F)), contentAlignment = Alignment.Center) { T(if (badge > 9) "9+" else "$badge", 10.sp, FontWeight.Bold, Color.White) }
        else if (dot != null) Box(Modifier.align(Alignment.TopEnd).offset((-6).dp, 6.dp).size(7.dp).clip(CircleShape).background(dot))
    }
}

/** Thẻ Gemini: nền thẻ, viền mảnh, bo 18. */
@Composable fun Card18(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.card).border(1.dp, C.line, RoundedCornerShape(18.dp))
        .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
}

/** Ô nền nhạt trong thẻ. */
@Composable fun Cell(modifier: Modifier = Modifier, padding: Dp = 12.dp, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.cell).then(if (onClick != null) Modifier.clickable { onClick() } else Modifier).padding(padding), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
}

@Composable fun CardTitle(title: String, subtitle: String? = null, modifier: Modifier = Modifier) {
    Column(modifier) { T(title, 17.sp, FontWeight.SemiBold, C.ink); if (subtitle != null) T(subtitle, 12.sp, color = C.inkSoft) }
}

/** Nút vuông "i" / "›" ở góc thẻ. */
@Composable fun CornerSquare(icon: ImageVector, onClick: () -> Unit) {
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(C.cell).border(1.dp, C.line, RoundedCornerShape(12.dp)).clickable { onClick() }, contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = C.ink, modifier = Modifier.size(20.dp))
    }
}

/** Link xanh nhỏ ở góc thẻ ("Xem tất cả ›"). */
@Composable fun CornerLink(text: String, onClick: () -> Unit) {
    Row(Modifier.clickable { onClick() }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        T(text, 12.sp, FontWeight.SemiBold, C.brand); Icon(Icons.Filled.ChevronRight, null, Modifier.size(14.dp), tint = C.brand)
    }
}

/** Viên tăng / giảm so cùng giờ hôm qua. */
@Composable fun TrendPill(text: String, good: Boolean? = null) {
    val down = text.startsWith("-")
    val c = if (good ?: !down) C.good else C.bad
    Row(Modifier.clip(CircleShape).background(C.card).padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(if (down) Icons.AutoMirrored.Filled.TrendingDown else Icons.AutoMirrored.Filled.TrendingUp, null, Modifier.size(13.dp), tint = c)
        Spacer(Modifier.width(3.dp)); T(text, 12.sp, FontWeight.Bold, c, 1)
    }
}

/** Hai thanh so sánh: kỳ trước (nhạt) và giờ này (màu bộ phận), cùng thang. */
@Composable fun PairBars(prev: Double, prevText: String, prevLabel: String, cur: Double, curText: String, curLabel: String, tint: Color) {
    val max = maxOf(prev, cur).takeIf { it > 0 } ?: 1.0
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf(Triple(prevLabel, prevText, prev) to C.inkSoft.copy(alpha = .45f), Triple(curLabel, curText, cur) to tint).forEach { (r, color) ->
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row { T(r.first, 13.sp, FontWeight.SemiBold, modifier = Modifier.weight(1f)); T(r.second, 13.sp, FontWeight.Bold) }
                Box(Modifier.fillMaxWidth().height(7.dp).clip(CircleShape).background(tint.copy(alpha = .15f))) {
                    Box(Modifier.fillMaxWidth((r.third / max).coerceIn(0.0, 1.0).toFloat()).fillMaxHeight().clip(CircleShape).background(color))
                }
            }
        }
    }
}

/** Ô số nhỏ: nhãn, giá trị, dòng ghi chú. */
@Composable fun StatCell(label: String, value: String, note: String? = null, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(C.cell).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        T(label, 12.sp, color = C.inkSoft, maxLines = 1); T(value, 18.sp, FontWeight.Bold, maxLines = 1)
        if (note != null) T(note, 11.sp, color = C.inkSoft, maxLines = 1)
    }
}

/** Bảng chữ giải thích cách tính (nút "i"). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun InfoSheet(title: String, body: String, dismiss: () -> Unit) {
    SafeSheet(dismiss, containerColor = C.cream) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            T(title, 17.sp, FontWeight.Bold); Panel { T(body, 13.sp) }
        }
    }
}

/** Ghi vị trí một khối để lượt chụp giao diện (bản debug) cuộn tới. */
fun Modifier.anchor(map: MutableMap<String, Int>, id: String): Modifier = onGloballyPositioned { map[id] = it.positionInParent().y.toInt() }

/** Bản debug, lượt chụp giao diện: "cuon:<khối>" cuộn khối đó lên đầu trang. */
@Composable fun TourScroll(scroll: ScrollState, anchors: Map<String, Int>) {
    if (!BuildConfig.DEBUG || DebugTour.tour != "giaodien") return
    LaunchedEffect(DebugTour.tick) {
        val t = DebugTour.target
        if (t.startsWith("cuon:")) anchors[t.removePrefix("cuon:")]?.let { scroll.animateScrollTo(maxOf(0, it - 40)) }
    }
}

// ---------- Tab Trang chủ: Hôm nay ----------

private class TodayData(val ref: J?, val sale: J?, val cskh: J?, val mkt: J?, val vd: J?, val error: String?, val at: String)

private fun refPartOf(p: J): J = if (p["pancake"].isNull) p["web"] else p["pancake"]
private class RefTotals(val revenue: Double, val orders: Double, val fromWeb: Int)
private fun refTotals(rows: List<J>) = RefTotals(rows.sumOf { refPartOf(it)["total"]["revenue"].d }, rows.sumOf { refPartOf(it)["total"]["orders"].d }, rows.count { it["source"].s != "pancake" })

private fun hello(): String { val h = LocalTime.now(Fmt.tz).hour; return if (h < 11) "Chào buổi sáng," else if (h < 13) "Chào buổi trưa," else if (h < 18) "Chào buổi chiều," else "Chào buổi tối," }
private fun weekday(): String {
    val d = VNDate.today()
    val w = when (d.dayOfWeek) { DayOfWeek.MONDAY -> "Thứ Hai"; DayOfWeek.TUESDAY -> "Thứ Ba"; DayOfWeek.WEDNESDAY -> "Thứ Tư"; DayOfWeek.THURSDAY -> "Thứ Năm"; DayOfWeek.FRIDAY -> "Thứ Sáu"; DayOfWeek.SATURDAY -> "Thứ Bảy"; else -> "Chủ nhật" }
    return "$w %02d/%02d".format(d.dayOfMonth, d.monthValue)
}

@Composable fun TodayTab() {
    val nav = LocalNav.current
    LaunchedEffect(Unit) { HideMoney.load() }
    val canAny = { v: List<String> -> v.any { Auth.canView(it) } }
    val team = Auth.me?.get("team")?.sn ?: "all"
    val overviewApi = canAny(listOf("overview", "center", "monthly", "compare", "custom", "batches", "cskh-overview", "sale-overview"))
    val canRef = canAny(listOf("overview", "center", "cskh-overview", "sale-overview"))
    val showSale = team != "cskh" && overviewApi
    val showCskh = team != "sale" && overviewApi
    val canMkt = Auth.canView("mkt-roas")
    val canVd = Auth.canView("van-don")
    val day = VNDate.today().toString()
    val pos = AppPos.pos
    val ids = AppPos.ids
    val d = load(day, pos) {
        coroutineScope {
            launch { Sync.refresh() }
            launch { Alerts.refresh(0) }
            val r = async { if (canRef) runCatching { Api.pancakeRef(day, day, ids) } else null }
            val s = async { if (showSale) runCatching { Api.overview(day, day, ids, team = "sale") } else null }
            val c = async { if (showCskh) runCatching { Api.overview(day, day, ids, team = "cskh") } else null }
            val m = async { if (canMkt) runCatching { Api.mktAnalytics(day, day, ids) } else null }
            val v = async { if (canVd) runCatching { Api.vanDon(day, day, ids) } else null }
            val parts = listOf(s.await(), c.await(), m.await(), v.await())
            val err = parts.firstNotNullOfOrNull { it?.exceptionOrNull() }?.let { loadErrorText(it) }
            TodayData(r.await()?.getOrNull(), s.await()?.getOrNull(), c.await()?.getOrNull(), m.await()?.getOrNull(), v.await()?.getOrNull(), err,
                LocalTime.now(Fmt.tz).format(DateTimeFormatter.ofPattern("HH:mm")))
        }
    }
    val data = d.data
    val error = data?.error ?: d.error
    val posLimited = pos.isNotEmpty() || (!Auth.isOwner && (Auth.me?.get("posIds")?.strings ?: emptyList()).isNotEmpty())
    val posScope = if (pos.isNotEmpty()) "POS ${Pos.short(pos)}" else {
        val n = if (Auth.isOwner) 0 else (Auth.me?.get("posIds")?.strings?.size ?: 0)
        if (n == 0) "mọi POS" else "$n POS được cấp"
    }
    val scopeLine = "${posScope.replaceFirstChar { it.uppercase() }} · từ 0h đến ${data?.at ?: "giờ này"}"
    var info by remember { mutableStateOf<Pair<String, String>?>(null) }
    val scroll = rememberScrollState()
    val anchors = remember { mutableMapOf<String, Int>() }
    TourScroll(scroll, anchors)
    if (BuildConfig.DEBUG && DebugTour.tour == "giaodien") LaunchedEffect(DebugTour.tick) {
        when (DebugTour.target) { "thong-bao" -> if (nav.stack.isEmpty()) nav.push(Screen.Alerts); "ve" -> nav.pop() }
    }
    fun open(dept: String) { nav.push(Screen.Dept(dept)) }
    val refresh = { d.reload() }
    TabPage(refreshing = d.loading && data != null, onRefresh = refresh, scrollState = scroll, header = {
        BigHeader("Hôm nay", "${hello()} ${Auth.me?.get("displayName")?.sn ?: "MEGATECH"} · ${weekday()}") {
            SquareAction(Icons.Filled.Sync, dot = Sync.tone) { refresh() }
            SquareAction(if (HideMoney.on) Icons.Filled.VisibilityOff else Icons.Filled.Visibility) { HideMoney.toggle() }
            SquareAction(Icons.Filled.Notifications, badge = Alerts.count()) { nav.push(Screen.Alerts) }
        }
    }) {
        UnfilteredTeamNotice()
        // Dải phạm vi: "Mọi POS · từ 0h đến HH:mm · ● Đồng bộ OK".
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(C.card).border(1.dp, C.line, RoundedCornerShape(10.dp)).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            T(scopeLine, 13.sp, FontWeight.SemiBold, C.ink, 1, Modifier.weight(1f))
            Box(Modifier.size(7.dp).clip(CircleShape).background(Sync.tone)); Spacer(Modifier.width(6.dp)); T(Sync.title, 13.sp, FontWeight.SemiBold, Sync.tone, 1)
        }
        if (canRef) RevenueHero(data, d.loading, scopeLine) { info = it }
        if (showSale || showCskh || canMkt) Card18 {
            Row(verticalAlignment = Alignment.Top) {
                CardTitle("Theo bộ phận", "Xem riêng, không cộng lại · So cùng giờ hôm qua", Modifier.weight(1f))
                CornerSquare(Icons.Outlined.Info) { info = "Theo bộ phận" to deptInfo(posScope) }
            }
            if (error != null && data?.sale == null && data?.cskh == null) ErrorLine(error)
            fun team(o: J?) = o?.get("current")?.get("total")
            if (showSale) DeptLine("Sale", DeptColor.sale, team(data?.sale)?.get("closedNet")?.dn, data?.sale?.get("compare")?.get("total")?.get("closedNet")?.dn, team(data?.sale)?.let { "${Fmt.int(it["closedOrders"].d)} đơn chốt" }, "Hôm qua cùng giờ", data != null) { open("sale") }
            if (showCskh) DeptLine("CSKH", DeptColor.cskh, team(data?.cskh)?.get("closedNet")?.dn, data?.cskh?.get("compare")?.get("total")?.get("closedNet")?.dn, team(data?.cskh)?.let { "${Fmt.int(it["closedOrders"].d)} đơn chốt" }, "Hôm qua cùng giờ", data != null) { open("cskh") }
            if (canMkt) { val m = data?.mkt
                DeptLine("Marketing", DeptColor.mkt, m?.get("current")?.get("net")?.dn, m?.get("prev")?.get("net")?.dn, m?.let { "${Fmt.int(it["current"]["closed"].d)} đơn đã XN" }, if (m?.get("previous")?.get("cutoff")?.sn != null) "Hôm qua cùng giờ" else "Hôm qua", data != null) { open("mkt") } }
        }
        if (canMkt) Box(Modifier.anchor(anchors, "hom-nay-2")) { MktToday(data?.mkt, data != null, posLimited) { open("mkt") } }
        if (canVd) Box(if (canMkt) Modifier else Modifier.anchor(anchors, "hom-nay-2")) { VdToday(data?.vd, data != null) }
        Box(Modifier.anchor(anchors, "hom-nay-3")) { TodoCard() }
        Shortcuts()
        ShiftCard()
    }
    info?.let { (t, b) -> InfoSheet(t, b) { info = null } }
}

private fun deptInfo(posScope: String) = listOf(
    "Xem riêng, không cộng lại · so cùng giờ hôm qua.",
    "Sale\nTiền các đơn có người bán thuộc bộ phận Sale (theo web nhân sự, người có hậu tố SALE) chốt hôm nay: đơn vào Chờ xác nhận lần đầu từ 0h đến lúc tải số, trên $posScope. Đơn đang huỷ không tính; đơn hoàn vẫn tính. Tiền sau giảm giá và quà tặng, không cộng phí ship.",
    "CSKH\nNhư Sale, với người bán có hậu tố CSKH.",
    "Marketing\nTiền các đơn có Marketer được xác nhận lần đầu hôm nay, trên $posScope. Đơn MKT do Sale hoặc CSKH gọi chốt nên cũng có trong doanh thu của bộ phận đó; ba số xem riêng.",
).joinToString("\n\n")

/** Thẻ "DOANH THU HÔM NAY": vòng tỷ trọng theo POS, số lớn, đơn chốt, hôm qua cả ngày, ô từng POS. */
@Composable private fun RevenueHero(data: TodayData?, loading: Boolean, scopeLine: String, info: (Pair<String, String>) -> Unit) {
    val nav = LocalNav.current
    val ref = data?.ref
    val rows = ref?.get("current")?.list
    Card18 {
        val cur = rows?.let { refTotals(it) }
        val prev = ref?.get("previous")?.list?.let { refTotals(it) }
        val n = rows?.size ?: 0
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                T("DOANH THU HÔM NAY", 12.sp, FontWeight.Bold, C.inkSoft)
                if (cur != null) T(if (cur.fromWeb == 0) "Tổng thống kê Pancake · $n POS" else if (cur.fromWeb == n) "Web tự tính · $n POS" else "Pancake ${n - cur.fromWeb} POS + web tự tính ${cur.fromWeb} POS", 12.sp, color = C.inkSoft)
            }
            if (cur != null) CornerSquare(Icons.Outlined.Info) {
                val w = cur.fromWeb
                val src = if (w == 0) ". Cùng số anh thấy khi mở Thống kê Pancake từng POS." else "; ${if (w == n) "cả $w" else "$w"} POS chưa đọc được Pancake nên web tự tính từ đơn đã đồng bộ (tính cả đơn Chờ xác nhận nên phần đó có thể cao hơn Pancake)."
                info("Doanh thu hôm nay" to "${HideMoney.full(cur.revenue)}\n$scopeLine\n\nÔ \"Tổng cộng · Doanh thu\" trong Thống kê của Pancake, lấy ngày hôm nay ở từng POS rồi cộng lại ($n POS)$src Đơn chốt: ${Fmt.int(cur.orders)}.\nDoanh thu Sale, CSKH, MKT bên dưới là số riêng từng bộ phận, xem riêng, không cộng lại thành số này." + (prev?.let { "\n\nHôm qua cả ngày: ${HideMoney.full(it.revenue)}" } ?: ""))
            }
        }
        if (cur != null && rows != null) {
            Row(Modifier.fillMaxWidth().clickable(enabled = Auth.canView("overview")) { nav.push(Screen.Overview(AppPos.pos.ifEmpty { null })) }, verticalAlignment = Alignment.CenterVertically) {
                Donut(rows.map { Triple(Pos.short(it["posId"].s), refPartOf(it)["total"]["revenue"].d, posColor(it["posId"].s)) }, "$n POS", "${Fmt.int(cur.orders)} đơn", 96.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Rolling(HideMoney.money(cur.revenue), 32.sp)
                    T("${Fmt.int(cur.orders)} đơn chốt · $n POS", 12.sp, FontWeight.SemiBold)
                    if (prev != null) Row { T("Hôm qua cả ngày:", 12.sp, color = C.inkSoft, modifier = Modifier.weight(1f)); T(HideMoney.money(prev.revenue), 12.sp, FontWeight.SemiBold, C.inkSoft) }
                }
            }
            GridN(3, rows.map { p -> { m: Modifier ->
                Column(m.clip(RoundedCornerShape(12.dp)).background(C.cell).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(7.dp).clip(CircleShape).background(posColor(p["posId"].s))); Spacer(Modifier.width(4.dp)); T(Pos.short(p["posId"].s), 12.sp, FontWeight.Bold, maxLines = 1) }
                    T(HideMoney.money(refPartOf(p)["total"]["revenue"].d), 15.sp, FontWeight.Bold, maxLines = 1)
                    T("${Fmt.int(refPartOf(p)["total"]["orders"].d)} chốt", 12.sp, color = C.inkSoft)
                }
            } })
            if (cur.fromWeb > 0) WarnLine(if (cur.fromWeb == n) "Chưa đọc được thống kê Pancake; số web tính có thể cao hơn Pancake" else "${cur.fromWeb} POS chưa đọc được Pancake; phần web tính có thể cao hơn")
        } else if (data != null) WarnLine("Chưa đọc được số Tổng cộng của Pancake. Doanh thu từng bộ phận ở dưới.")
        else if (!loading || data == null) Skeleton(180.dp, border = false)
    }
}

@Composable fun WarnLine(text: String) {
    Row(verticalAlignment = Alignment.Top) { Icon(Icons.Filled.Warning, null, Modifier.size(16.dp).padding(top = 1.dp), tint = C.warn); Spacer(Modifier.width(6.dp)); T(text, 13.sp, color = C.warn) }
}

/** Một bộ phận trong thẻ Theo bộ phận: chấm màu, tên, số đơn, viên so cùng giờ hôm qua, số tiền; 2 thanh. */
@Composable private fun DeptLine(title: String, tint: Color, net: Double?, prev: Double?, note: String?, prevLabel: String, loaded: Boolean, open: () -> Unit) {
    Cell(onClick = open) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(tint)); Spacer(Modifier.width(6.dp))
            T(title, 16.sp, FontWeight.SemiBold)
            if (note != null) T(" · $note", 12.sp, color = C.inkSoft, maxLines = 1, modifier = Modifier.weight(1f, false))
            Spacer(Modifier.weight(1f).widthIn(min = 4.dp))
            if (net != null && !HideMoney.on) Fmt.delta(net, prev)?.let { TrendPill(it); Spacer(Modifier.width(6.dp)) }
            if (net != null) T(HideMoney.money(net), 18.sp, FontWeight.Bold, maxLines = 1)
            else if (!loaded) Box(Modifier.width(72.dp).height(20.dp).clip(RoundedCornerShape(6.dp)).background(C.line))
            else T("—", 18.sp, FontWeight.Bold, C.inkSoft)
        }
        if (net != null && prev != null && !HideMoney.on) PairBars(prev, Fmt.shortMoney(prev), prevLabel, net, Fmt.shortMoney(net), "Giờ này", tint)
    }
}

/** MKT hôm nay (cùng nguồn trang Marketing): số về, chi phí quảng cáo, chi phí mỗi số, mỗi đơn chốt. */
@Composable private fun MktToday(m: J?, loaded: Boolean, posLimited: Boolean, open: () -> Unit) {
    val c = m?.get("current")
    Card18 {
        Row(verticalAlignment = Alignment.Top) { CardTitle("MKT hôm nay", modifier = Modifier.weight(1f)); CornerSquare(Icons.Filled.ChevronRight) { open() } }
        if (c == null && !loaded) { Skeleton(110.dp, border = false); return@Card18 }
        fun v(x: Double?) = x?.let { HideMoney.money(it) } ?: "—"
        val cost = c?.get("cost")?.d ?: 0.0
        val split = "chi phí không chia POS"
        GridN(2, listOf(
            { md -> StatCell("Số về", c?.let { Fmt.int(it["phones"].d) } ?: "—", c?.let { "${Fmt.int(it["orders"].d)} đơn lên" }, md) },
            { md -> StatCell("Chi phí QC", if (c == null) "—" else if (cost > 0) HideMoney.money(cost) else "Chưa có", if (c == null) null else if (cost > 0) "Sheet · mọi POS" else "sheet chưa gửi", md) },
            { md -> StatCell("CP / số", if (posLimited) "—" else v(c?.get("costPerLead")?.dn), if (c != null && posLimited) split else null, md) },
            { md -> StatCell("CP / đơn", if (posLimited) "—" else v(c?.get("costPerClosed")?.dn), if (c != null && posLimited) split else null, md) },
        ), 10.dp)
    }
}

/** Vận đơn hôm nay: đơn chuyển đi, doanh số chuyển đi (không phải doanh thu, không cộng vào tổng công ty). */
@Composable private fun VdToday(vd: J?, loaded: Boolean) {
    val t = vd?.get("total")
    Card18 {
        CardTitle("Vận đơn hôm nay", "Tính riêng, không cộng vào tổng công ty")
        if (t == null || t.isNull) { if (!loaded) Skeleton(90.dp, border = false) else T("—", 18.sp, FontWeight.Bold, C.inkSoft); return@Card18 }
        Cell {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    T("Doanh số chuyển đi", 12.sp, color = C.inkSoft)
                    T("${Fmt.int(t["sent"].d)} đơn chuyển đi" + if (vd["sentBasis"].s == "sent") " · theo ngày gửi" else "", 12.sp, FontWeight.SemiBold)
                }
                T(HideMoney.money(t["sentNet"].d), 18.sp, FontWeight.Bold, maxLines = 1)
            }
        }
        Cell {
            val confirmed = maxOf(0.0, t["closed"].d - t["waiting"].d - t["failed"].d)
            Row(verticalAlignment = Alignment.Top) {
                T("Đơn vào Chờ xác nhận: ${Fmt.int(t["closed"].d)}", 12.sp, FontWeight.SemiBold, modifier = Modifier.weight(1f))
                T("Đã XN ${Fmt.int(confirmed)} · Chờ ${Fmt.int(t["waiting"].d)} · Không XN ${Fmt.int(t["failed"].d)}", 12.sp, align = TextAlign.End, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** Thẻ "Cần xử lý · N": 3 việc đầu, link "Xem tất cả" mở trang Thông báo. */
@Composable private fun TodoCard() {
    val nav = LocalNav.current
    val items = Alerts.items()
    Card18 {
        Row(verticalAlignment = Alignment.CenterVertically) { T("Cần xử lý · ${items.size}", 17.sp, FontWeight.SemiBold, modifier = Modifier.weight(1f)); CornerLink("Xem tất cả") { nav.push(Screen.Alerts) } }
        if (!Alerts.loaded && items.isEmpty()) Skeleton(44.dp, border = false)
        else if (items.isEmpty()) {
            if (Alerts.failed) ErrorLine("Chưa tải được việc cần xử lý · ${Alerts.failText ?: "Không tải được"}")
            else Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.CheckCircle, null, Modifier.size(16.dp), tint = C.good); Spacer(Modifier.width(6.dp)); T("Không có việc khẩn cấp lúc này.", 13.sp, color = C.inkSoft) }
        }
        items.take(3).forEach { it ->
            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).background(C.cell).then(it.route?.let { r -> Modifier.clickable { nav.push(r) } } ?: Modifier).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                T(it.title, 14.sp, FontWeight.SemiBold, maxLines = 2, modifier = Modifier.weight(1f))
                if (it.route != null) Icon(Icons.Filled.ChevronRight, null, Modifier.size(16.dp), tint = C.inkSoft)
            }
        }
    }
}

/** Lối tắt chức năng kiểu app ngân hàng: lưới 4 cột, theo quyền. */
@Composable private fun Shortcuts() {
    val nav = LocalNav.current
    val d = VNDate.today().toString()
    val items = buildList<Triple<String, Pair<ImageVector, Color>, Screen>> {
        if (Auth.canView("shift")) add(Triple("Trong ca", Icons.Filled.Schedule to C.good, Screen.Page("shift")))
        if (Auth.canView("raw-orders")) add(Triple("Đơn mới chưa chốt", Icons.Filled.HourglassTop to DeptColor.orange, Screen.Orders(OrderQuery(d, d, AppPos.ids, "new", basis = "created", title = "Đơn mới chưa chốt"))))
        if (Auth.canView("customers")) add(Triple("Tra khách", Icons.Filled.ContactPage to C.blue, Screen.Page("customers")))
        if (Auth.canView("overview")) add(Triple("Theo từng POS", Icons.Filled.Apartment to C.brand, Screen.Overview(AppPos.pos.ifEmpty { null })))
        if (Auth.canView("calls")) add(Triple("Cuộc gọi CSKH", Icons.Filled.Call to C.teal, Screen.Dept("cskh", "calls")))
        if (Auth.canView("batches")) add(Triple("Data Sale", Icons.Filled.Inbox to C.good, Screen.Dept("sale", "batches")))
        if (Auth.canView("monthly")) add(Triple("Báo cáo tháng", Icons.Filled.CalendarMonth to C.purple, Screen.Page("monthly")))
    }.take(8)
    if (items.isEmpty()) return
    Card18 {
        T("Lối tắt", 17.sp, FontWeight.SemiBold)
        GridN(4, items.map { (title, ic, route) -> { m: Modifier ->
            Column(m.heightIn(min = 64.dp).clip(RoundedCornerShape(12.dp)).background(C.cell).border(1.dp, C.line, RoundedCornerShape(12.dp)).clickable { nav.push(route) }.padding(vertical = 10.dp, horizontal = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Icon(ic.first, null, Modifier.size(20.dp), tint = ic.second)
                T(title, 11.sp, FontWeight.SemiBold, maxLines = 2, align = TextAlign.Center)
            }
        } }, 8.dp)
    }
}

/** Ca đang chạy: số đã nhận, đã chốt, chốt nóng, 3 người chốt nhiều nhất. */
@Composable private fun ShiftCard() {
    if (!Auth.canView("shift")) return
    val nav = LocalNav.current
    val s = Alerts.shift
    Card18 {
        Row(verticalAlignment = Alignment.CenterVertically) { T("Ca đang chạy", 17.sp, FontWeight.SemiBold, modifier = Modifier.weight(1f)); CornerLink("Xem ca") { nav.push(Screen.Page("shift")) } }
        if (s == null) { if (Alerts.loaded) T("Chưa đọc được số trong ca.", 13.sp, color = C.inkSoft) else Skeleton(90.dp, border = false); return@Card18 }
        Column(Modifier.clickable { nav.push(Screen.Page("shift")) }, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val t = s["total"]; val y = s["yesterday"]
            GridN(3, listOf(
                { m -> ShiftStat("Số đã nhận", Fmt.int(t["received"].d), Fmt.delta(t["received"].d, y["received"].dn), m) },
                { m -> ShiftStat("Số đã chốt", Fmt.int(t["closed"].d), Fmt.delta(t["closed"].d, y["closed"].dn), m) },
                { m -> ShiftStat("Chốt nóng", Fmt.pct(t["rate"].dn), null, m) },
            ), 8.dp)
            s["staff"].list.sortedByDescending { it["closed"].d }.take(3).forEachIndexed { i, p ->
                Row { T("${i + 1} · ${p["name"].s}", 14.sp, maxLines = 1, modifier = Modifier.weight(1f)); T("${Fmt.int(p["closed"].d)} chốt", 14.sp, FontWeight.Bold) }
            }
        }
    }
}

@Composable private fun ShiftStat(label: String, value: String, delta: String?, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(C.cell).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        T(label, 12.sp, color = C.inkSoft, maxLines = 1); T(value, 18.sp, FontWeight.Bold, maxLines = 1)
        if (delta != null) TrendPill(delta)
    }
}

// ---------- Trang Thông báo ----------

/** Trang Thông báo (chuông, "Xem tất cả"): cần xử lý, ưu tiên, trong ca, đồng bộ Pancake từng POS. */
@Composable fun AlertsScreen() {
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val scroll = rememberScrollState()
    val anchors = remember { mutableMapOf<String, Int>() }
    TourScroll(scroll, anchors)
    LaunchedEffect(Unit) { coroutineScope { launch { Sync.refresh() }; launch { Alerts.refresh(30) } } }
    fun refresh() { scope.launch { busy = true; coroutineScope { launch { Sync.refresh() }; launch { Alerts.refresh(0) } }; busy = false } }
    SubPage("Thông báo", busy, { refresh() }, actions = { SquareAction(Icons.Filled.Refresh, size = 40.dp) { refresh() } }, scrollState = scroll) {
        // CẦN XỬ LÝ: vòng "N nhóm", "N việc", 4 dòng đếm theo nhóm.
        val groups = Alerts.groups()
        Card18 {
            Row { T("CẦN XỬ LÝ", 12.sp, FontWeight.Bold, C.inkSoft, modifier = Modifier.weight(1f)); T(Alerts.updatedAt?.let { "Cập nhật $it" } ?: "Đang kiểm tra…", 12.sp, color = C.inkSoft) }
            if (!Alerts.loaded) Skeleton(72.dp, border = false)
            else Row(verticalAlignment = Alignment.CenterVertically) {
                val total = groups.sumOf { it.n }
                Donut(groups.map { Triple(it.title, it.n.toDouble(), it.color) }, "${groups.count { it.n > 0 }} nhóm", "", 84.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    T("$total việc", 30.sp, FontWeight.Bold)
                    groups.chunked(2).forEach { row ->
                        Row { row.forEach { g ->
                            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(6.dp).clip(CircleShape).background(g.color)); Spacer(Modifier.width(4.dp))
                                T("${g.title}: ", 12.sp, color = C.inkSoft, maxLines = 1); T("${g.n}", 12.sp, FontWeight.Bold, maxLines = 1)
                            }
                        }; if (row.size == 1) Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
        // Ưu tiên: mỗi việc một hàng (tên, dòng phụ, số ›).
        Card18 {
            T("Ưu tiên", 17.sp, FontWeight.SemiBold)
            if (!Alerts.loaded) Skeleton(44.dp, border = false)
            else {
                if (Alerts.failed) ErrorLine("Chưa tải được việc cần xử lý · ${Alerts.failText ?: "Không tải được"}")
                Alerts.priority().forEach { it ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.cell).then(it.route?.let { r -> Modifier.clickable { nav.push(r) } } ?: Modifier).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { T(it.label, 15.sp, FontWeight.SemiBold); T(it.sub, 12.sp, color = C.inkSoft) }
                        Spacer(Modifier.width(8.dp)); T(it.count, 14.sp, FontWeight.Bold, maxLines = 1)
                        Icon(Icons.Filled.ChevronRight, null, Modifier.size(16.dp), tint = if (it.route != null) C.inkSoft else Color.Transparent)
                    }
                }
            }
        }
        // Trong ca: % chốt nóng, số đã nhận / đã chốt, cảnh báo trong ca, nút "Điều hành trong ca".
        Box(Modifier.anchor(anchors, "thong-bao-2")) {
            Card18 {
                T("Trong ca", 17.sp, FontWeight.SemiBold)
                val s = Alerts.shift
                if (s != null) {
                    T("${Fmt.pct(s["total"]["rate"].dn)} chốt nóng", 20.sp, FontWeight.Bold)
                    T("Số đã nhận: ${Fmt.int(s["total"]["received"].d)} · Đã chốt: ${Fmt.int(s["total"]["closed"].d)}", 12.sp, color = C.inkSoft)
                    s["alerts"].list.filter { !it["title"].s.lowercase().contains("đồng bộ") }.forEach { a ->
                        val c = if (a["level"].s == "high") C.bad else C.warn
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = .1f)).padding(10.dp)) {
                            Icon(Icons.Filled.Warning, null, Modifier.size(15.dp), tint = c); Spacer(Modifier.width(8.dp))
                            Column { T(a["title"].s, 13.sp, FontWeight.SemiBold); T(a["detail"].s, 12.sp, color = C.inkSoft) }
                        }
                    }
                } else if (Alerts.loaded) T("Chưa đọc được số trong ca.", 12.sp, color = C.inkSoft) else Skeleton(60.dp, border = false)
                if (Auth.canView("shift") || Auth.canView("center")) Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).background(C.cell).border(1.dp, C.line, RoundedCornerShape(12.dp)).clickable { nav.push(Screen.Page("shift")) },
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    T("Điều hành trong ca", 14.sp, FontWeight.SemiBold); Icon(Icons.Filled.ChevronRight, null, Modifier.size(15.dp), tint = C.ink)
                }
            }
        }
        // Đồng bộ Pancake: mỗi POS một hàng, nút Tải lại.
        Card18 {
            T("Đồng bộ Pancake", 17.sp, FontWeight.SemiBold)
            Pos.order.forEach { id -> SyncLine(id) }
            Box(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).background(C.brandDeep).clickable { scope.launch { Sync.refresh() } }, contentAlignment = Alignment.Center) {
                T("Tải lại", 14.sp, FontWeight.Bold, Color.White)
            }
        }
    }
}

/** Một POS ở khối Đồng bộ Pancake: dấu, tên, trạng thái, giờ, số bản ghi. */
@Composable private fun SyncLine(id: String) {
    val name = Pos.short(id)
    val p = Sync.pos.firstOrNull { it["posId"].s == id }
    val (title, detail, tone) = when {
        p == null -> Triple("? $name · Chưa có số", "Máy chủ chưa trả trạng thái POS này", C.inkSoft)
        p["lastError"].sn != null -> Triple("! $name · Lỗi đồng bộ", p["lastError"].s, C.bad)
        p["status"].s == "pending" -> Triple("↻ $name · Đang đồng bộ", "Đang cập nhật bản ghi mới · ${Fmt.int(p["records"].d)} bản ghi", C.blue)
        else -> {
            val age = Sync.age(p)
            val at = Fmt.parse(p["lastSyncAt"].sn)?.atZone(Fmt.tz)?.format(DateTimeFormatter.ofPattern("HH:mm")) ?: "—"
            val errs = if (p["errors24h"].d > 0) " · ${Fmt.int(p["errors24h"].d)} lỗi trong ngày" else ""
            if (age > 15) Triple("! $name · Chậm", "$at · chậm ${if (age < 60) "$age phút" else "${age / 60} giờ"}$errs", C.warn)
            else Triple("✓ $name · Đã cập nhật", "$at · ${Fmt.int(p["records"].d)} bản ghi$errs", C.good)
        }
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.cell).padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        T(title, 13.sp, FontWeight.SemiBold, tone, 1); T(detail, 12.sp, color = C.inkSoft, maxLines = 2)
    }
}
