package vn.megatech.tonghoppos

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

// Android 1.0 bước A3: tab Tổng quan như Home.swift / OverviewParts.swift / Departments.swift của iPhone 1.0.
// Một pill lọc chung (kỳ, POS, nhóm đơn, team) và 3 phần: Bốn bộ phận, Số liệu & KH, Theo POS.
// Mọi số lấy từ API web; chọn POS nào chỉ tính dữ liệu POS đó và nhân sự POS đó (anh Vũ).

private fun productName(p: String) = when (p) { "gentadox" -> "Gentadox"; "skgk" -> "SK + GK"; else -> "Tất cả" }

/** Dòng nhỏ trên tiêu đề lớn: "Tháng 11/2026" khi xem theo tháng, còn lại tên kỳ. */
private fun kicker(p: Period): String {
    val (a, b) = p.range
    return when (p) { Period.Month, Period.Last -> "Tháng ${b.substring(5, 7)}/${b.take(4)}"; else -> if (a == b) "${p.title} · ${Fmt.day(a)}" else p.title }
}

/** Hậu tố bộ phận Marketing ở cuối tên như máy chủ: "… MKT" hoặc "… MKT _n". */
private fun mktSuffix(name: String): Boolean {
    val w = name.lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val last = w.lastOrNull() ?: return false
    return last == "mkt" || (last == "_n" && w.size >= 2 && w[w.size - 2] == "mkt")
}

/** KPI tháng của một bộ phận: cộng KPI các team (Mọi POS) hoặc KPI từng người làm ở POS đang chọn; mốc tới hôm nay như lib/kpi/kpi-pace.ts. */
private class DeptKpi(val goal: Double, val pace: Double, val multiPos: Int = 0)

private fun kpiSum(rows: List<J>, day: Int, dim: Int): Pair<Double, Double> {
    var goal = 0.0; var pace = 0.0
    rows.forEach { t ->
        val days = t["workingDays"].d.takeIf { it > 0 } ?: dim.toDouble()
        goal += t["revenue"].d; pace += t["revenue"].d / days * minOf(day.toDouble(), days)
    }
    return goal to pace
}

private class KpiSource(val targets: List<J>, val teams: List<HrTeamItem>, val sale: List<J>?, val cskh: List<J>?, val all: List<J>?, val error: String?)

private fun deptKpi(src: KpiSource, dept: String, pos: String, day: Int, dim: Int): DeptKpi? {
    if (pos.isEmpty()) {
        val ids = src.teams.filter { it.dept == dept }.mapNotNull { it.id }.toSet()
        val mine = src.targets.filter { it["scope"].s == "team" && it["refId"].s in ids && it["revenue"].d > 0 }
        if (mine.isEmpty()) return null
        val (g, p) = kpiSum(mine, day, dim); return DeptKpi(g, p)
    }
    val staff = when (dept) { "sale" -> src.sale; "cskh" -> src.cskh; else -> src.all?.filter { mktSuffix(it["name"].s) } } ?: return null
    val inPos = staff.filter { pos in it["posIds"].strings }
    val ids = inPos.map { it["id"].s }.toSet()
    val mine = src.targets.filter { it["scope"].s == "employee" && it["refId"].s in ids && it["revenue"].d > 0 }
    if (mine.isEmpty()) return null
    val withGoal = mine.map { it["refId"].s }.toSet()
    val multi = inPos.count { it["id"].s in withGoal && it["posIds"].size > 1 }
    val (g, p) = kpiSum(mine, day, dim); return DeptKpi(g, p, multi)
}

private class DeptData(val sections: J, val mkt: J?)

@Composable fun OverviewTab() {
    val nav = LocalNav.current
    LaunchedEffect(Unit) { HideMoney.load() }
    var seg by rememberSaveable { mutableStateOf("departments") }
    val period = AppPos.period; val pos = AppPos.pos; val product = AppPos.product
    var filterOpen by remember { mutableStateOf(false) }
    val scroll = rememberScrollState()
    val anchors = remember { mutableMapOf<String, Int>() }
    TourScroll(scroll, anchors)
    LaunchedEffect(seg) { scroll.scrollTo(0) }
    if (BuildConfig.DEBUG && DebugTour.tour == "giaodien") LaunchedEffect(DebugTour.tick) {
        val t = DebugTour.target
        when {
            t.startsWith("seg:") -> seg = t.removePrefix("seg:")
            t == "loc-mo" -> filterOpen = true
            t == "loc-dong" -> filterOpen = false
            t.startsWith("pos:") -> AppPos.pos = t.removePrefix("pos:")
        }
    }
    val title = when (seg) { "metrics" -> "Số liệu theo kỳ"; "pos" -> "Tổng quan POS"; else -> "Tổng quan" }
    val (a, b) = period.range
    val ids = AppPos.ids
    val canMkt = Auth.canView("mkt-roas")
    // Bốn bộ phận: /api/reports/sections (và số Marketing cùng nguồn trang Marketing).
    val dept = load("bo-phan", period.key, pos, product) {
        coroutineScope {
            val m = async { if (canMkt) runCatching { Api.mktAnalytics(a, b, ids) }.getOrNull() else null }
            DeptData(Api.sections(a, b, ids, product), m.await())
        }
    }
    // Số liệu & KH, Theo POS: chỉ tải khi mở một trong hai phần (rồi giữ).
    var wantCenter by remember { mutableStateOf(false) }
    if (seg != "departments") wantCenter = true
    val applied = HrUnit.applies(TeamState.unit, "all")
    val center = load("trung-tam", wantCenter, period.key, pos, product, applied?.id) {
        if (!wantCenter) return@load null
        val today = VNDate.today().toString()
        coroutineScope {
            val o = async { Api.overview(a, b, ids, product = product, hrTeam = applied?.id) }
            val tr = async { runCatching { Api.overview(VNDate.add(-29).toString(), today, ids, compare = "none", product = product, hrTeam = applied?.id) }.getOrNull() }
            val sh = async { runCatching { Api.shift(today, "auto", ids) }.getOrNull() }
            val pl = async { runCatching { Api.pipeline(a, b, "confirmed", ids, "all", product) }.getOrNull() }
            val tg = async { runCatching { Api.targets(b.take(7)) }.getOrNull() }
            val rp = async { runCatching { Api.repurchase(a, b, "", ids, "all", product) }.getOrNull() }
            val bt = async { runCatching { Api.batches(a, b, ids) }.getOrNull() }
            val cu = async { runCatching { Api.customers("", "spend", "", 1, 1) }.getOrNull() }
            HomeData(o.await(), null, null, tr.await(), sh.await(), pl.await(), tg.await(), rp.await(), bt.await(), cu.await())
        }
    }
    val refreshing = if (seg == "departments") dept.loading && dept.data != null else center.loading && center.data != null
    TabPage(refreshing = refreshing, onRefresh = { dept.reload(); center.reload() }, scrollState = scroll, header = {
        BigHeader(title, kicker(period)) {
            SquareAction(if (HideMoney.on) Icons.Filled.VisibilityOff else Icons.Filled.Visibility) { HideMoney.toggle() }
        }
    }) {
        if (!Auth.canView("overview")) {
            Card18 { T("Chưa được cấp quyền", 16.sp, FontWeight.Bold); T("Tài khoản này chưa được xem Tổng quan POS. Các phần khác xem ở Hôm nay và Phòng ban.", 13.sp, color = C.inkSoft) }
            return@TabPage
        }
        ScopeFilterPill(period, pos, product) { filterOpen = true }
        Segmented(seg, listOf("departments" to "Bốn bộ phận", "metrics" to "Số liệu & KH", "pos" to "Theo POS")) { seg = it }
        when (seg) {
            "departments" -> {
                if (TeamState.unit != null) WarnLine("Bảng bộ phận chưa lọc theo team")
                if (dept.error != null && dept.data == null) ErrorLine(dept.error)
                DeptProgressCard(dept.data, period, pos)
                DeptBoards(dept.data, period, pos, product, dept.error != null, anchors)
                dept.data?.let { DeptFootnote(it.sections) }
            }
            "metrics" -> MetricsSegment(center, period, pos, product, anchors)
            else -> PosSegment(center, period, product)
        }
    }
    if (filterOpen) ScopeSheet { filterOpen = false }
}

// ---------- Pill lọc và bảng chọn ----------

@Composable private fun ScopeFilterPill(period: Period, pos: String, product: String, open: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.card).border(1.dp, C.line, RoundedCornerShape(14.dp)).clickable { open() }.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Tune, null, Modifier.size(18.dp), tint = C.brand); Spacer(Modifier.width(8.dp))
        val parts = listOf(period.title, if (pos.isEmpty()) "Mọi POS" else Pos.short(pos), productName(product)) + listOfNotNull(TeamState.unit?.shortName?.let { "team $it" })
        T(parts.joinToString(" · "), 14.sp, FontWeight.SemiBold, C.ink, 1, Modifier.weight(1f))
        Icon(Icons.Filled.KeyboardArrowDown, null, Modifier.size(20.dp), tint = C.inkSoft)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ScopeSheet(dismiss: () -> Unit) {
    SafeSheet(dismiss, containerColor = C.cream) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            T("Bộ lọc", 20.sp, FontWeight.Bold)
            Cell {
                T("Đang xem", 12.sp, color = C.inkSoft)
                T(listOf(AppPos.period.label, if (AppPos.pos.isEmpty()) "Mọi POS" else Pos.name(AppPos.pos), productName(AppPos.product)).joinToString(" · "), 14.sp, FontWeight.SemiBold)
            }
            T("Kỳ", 13.sp, FontWeight.Bold, C.inkSoft)
            ChipRow { Period.presets.forEach { p -> Chip(p.title, AppPos.period == p) { AppPos.period = p } } }
            T("POS", 13.sp, FontWeight.Bold, C.inkSoft)
            PosChipRow(AppPos.pos.ifEmpty { null }, label = null, allLabel = "Mọi POS") { AppPos.pos = it ?: "" }
            T("Nhóm đơn", 13.sp, FontWeight.Bold, C.inkSoft)
            ChipRow { listOf("all", "gentadox", "skgk").forEach { p -> Chip(productName(p), AppPos.product == p) { AppPos.product = p } } }
            HrTeamChip()
            PrimaryButton("Xong") { dismiss() }
        }
    }
}

// ---------- Bốn bộ phận ----------

@Composable private fun DeptProgressCard(data: DeptData?, period: Period, pos: String) {
    val today = VNDate.today()
    val ym = today.toString().take(7)
    val day = today.dayOfMonth; val dim = today.lengthOfMonth()
    val monthView = period == Period.Month
    val src = load("kpi", ym, pos.isEmpty()) {
        coroutineScope {
            val t = async { runCatching { Api.targets(ym) } }
            val l = async { runCatching { Api.hrTeams() } }
            val need = pos.isNotEmpty()
            val s = async { if (need) runCatching { Api.employees("sale") } else null }
            val c = async { if (need) runCatching { Api.employees("cskh") } else null }
            val e = async { if (need) runCatching { Api.employees() } else null }
            val parts = listOf(t.await(), l.await(), s.await(), c.await(), e.await())
            val err = parts.firstNotNullOfOrNull { it?.exceptionOrNull() }?.let { loadErrorText(it) }
            KpiSource(t.await().getOrNull()?.get("items")?.list ?: emptyList(), l.await().getOrNull() ?: emptyList(),
                s.await()?.getOrNull()?.list, c.await()?.getOrNull()?.list, e.await()?.getOrNull()?.list, err)
        }
    }.data
    Card18 {
        CardTitle("Tiến độ tháng · Ba bộ phận theo tháng")
        if (!monthView) T("Chọn kỳ Tháng này để so số đã đạt với KPI tháng.", 12.sp, color = C.inkSoft)
        val s = data?.sections
        if (s == null) { repeat(3) { Skeleton(44.dp, border = false) }; return@Card18 }
        val m = data.mkt?.get("current")
        val rows = listOf(
            Triple("sale", "Sale · ${Fmt.int(s["sale"]["orders"].d)} đơn chốt", s["sale"]["net"].d),
            Triple("cskh", "CSKH · ${Fmt.int(s["cskh"]["orders"].d)} đơn chốt", s["cskh"]["net"].d),
            Triple("mkt", "Marketing · ${Fmt.int(m?.get("closed")?.dn ?: s["mkt"]["orders"].d)} đơn XN", m?.get("net")?.dn ?: s["mkt"]["net"].d),
        )
        var multi = 0
        rows.forEach { (key, label, net) ->
            val k = src?.let { deptKpi(it, key, pos, day, dim) }
            if (k != null) multi += k.multiPos
            val tint = when (key) { "sale" -> DeptColor.sale; "cskh" -> DeptColor.cskh; else -> DeptColor.mkt }
            Cell(padding = 10.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(tint)); Spacer(Modifier.width(6.dp))
                    T(label, 14.sp, FontWeight.Bold, maxLines = 1, modifier = Modifier.weight(1f))
                    val done = if (monthView) HideMoney.money(net) else "—"
                    T(when { k == null -> "$done / —"; !monthView -> "— / ${HideMoney.money(k.goal)}"; else -> "$done / ${HideMoney.money(k.goal)} (${Fmt.pct0(net / k.goal * 100)})" }, 14.sp, FontWeight.Bold, maxLines = 1)
                }
                if (k != null && monthView) Bar(minOf(1.0, net / k.goal), tint, 6.dp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    T("Mốc tới hôm nay: ${k?.let { HideMoney.money(it.pace) } ?: "—"}", 12.sp, color = C.inkSoft, modifier = Modifier.weight(1f))
                    if (k != null && monthView) {
                        val ok = net >= k.pace
                        Icon(if (ok) Icons.Filled.Check else Icons.Filled.ArrowDropDown, null, Modifier.size(14.dp), tint = if (ok) C.good else C.bad)
                        T(if (ok) "Đúng tiến độ" else "Chậm tiến độ", 12.sp, FontWeight.SemiBold, if (ok) C.good else C.bad)
                    } else if (k == null && src != null) T("Chưa giao KPI", 12.sp, color = C.inkSoft)
                }
            }
        }
        if (pos.isNotEmpty()) T("KPI của ${Pos.short(pos)} = cộng KPI từng người của POS này." + if (multi > 0) " $multi người làm nhiều POS: KPI người chưa chia theo POS nên đang tính đủ." else "", 12.sp, color = C.inkSoft)
        src?.error?.let { T("Chưa tải được KPI team: $it", 12.sp, color = C.warn) }
    }
}

private fun canOpenDept(d: String) = when (d) {
    "sale" -> Auth.canView("sale-overview") || Auth.canView("overview")
    "cskh" -> Auth.canView("cskh-overview") || Auth.canView("overview")
    "mkt" -> Auth.canView("mkt-roas")
    else -> false
}

/** Khung một bảng bộ phận: tên, (i), số lớn trái, ghi chú phải, các ô bên dưới. */
@Composable private fun DeptBoard(title: String, heroMoney: Double?, heroNote: String, definition: String?, caption: String? = null, compactHero: Boolean = false, onClick: (() -> Unit)?, tiles: @Composable ColumnScope.() -> Unit) {
    var info by remember { mutableStateOf(false) }
    Card18(onClick = onClick) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                T(title, 17.sp, FontWeight.SemiBold)
                if (caption != null) T(caption, 12.sp, color = C.inkSoft)
            }
            if (compactHero && heroMoney != null) { T(HideMoney.money(heroMoney), 18.sp, FontWeight.Bold, maxLines = 1); Spacer(Modifier.width(8.dp)) }
            if (definition != null) CornerSquare(Icons.Outlined.Info) { info = true }
        }
        if (!compactHero) Row(verticalAlignment = Alignment.Bottom) {
            Rolling(heroMoney?.let { HideMoney.money(it) } ?: "—", 30.sp)
            Spacer(Modifier.weight(1f).widthIn(min = 6.dp))
            T(heroNote, 12.sp, FontWeight.SemiBold, C.ink, 2, align = TextAlign.End)
        }
        tiles()
    }
    if (info && definition != null) InfoSheet(title, definition) { info = false }
}

/** Ô gọn trong bảng: nhãn nhỏ, số, dòng phụ. */
@Composable private fun BoardCell(label: String, value: String?, note: String? = null, modifier: Modifier = Modifier, extra: (@Composable () -> Unit)? = null) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(C.cell).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        T(label, 12.sp, color = C.inkSoft, maxLines = 1)
        if (value != null) T(value, 15.sp, FontWeight.Bold, maxLines = 1)
        extra?.invoke()
        if (note != null) T(note, 11.sp, color = C.inkSoft, maxLines = 2)
    }
}

/** Viên tỷ lệ: Sale chốt dưới 40% đỏ; hoàn ≥7% đỏ, ≥5% vàng, dưới 5% xanh. */
@Composable fun RateChip(rate: Double?, kind: String) {
    val level = when {
        rate == null -> -1
        kind == "close" -> if (rate < 40) 2 else 0
        else -> if (rate >= 7) 2 else if (rate >= 5) 1 else 0
    }
    val ink = when (level) { 2 -> C.bad; 1 -> C.warn; 0 -> C.good; else -> C.inkSoft }
    val fill = when (level) { 2 -> C.badSoft; 1 -> C.warnSoft; 0 -> C.good.copy(alpha = .14f); else -> C.cell }
    Box(Modifier.clip(CircleShape).background(fill).padding(horizontal = 8.dp, vertical = 3.dp)) { T(Fmt.pct(rate), 13.sp, FontWeight.Bold, ink, 1) }
}

private fun vanDonDefinition(sent: Boolean) = if (sent)
    "Vận đơn tính riêng, không cộng vào tổng công ty. Đơn chuyển đi = đơn giao cho đơn vị vận chuyển trong kỳ, theo ngày gửi hàng lần đầu (đã gửi, đã nhận, đã thu tiền, hoàn): đơn vào Chờ xác nhận từ kỳ trước mà trong kỳ mới gửi thì tính vào kỳ này. Doanh số chuyển đi = tiền các đơn đó, sau giảm giá, không cộng phí ship, không cộng vào tổng công ty. Đã nhận, hoàn (đang hoàn, hoàn một phần, đã hoàn), giá trị hoàn, tỷ lệ hoàn theo số đơn và theo giá trị tính trên các đơn chuyển đi đó; kỳ ngắn thì tỷ lệ hoàn còn thấp vì đơn mới gửi chưa kịp hoàn. Đơn vào Chờ xác nhận, đã xác nhận, không xác nhận được vẫn theo ngày vào Chờ xác nhận lần đầu."
else "Vận đơn tính riêng, không cộng vào tổng công ty. Đơn vào Chờ xác nhận trong kỳ (Sale, CSKH đưa sang, theo ngày vào Chờ xác nhận lần đầu), xét trạng thái hiện tại. Đơn chuyển đi = đã giao cho đơn vị vận chuyển (đã gửi, đã nhận, đã thu tiền, hoàn); doanh số chuyển đi = tiền các đơn đó, sau giảm giá, không cộng phí ship, không cộng vào tổng công ty. Hoàn = đang hoàn, hoàn một phần, đã hoàn; giá trị hoàn = tiền các đơn hoàn. Tỷ lệ hoàn theo số đơn và theo giá trị."

@Composable private fun DeptBoards(data: DeptData?, period: Period, pos: String, product: String, failed: Boolean, anchors: MutableMap<String, Int>) {
    val nav = LocalNav.current
    val s = data?.sections
    if (s == null) { if (!failed) repeat(4) { Skeleton(150.dp) }; return }
    val defs = s["definitions"]
    fun open(d: String): (() -> Unit)? = if (canOpenDept(d)) ({ nav.push(Screen.Dept(d)) }) else null
    val gap = Arrangement.spacedBy(8.dp)
    // Sale
    val sale = s["sale"]
    DeptBoard("Doanh thu · Sale", sale["net"].d, "", defs["Sale"].sn, onClick = open("sale")) {
        Row(horizontalArrangement = gap) {
            BoardCell("Đơn chốt", "${Fmt.int(sale["orders"].d)} đơn", "chờ XN + đã XN", Modifier.weight(1f))
            BoardCell("Tỷ lệ chốt", null, "${Fmt.int(sale["closedNow"].d)} ÷ ${Fmt.int(sale["created"].d)}", Modifier.weight(1f)) { RateChip(sale["rate"].dn, "close") }
            BoardCell("AOV", if (sale["orders"].d > 0) HideMoney.money(sale["net"].d / sale["orders"].d) else "—", "doanh thu ÷ đơn chốt", Modifier.weight(1f))
        }
    }
    // CSKH
    val c = s["cskh"]
    DeptBoard("CSKH", c["net"].d, "${Fmt.int(c["orders"].d)} đơn chốt · AOV ${c["aov"].dn?.let { HideMoney.money(it) } ?: "—"}", defs["CSKH"].sn, onClick = open("cskh")) {
        Row(horizontalArrangement = gap) {
            BoardCell("Tự upsell", "${Fmt.int(c["self"]["orders"].d)} đơn · ${HideMoney.money(c["self"]["net"].d)}", modifier = Modifier.weight(1f))
            BoardCell("Từ MKT", "${Fmt.int(c["fromMkt"]["orders"].d)} đơn · ${HideMoney.money(c["fromMkt"]["net"].d)}", modifier = Modifier.weight(1f))
        }
    }
    // Marketing
    val posLimited = pos.isNotEmpty() || (!Auth.isOwner && (Auth.me?.get("posIds")?.strings ?: emptyList()).isNotEmpty())
    val a = data.mkt?.get("current")
    Box(Modifier.anchor(anchors, "bo-phan-2")) {
        if (a != null && !a.isNull) {
            DeptBoard("Marketing", a["net"].d, "${Fmt.int(a["closed"].d)} đơn đã xác nhận", defs["MKT"].sn, onClick = open("mkt")) {
                val r = !posLimited
                val split = "chi phí không chia POS"
                Row(horizontalArrangement = gap) {
                    BoardCell("ROAS", if (r) a["roas"].dn?.let { Fmt.dec2(it) } ?: "—" else "—", if (r) null else split, Modifier.weight(1f))
                    BoardCell("Chi phí QC", if (a["cost"].d > 0) HideMoney.money(a["cost"].d) else "—", if (a["cost"].d > 0) (if (r) null else "của mọi POS") else "chưa có số liệu", Modifier.weight(1f))
                }
                Row(horizontalArrangement = gap) {
                    BoardCell("Chi phí / số", if (r) a["costPerLead"].dn?.let { HideMoney.money(it) } ?: "—" else "—", if (r) null else split, Modifier.weight(1f))
                    BoardCell("Chi phí / đơn chốt", if (r) a["costPerClosed"].dn?.let { HideMoney.money(it) } ?: "—" else "—", if (r) null else split, Modifier.weight(1f))
                }
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.cell).padding(10.dp)) {
                    T("Số về MKT:", 12.sp, color = C.inkSoft, modifier = Modifier.weight(1f))
                    T("${Fmt.int(a["phones"].d)} số · ${Fmt.int(a["orders"].d)} đơn lên", 12.sp, FontWeight.SemiBold)
                }
                if (product != "all") T("MKT chưa lọc được theo nhóm đơn: số của mọi sản phẩm.", 12.sp, color = C.inkSoft)
            }
        } else {
            val m = s["mkt"]
            DeptBoard("Marketing", m["net"].d, "${Fmt.int(m["orders"].d)} đơn đã xác nhận", defs["MKT"].sn, onClick = open("mkt")) {
                Row(horizontalArrangement = gap) {
                    BoardCell("Đơn lên", Fmt.int(m["created"].d), "đơn MKT tạo trong kỳ", Modifier.weight(1f))
                    BoardCell("Tỷ lệ chốt", Fmt.pct(m["rate"].dn), "${Fmt.int(m["closedNow"].d)} ÷ ${Fmt.int(m["created"].d)} đơn lên", Modifier.weight(1f))
                }
                Row(horizontalArrangement = gap) {
                    BoardCell("Chi phí QC", m["cost"].dn?.let { HideMoney.money(it) } ?: "—", if (m["cost"].isNull) "chưa có số liệu" else if (posLimited) "mọi POS, mọi nhóm đơn" else "mọi nhóm đơn", Modifier.weight(1f))
                    BoardCell("AOV", m["aov"].dn?.let { HideMoney.money(it) } ?: "—", "doanh thu ÷ đơn XN", Modifier.weight(1f))
                }
            }
        }
    }
    // Vận đơn: đơn chuyển đi, doanh số chuyển đi (không phải doanh thu, không cộng vào tổng công ty).
    val sh = s["shipping"]
    val sent = s["sentBasis"].s == "sent"
    val days = s["period"].let { p -> runCatching { java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.parse(p["start"].s), java.time.LocalDate.parse(p["end"].s)).toInt() + 1 }.getOrNull() } ?: 99
    DeptBoard("Vận đơn", sh["total"]["net"].d, "", vanDonDefinition(sent), "Tính riêng, không cộng vào tổng công ty" + if (sent) " · theo ngày gửi hàng" else "", compactHero = true, onClick = null) {
        val rows = buildList {
            add("Sale" to sh["sale"]); add("CSKH" to sh["cskh"])
            if (sh["other"]["orders"].d > 0) add("Khác" to sh["other"])
            add("Tổng" to sh["total"])
        }
        ShipTable(rows)
        if (sent && days <= 14) T("Kỳ ngắn: đơn mới gửi chưa kịp hoàn nên tỷ lệ hoàn còn thấp.", 12.sp, color = C.inkSoft)
        val shown = s["productSegment"].sn ?: product
        if (shown != "all") T("Số của nhóm ${productName(shown)}. Trang Vận đơn chưa lọc được theo nhóm đơn: mở ra là số của mọi sản phẩm.", 12.sp, color = C.warn)
    }
}

/** Bảng đơn chuyển đi / hoàn theo bộ phận người lên đơn: cột đầu cố định, phần số cuộn ngang trong bảng. */
@Composable private fun ShipTable(rows: List<Pair<String, J>>) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row {
            Column(Modifier.width(72.dp)) {
                Box(Modifier.height(32.dp), contentAlignment = Alignment.CenterStart) { T("Bộ phận", 11.sp, FontWeight.Bold, C.inkSoft) }
                rows.forEach { (label, _) -> Box(Modifier.height(48.dp), contentAlignment = Alignment.CenterStart) { T(label, 13.sp, if (label == "Tổng") FontWeight.Bold else FontWeight.SemiBold) } }
            }
            Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                listOf("Chuyển đi", "Hoàn", "% hoàn đơn · giá trị").forEachIndexed { col, head ->
                    Column(horizontalAlignment = Alignment.End) {
                        Box(Modifier.height(32.dp), contentAlignment = Alignment.CenterEnd) { T(head, 11.sp, FontWeight.Bold, C.inkSoft, 1) }
                        rows.forEach { (label, r) ->
                            val bold = if (label == "Tổng") FontWeight.Bold else FontWeight.SemiBold
                            Box(Modifier.height(48.dp), contentAlignment = Alignment.CenterEnd) {
                                when (col) {
                                    0 -> Column(horizontalAlignment = Alignment.End) { T(Fmt.int(r["orders"].d), 13.sp, bold); T(HideMoney.money(r["net"].d), 11.sp, color = C.inkSoft) }
                                    1 -> Column(horizontalAlignment = Alignment.End) { T(Fmt.int(r["returned"].d), 13.sp, bold); T(HideMoney.money(r["returnedNet"].d), 11.sp, color = C.inkSoft) }
                                    else -> Row(verticalAlignment = Alignment.CenterVertically) { RateChip(r["rateOrders"].dn, "refund"); T(" · ", 12.sp, color = C.inkSoft); RateChip(r["rateNet"].dn, "refund") }
                                }
                            }
                        }
                    }
                }
            }
        }
        T("Số lớn: số đơn · số nhỏ: doanh số chuyển đi, giá trị hoàn", 11.sp, color = C.inkSoft, maxLines = 1)
    }
}

@Composable private fun DeptFootnote(s: J) {
    var info by remember { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            T("4 bộ phận", 15.sp, FontWeight.Bold)
            T("Chạm vào bộ phận để xem chi tiết" + (s["syncedAt"].sn?.let { " · số Pancake đồng bộ ${Fmt.time(it).take(5)}" } ?: ""), 12.sp, color = C.inkSoft)
        }
        CornerSquare(Icons.Outlined.Info) { info = true }
    }
    if (info) {
        val defs = s["definitions"]
        val body = listOf("Sale" to defs["Sale"].sn, "CSKH" to defs["CSKH"].sn, "MKT" to defs["MKT"].sn, "Vận đơn" to vanDonDefinition(s["sentBasis"].s == "sent"))
            .mapNotNull { (t, d) -> d?.let { "$t\n$it" } }.joinToString("\n\n")
        InfoSheet("Cách tính 4 bộ phận", body) { info = false }
    }
}

// ---------- Số liệu & KH ----------

private fun filterSuffix(pos: String, product: String) = buildString {
    if (pos.isNotEmpty()) append(" · " + Pos.short(pos))
    if (product != "all") append(" · " + productName(product))
    TeamState.unit?.let { append(" · team ${it.shortName}") }
}

@Composable private fun MetricsSegment(center: Loader<HomeData?>, period: Period, pos: String, product: String, anchors: MutableMap<String, Int>) {
    val nav = LocalNav.current
    val data = center.data
    val (a, b) = period.range
    val ids = AppPos.ids
    fun q(group: String, basis: String, title: String) = Screen.Orders(OrderQuery(a, b, ids, group, basis = basis, title = title, product = product))
    HrTeamNotice(TeamState.unit != null, "Tất cả")
    if (center.error != null && data == null) ErrorLine(center.error)
    val t = data?.today?.get("current")?.get("total")
    if (t == null || data == null) { if (center.error == null) { Skeleton(220.dp); Skeleton(120.dp) }; return }
    val p = data.today["compare"]["total"]
    // Hero "DOANH THU ĐƠN CHỐT": số lớn, biểu đồ trong kỳ, lưới 2×2, ô Chốt nóng.
    Card18 {
        Column(Modifier.clickable { nav.push(q("closed", "confirmed", "Đơn chốt")) }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                T("DOANH THU ĐƠN CHỐT", 12.sp, FontWeight.Bold, C.inkSoft, modifier = Modifier.weight(1f))
                if (!HideMoney.on) Fmt.delta(t["closedNet"].d, p["closedNet"].dn)?.let { TrendPill(it) }
            }
            Rolling(HideMoney.money(t["closedNet"].d), 32.sp)
            val s = data.today["current"]["series"].list
            if (s.isNotEmpty()) LineChart(byDay(s, "closedNet").map { Fmt.day(it.first).take(5) to it.second }, C.brand, 130.dp)
        }
        val dl = t["groups"]["delivered"]
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BoardCell("Đơn tạo mới (khách)", "${Fmt.int(t["orders"].d)} đơn", "${Fmt.int(t["customers"].d)} khách", Modifier.weight(1f).clickable { nav.push(q("", "created", "Đơn tạo mới")) })
            BoardCell("Đơn chốt (Tỷ lệ chốt)", "${Fmt.int(t["closedOrders"].d)} đơn", "Tỷ lệ chốt ${Fmt.pct(t.rate)} · ${t.rateFrac}", Modifier.weight(1f).clickable { nav.push(q("closed", "confirmed", "Đơn chốt")) })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BoardCell("Giá trị TB đơn (AOV)", HideMoney.money(t["averageOrder"].d), "GTTB đơn chốt", Modifier.weight(1f))
            BoardCell("Giao thành công", HideMoney.money(dl["net"].d), "${Fmt.int(dl["orders"].d)} đơn đã giao · theo ngày tạo", Modifier.weight(1f).clickable { nav.push(q("delivered", "created", "Giao thành công")) })
        }
        val shift = data.shift
        val shiftName = mapOf("morning" to "ca sáng", "afternoon" to "ca chiều", "evening" to "ca tối", "day" to "cả ngày")[shift?.get("shift")?.s] ?: "ca hiện tại"
        BoardCell("Chốt nóng $shiftName hôm nay", Fmt.pct(shift?.get("total")?.get("rate")?.dn), shift?.let { "${Fmt.int(it["total"]["closed"].d)} chốt / ${Fmt.int(it["total"]["received"].d)} số nhận" } ?: "—", Modifier.fillMaxWidth().clickable { nav.push(Screen.Page("shift")) })
    }
    if (TeamState.unit != null) T("Chốt nóng chưa lọc theo team.", 12.sp, color = C.inkSoft)
    // Mục tiêu tháng · POS
    Box(Modifier.anchor(anchors, "so-lieu-2")) {
        if (TeamState.unit != null) T("Mục tiêu tháng chưa tính theo team", 13.sp, color = C.inkSoft)
        else {
            val goal = data.targets?.get("items")?.list?.filter { it["scope"].s == "pos" && (pos.isEmpty() || it["refId"].s == pos) }?.sumOf { it["revenue"].d } ?: 0.0
            val day = b.takeLast(2).toIntOrNull() ?: 1
            val dim = VNDate.monthEnd(b).takeLast(2).toIntOrNull() ?: 30
            val net = t["closedNet"].d
            Card18(onClick = { nav.push(Screen.Page("cskh-kpi")) }) {
                Row(verticalAlignment = Alignment.CenterVertically) { T("Mục tiêu tháng · POS", 17.sp, FontWeight.SemiBold, modifier = Modifier.weight(1f)); CornerLink("Xem KPI") { nav.push(Screen.Page("cskh-kpi")) } }
                Cell(padding = 10.dp) {
                    Row { T("Đã đạt / Mục tiêu", 12.sp, color = C.inkSoft, modifier = Modifier.weight(1f)); T(if (goal > 0) "${HideMoney.money(net)} / ${HideMoney.money(goal)} (${Fmt.pct0(net / goal * 100)})" else "${HideMoney.money(net)} / —", 14.sp, FontWeight.Bold, maxLines = 1) }
                    if (goal > 0) { Bar(net / goal, C.brand, 7.dp); T("Mốc cần đạt tới hôm nay: ${HideMoney.money(goal * day / dim)}", 12.sp, color = C.inkSoft) }
                    else T("Chưa đặt mục tiêu (Cấu hình → Mục tiêu tháng)", 12.sp, color = C.inkSoft)
                }
            }
        }
    }
    PancakeRefBlock(a, b, ids)
    if (TeamState.unit != null) T("Số tham chiếu Pancake chưa lọc theo team.", 12.sp, color = C.inkSoft)
    CenterBlocks(period, "all", pos, product, data, skipTop = true)
}

// ---------- Theo POS ----------

@Composable private fun PosSegment(center: Loader<HomeData?>, period: Period, product: String) {
    val nav = LocalNav.current
    val r = center.data?.today
    if (center.error != null && r == null) { ErrorLine(center.error); return }
    if (r == null) { Skeleton(260.dp); return }
    val t = r["current"]["total"]
    val (a, b) = period.range
    Card18 {
        Row(verticalAlignment = Alignment.Top) {
            T("DOANH THU THEO POS", 12.sp, FontWeight.Bold, C.inkSoft, modifier = Modifier.weight(1f))
            if (!HideMoney.on) Fmt.delta(t["closedNet"].d, r["compare"]["total"]["closedNet"].dn)?.let { TrendPill(it) }
        }
        Box(Modifier.fillMaxWidth().clickable { nav.push(Screen.Orders(OrderQuery(a, b, AppPos.ids, "closed", basis = "confirmed", title = "Đơn chốt", product = product))) }) { Rolling(HideMoney.money(t["closedNet"].d), 32.sp) }
        r["current"]["byPos"].list.sortedByDescending { it["closedNet"].d }.forEach { row -> PosSumRow(row) { AppPos.pos = row["posId"].s } }
        T("${period.label}${if (AppPos.pos.isEmpty()) " · mọi POS" else ""}${filterSuffix(AppPos.pos, product)}", 12.sp, color = C.inkSoft)
    }
    val s = r["current"]["series"].list
    if (s.isNotEmpty()) Card18 {
        T("Trong kỳ", 17.sp, FontWeight.SemiBold)
        LineChart(byDay(s, "closedNet").map { Fmt.day(it.first).take(5) to it.second }, C.brand, 150.dp)
    }
    if (TeamState.unit != null) T("Số theo team đang chọn.", 12.sp, color = C.inkSoft)
}

/** Một hàng POS: "POS · 60 chốt / 90 đơn" và tiền bên phải; chạm lọc riêng POS đó. */
@Composable private fun PosSumRow(row: J, pick: () -> Unit) {
    val id = row["posId"].s
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).background(C.cell).clickable { pick() }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(posColor(id))); Spacer(Modifier.width(8.dp))
        T("${Pos.short(id)} · ${Fmt.int(row["closedOrders"].d)} chốt / ${Fmt.int(row["orders"].d)} đơn", 14.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
        T(HideMoney.money(row["closedNet"].d), 14.sp, FontWeight.Bold, maxLines = 1)
    }
}

