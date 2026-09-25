package vn.megatech.tonghoppos

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

data class SubTab(val id: String, val title: String)
val CSKH_TABS = listOf(SubTab("calls", "Cuộc gọi CSKH"), SubTab("care", "Khách theo nhân viên"), SubTab("repurchase", "Mua lại & Upsell"), SubTab("dormant", "Khách lâu chưa mua"), SubTab("cskh-kpi", "KPI CSKH"))

@Composable fun CskhTab() {
    val tabs = CSKH_TABS.filter { Auth.canView(it.id) }
    var page by remember { mutableStateOf(tabs.firstOrNull()?.id ?: "calls") }
    TabPage("POS · CSKH · Tăng trưởng cùng bạn") {
        ChipRow { tabs.forEach { Chip(it.title, page == it.id) { page = it.id } } }
        when (page) { "care" -> CareContent(); "repurchase" -> RepurchaseContent(); "dormant" -> DormantContent(); "cskh-kpi" -> KpiContent(); else -> CallsContent("cskh") }
    }
}

// ---------- Cuộc gọi ----------
@Composable fun CallsContent(team: String) {
    val nav = LocalNav.current
    val isCskh = team == "cskh"
    var period by remember { mutableStateOf<Period>(Period.Today) }
    var filter by remember { mutableStateOf("all") }
    var staffPick by remember { mutableStateOf("") }
    var dept by remember { mutableStateOf("") }
    var countBy by remember { mutableStateOf("customers") }
    val (a, b) = period.range
    val d = load(period.key, team) { coroutineScope { val x = async { Api.calls(a, b, team) }; val y = async { runCatching { Api.calls(period.previous.first, period.previous.second, team) }.getOrNull() }; x.await() to y.await() } }
    val care = load(filter, staffPick) { if (filter != "all" && isCskh) Api.care(staffPick, if (filter == "todo") "note_old" else "note_new", 0, "", 1) else null }
    PageTitle(if (isCskh) "Cuộc gọi CSKH" else "Cuộc gọi Sale", "Kết nối nhiều hơn. Khách hàng hài lòng hơn.", Icons.Filled.Call) { PeriodMenu(period, listOf(Period.Today, Period.Yesterday, Period.Week, Period.Month, Period.Last)) { period = it } }
    ErrorLine(d.error.takeIf { d.data == null })
    val data = d.data?.first
    if (data == null) { if (d.error == null) { Thinking(); Skeleton() }; return }
    val all = data["staff"].list
    val rows = all.filter { (dept.isEmpty() || it["department"].s == dept) && (staffPick.isEmpty() || it["authorId"].s == staffPick) }
    val notes = rows.sumOf { it["notes"].d }; val pn = d.data?.second?.get("staff")?.list?.filter { dept.isEmpty() || it["department"].s == dept }?.sumOf { it["notes"].d }
    val cust = rows.sumOf { it["customers"].d }; val assigned = rows.sumOf { it["assigned"].d }
    val orders = rows.sumOf { it["orders"].d }; val net = rows.sumOf { it["net"].d }
    val days = data["period"]["days"].strings; val nDays = days.size.coerceAtLeast(1).toDouble(); val people = rows.count { it["notes"].d > 0 }.coerceAtLeast(1).toDouble()
    val depts = all.mapNotNull { it["department"].sn }.distinct().sorted()
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.height(IntrinsicSize.Max)) {
        Panel(12.dp, Modifier.weight(1f).fillMaxHeight()) {
            Row(verticalAlignment = Alignment.CenterVertically) { IconBox(Icons.Filled.Call, C.good, 32.dp); Spacer(Modifier.width(10.dp)); Column { T("Tổng cuộc gọi ${if (period == Period.Today) "hôm nay" else period.title.lowercase()}", 10.sp, color = C.inkSoft, maxLines = 1); Rolling(Fmt.int(notes), 24.sp); Fmt.delta(notes, pn)?.let { T((if (it.startsWith("-")) "▼ " else "▲ ") + it, 10.sp, FontWeight.Bold, if (it.startsWith("-")) C.bad else C.good) }; T(if (period == Period.Today) "So với hôm qua" else "So với kỳ trước", 9.sp, color = C.inkSoft) } }
        }
        Panel(12.dp, Modifier.weight(1f).fillMaxHeight()) {
            Row(verticalAlignment = Alignment.CenterVertically) { Ring(if (assigned > 0) cust / assigned else 0.0, 56.dp, 6.dp); Spacer(Modifier.width(10.dp)); Column { T("Hoàn thành liên hệ", 10.sp, color = C.inkSoft); T("${Fmt.int(cust)}/${Fmt.int(assigned)} khách", 12.sp, FontWeight.SemiBold); T("đang cầm", 9.sp, color = C.inkSoft) } }
        }
    }
    Grid2(buildList {
        add { m: Modifier -> KpiCard(Icons.Filled.Call, C.good, "Cuộc gọi (ghi chú)", Fmt.int(notes), note = "${rows.count { it["notes"].d > 0 }} nhân viên · ${nDays.toInt()} ngày", modifier = m) }
        add { m: Modifier -> KpiCard(Icons.Filled.Groups, C.good, "Số khách đã gọi", Fmt.int(cust), note = "TB ${Fmt.int(cust / people / nDays)} khách/người/ngày", modifier = m) }
        add { m: Modifier -> KpiCard(Icons.Filled.PhoneForwarded, C.blue, "Cuộc gọi / người / ngày", Fmt.int(notes / people / nDays), note = "Trung bình toàn nhóm", modifier = m) }
        add { m: Modifier -> KpiCard(Icons.Filled.Verified, C.bad, "Đơn chốt (theo người bán)", Fmt.int(orders), note = "${Fmt.short(net)} ₫ · AOV ${Fmt.short(if (orders > 0) net / orders else 0.0)} ₫", modifier = m) { nav.push(Screen.Orders(OrderQuery(a, b, group = "closed", basis = "confirmed", title = "Đơn chốt ${if (isCskh) "CSKH" else "Sale"}", team = team))) } }
        if (!data["coverage"].isNull) add { m: Modifier -> KpiCard(Icons.Filled.Storage, C.gray, "Dữ liệu ghi chú đã gom", Fmt.int(data["coverage"]["notes"].d), note = "${Fmt.int(data["coverage"]["customers"].d)} khách · ${Fmt.dateTime(data["coverage"]["lastFetch"].sn)}", modifier = m) }
    })
    ChipRow {
        Chip("Tất cả", filter == "all") { filter = "all" }
        if (isCskh) { Chip("Chưa liên hệ", filter == "todo", care.data?.get("summary")?.get("neverNoted")?.i) { filter = "todo" }; Chip("Đã liên hệ", filter == "done") { filter = "done" } }
        var o1 by remember { mutableStateOf(false) }
        Box { Chip(if (staffPick.isEmpty()) "Nhân viên" else all.firstOrNull { it["authorId"].s == staffPick }?.get("name")?.s ?: "Nhân viên", staffPick.isNotEmpty(), chevron = true) { o1 = true }
            DropdownMenu(o1, { o1 = false }) { DropdownMenuItem({ T("Tất cả nhân viên", 13.sp) }, { staffPick = ""; o1 = false }); all.forEach { s -> DropdownMenuItem({ T(s["name"].s, 13.sp) }, { staffPick = s["authorId"].s; o1 = false }) } } }
        if (depts.size > 1) { var o2 by remember { mutableStateOf(false) }; Box { Chip(dept.ifEmpty { "Mọi bộ phận" }, dept.isNotEmpty(), chevron = true) { o2 = true }; DropdownMenu(o2, { o2 = false }) { DropdownMenuItem({ T("Mọi bộ phận", 13.sp) }, { dept = ""; o2 = false }); depts.forEach { x -> DropdownMenuItem({ T(x, 13.sp) }, { dept = x; o2 = false }) } } } }
        var o3 by remember { mutableStateOf(false) }
        Box { Chip(if (countBy == "customers") "Đếm: khách đã gọi" else "Đếm: cuộc gọi", false, chevron = true) { o3 = true }; DropdownMenu(o3, { o3 = false }) { DropdownMenuItem({ T("Đếm: khách đã gọi", 13.sp) }, { countBy = "customers"; o3 = false }); DropdownMenuItem({ T("Đếm: cuộc gọi", 13.sp) }, { countBy = "notes"; o3 = false }) } }
    }
    if (days.isNotEmpty()) Panel {
        Row { T("Theo ngày", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint(if (countBy == "customers") "Số khách đã gọi" else "Số cuộc gọi") }
        BarChart(days.map { day -> Fmt.day(day).take(5) to rows.sumOf { it["byDay"][day][countBy].d } })
    }
    if (filter == "all") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            T("Theo nhân viên · ${rows.size} người", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f))
            ExportButton("cuoc-goi-${if (isCskh) "cskh" else "sale"}-$a-$b", listOf("Nhân viên", "Bộ phận", "Cuộc gọi", "Khách đã gọi", "Đơn chốt", "Doanh thu", "Data đang cầm", "Ngày hoạt động")) { rows.map { listOf(it["name"].s, it["department"].s, Fmt.int(it["notes"].d), Fmt.int(it["customers"].d), Fmt.int(it["orders"].d), Fmt.int(it["net"].d), Fmt.int(it["assigned"].d), Fmt.int(it["activeDays"].d)) } }
        }
        Panel(0.dp) {
            val list = rows.sortedByDescending { it[countBy].d }
            val maxN = (list.maxOfOrNull { it[countBy].d } ?: 1.0).coerceAtLeast(1.0)
            list.forEachIndexed { i, s ->
                Column(Modifier.clickable { nav.push(Screen.Orders(OrderQuery(a, b, group = "closed", sellerId = s["authorId"].s, basis = "confirmed", title = s["name"].s))) }.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(s["name"].s, 38.dp); Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Row { T(s["name"].s, 13.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f)); T("${Fmt.int(s["notes"].d)} cuộc gọi", 12.sp, FontWeight.Bold) }
                            Row(verticalAlignment = Alignment.CenterVertically) { T("${Fmt.int(s["customers"].d)} khách · cầm ${Fmt.int(s["assigned"].d)} data  ", 10.sp, color = C.inkSoft); Tag(if (s["orders"].d > 0) "${Fmt.int(s["orders"].d)} đơn chốt" else "Chưa chốt", if (s["orders"].d > 0) Tone.Green else Tone.Red) }
                            T("Doanh thu ${Fmt.money(s["net"].d)} · hoạt động ${Fmt.int(s["activeDays"].d)} ngày", 10.sp, color = C.inkSoft, maxLines = 1)
                        }
                    }
                    Bar(s[countBy].d / maxN, C.brand.copy(alpha = .7f), 4.dp)
                }
                if (i < list.lastIndex) Divider0(60.dp)
            }
            if (list.isEmpty()) T("Chưa có cuộc gọi trong kỳ.", 12.sp, color = C.inkSoft, modifier = Modifier.padding(12.dp))
        }
    } else care.data?.let { c ->
        SectionHead(if (filter == "todo") "Khách chưa liên hệ" else "Khách vừa liên hệ", "${Fmt.int(c["total"].d)} khách")
        c["rows"].list.take(30).forEach { CustomerCallCard(it) }
    }
    T("Cuộc gọi = một ghi chú nhân viên viết trên hồ sơ khách ở Pancake. Đơn chốt tính theo người bán trên đơn, ngày xác nhận lần đầu.", 10.sp, color = C.inkSoft)
}

@Composable fun CustomerCallCard(r: J) {
    val nav = LocalNav.current; val ctx = LocalContext.current
    Panel(12.dp, onClick = { nav.push(Screen.Customer(r["posId"].s, r["phone"].s)) }) {
        Row(verticalAlignment = Alignment.Top) {
            Avatar(r["name"].sn ?: "K", 40.dp, if (r["lastNoteAt"].sn == null) C.blue else C.brand); Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row { T(r["name"].sn ?: r["phone"].s, 13.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f)); T(Fmt.time(r["lastNoteAt"].sn), 10.sp, color = C.inkSoft) }
                Row(verticalAlignment = Alignment.CenterVertically) { T("☎ ${r["phone"].s}  ", 10.sp, color = C.inkSoft); Tag(if (r["lastNoteAt"].sn == null) "Chưa liên hệ" else "Đã liên hệ", if (r["lastNoteAt"].sn == null) Tone.Red else Tone.Green) }
                val n = r["notes"][0]["message"].sn
                T(n ?: "${r["posName"].s}${r["assignedName"].sn?.let { " · $it" } ?: ""}", 11.sp, color = C.inkSoft, maxLines = 2)
            }
            IconButton({ openUrl(ctx, "tel:${r["phone"].s}") }) { Icon(Icons.Filled.Call, null, tint = C.good) }
        }
    }
}

// ---------- Khách theo nhân viên ----------
@Composable fun CareContent() {
    val nav = LocalNav.current; val ctx = LocalContext.current
    var assigned by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf("note_old") }
    var minDays by remember { mutableIntStateOf(0) }
    var prio by remember { mutableStateOf("") }
    var q by remember { mutableStateOf("") }
    var tick by remember { mutableIntStateOf(0) }
    val d = load(assigned, sort, minDays, tick) { Api.care(assigned, sort, minDays, q, 1) }
    PageTitle("Khách theo nhân viên", "Phân công rõ ràng. Chăm sóc tốt hơn.", Icons.Filled.Groups)
    ErrorLine(d.error.takeIf { d.data == null })
    val data = d.data ?: run { if (d.error == null) { Thinking(); Skeleton() }; return }
    val staff = data["staff"].list; val cur = staff.firstOrNull { it["id"].s == assigned }; val sm = data["summary"]
    var open by remember { mutableStateOf(false) }
    Box {
        Panel(12.dp, onClick = { open = true }) { Row(verticalAlignment = Alignment.CenterVertically) { Avatar(cur?.get("name")?.s ?: "Tất cả", 40.dp); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T(cur?.get("name")?.s ?: "Tất cả nhân viên CSKH", 14.sp, FontWeight.Bold); T(cur?.get("department")?.sn ?: "Đội CSKH · ${staff.size} người", 11.sp, color = C.inkSoft) }; Icon(Icons.Filled.KeyboardArrowDown, null, tint = C.inkSoft) } }
        DropdownMenu(open, { open = false }) { DropdownMenuItem({ T("Tất cả nhân viên CSKH", 13.sp) }, { assigned = ""; open = false }); staff.forEach { s -> DropdownMenuItem({ T("${s["name"].s} · ${Fmt.int(s["assigned"].d)}", 13.sp) }, { assigned = s["id"].s; open = false }) } }
    }
    Panel(12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBox(Icons.Filled.Groups, C.good, 36.dp); Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) { T("Khách được phân công", 11.sp, color = C.inkSoft); Row(verticalAlignment = Alignment.Bottom) { Rolling(Fmt.int(cur?.get("assigned")?.d ?: sm["total"].d), 24.sp); Spacer(Modifier.width(6.dp)); T("đã mua ${Fmt.int(sm["buyers"].d)} · ${Fmt.short(sm["closedNet"].d)} ₫", 10.sp, color = C.inkSoft) } }
            OutlineButton("Xem chi tiết ›") { nav.push(Screen.Calls("cskh")) }
        }
    }
    T("Phân loại theo mức độ ưu tiên", 13.sp, FontWeight.Bold)
    val over20 = cur?.get("over20")?.d ?: sm["over20"].d; val over7 = cur?.get("over7")?.d ?: staff.sumOf { it["over7"].d }; val never = cur?.get("neverNoted")?.d ?: sm["neverNoted"].d; val today = cur?.get("notedToday")?.d ?: staff.sumOf { it["notedToday"].d }
    GridN(4, listOf(
        { m -> PrioTile("Cần chăm sóc", over20, C.bad, prio == "20", m) { prio = if (prio == "20") "" else "20"; minDays = if (prio.isEmpty()) 0 else 20; sort = "note_old" } },
        { m -> PrioTile("Có nguy cơ rời", over7, C.warn, prio == "7", m) { prio = if (prio == "7") "" else "7"; minDays = if (prio.isEmpty()) 0 else 7; sort = "note_old" } },
        { m -> PrioTile("Chưa ghi chú", never, C.blue, prio == "never", m) { prio = if (prio == "never") "" else "never"; minDays = 0 } },
        { m -> PrioTile("Vừa chăm sóc", today, C.good, prio == "today", m) { prio = if (prio == "today") "" else "today"; minDays = 0; sort = if (prio.isEmpty()) "note_old" else "note_new" } },
    ))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        SearchBox(q, "Tìm khách hàng (tên, SĐT, ghi chú…)", Modifier.weight(1f), { q = it }) { tick++ }
        SelectMenu("", listOf("note_old" to "Lâu chưa ghi chú", "note_new" to "Ghi chú mới nhất", "purchased" to "Mua nhiều tiền", "last_order" to "Đặt gần đây", "name" to "Tên A–Z"), Icons.Filled.Sort, Modifier.width(64.dp)) { sort = it }
    }
    var rows = data["rows"].list
    if (prio == "never") rows = rows.filter { it["lastNoteAt"].sn == null }
    if (prio == "today") rows = rows.filter { (it["daysSinceNote"].dn ?: 99.0) < 1 }
    SectionHead("Danh sách khách hàng", mapOf("note_new" to "Ghi chú mới nhất", "note_old" to "Lâu chưa ghi chú", "purchased" to "Mua nhiều tiền", "last_order" to "Đặt gần đây", "name" to "Tên A–Z")[sort])
    rows.forEach { r ->
        val dn = r["daysSinceNote"].dn
        val (label, tone) = when { dn == null -> "Cần chăm sóc" to Tone.Red; dn > 20 -> "Cần chăm sóc" to Tone.Red; dn > 7 -> "Có nguy cơ rời" to Tone.Orange; r["succeedOrders"].d > 0 -> "Ổn định" to Tone.Green; else -> "Tiềm năng" to Tone.Blue }
        Panel(12.dp, onClick = { nav.push(Screen.Customer(r["posId"].s, r["phone"].s)) }) {
            Row(verticalAlignment = Alignment.Top) {
                Avatar(r["name"].sn ?: "K", 40.dp, tone.color); Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { T(r["name"].sn ?: r["phone"].s, 13.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f, false)); Spacer(Modifier.width(6.dp)); Tag(label, tone) }
                    PosLabel(r["posId"].s, "☎ ${r["phone"].s} · ${r["posName"].s}")
                    T(r["notes"][0]["message"].sn ?: "${Fmt.int(r["succeedOrders"].d)} đơn TC · ${Fmt.short(r["purchased"].d)} ₫${r["assignedName"].sn?.let { " · $it" } ?: ""}", 11.sp, color = C.inkSoft, maxLines = 2)
                }
                Column(horizontalAlignment = Alignment.End) {
                    if (dn != null) { T("${Fmt.int(dn)} ngày", 12.sp, FontWeight.Bold, if (dn > 20) C.bad else if (dn > 7) C.warn else C.good); T("chưa liên hệ", 9.sp, color = C.inkSoft) } else T("chưa note", 11.sp, FontWeight.Bold, C.warn)
                    IconButton({ openUrl(ctx, "tel:${r["phone"].s}") }, Modifier.size(32.dp)) { Icon(Icons.Filled.Call, null, tint = C.good, modifier = Modifier.size(18.dp)) }
                }
            }
        }
    }
    if (rows.isEmpty()) Panel { T("Không có khách khớp bộ lọc.", 12.sp, color = C.inkSoft) }
}

@Composable fun PrioTile(label: String, n: Double, tint: Color, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(modifier.clip(RoundedCornerShape(10.dp)).background(tint.copy(alpha = if (on) .25f else .11f)).border(if (on) 1.5.dp else 0.dp, if (on) tint else Color.Transparent, RoundedCornerShape(10.dp)).clickable { onClick() }.padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        T(label, 9.sp, FontWeight.SemiBold, tint, 1); Rolling(Fmt.int(n), 18.sp, color = tint)
    }
}

// ---------- Mua lại & Upsell ----------
@Composable fun RepurchaseContent() {
    val nav = LocalNav.current; val ctx = LocalContext.current
    var period by remember { mutableStateOf<Period>(Period.D30) }
    var sellerId by remember { mutableStateOf("") }
    val (a, b) = period.range
    val d = load(period.key, sellerId) { coroutineScope { val x = async { Api.repurchase(a, b, sellerId) }; val y = async { runCatching { Api.repurchase(period.previous.first, period.previous.second, sellerId) }.getOrNull() }; x.await() to y.await() } }
    PageTitle("Mua lại & Upsell", "Khai thác giá trị thật. Đồng hành lâu dài.", Icons.Filled.BarChart)
    Segmented(period, listOf(Period.D30 to "30 ngày", Period.D60 to "60 ngày", Period.D90 to "90 ngày")) { period = it }
    ErrorLine(d.error.takeIf { d.data == null })
    val r = d.data?.first ?: run { if (d.error == null) { Thinking(); Skeleton() }; return }
    val pv = d.data?.second
    Grid2(listOf(
        { m -> KpiCard(Icons.Filled.ShoppingCart, C.good, "Khách mua lại", Fmt.int(r["summary"]["repurchase"]["customers"].d), Fmt.delta(r["summary"]["repurchase"]["customers"].d, pv?.get("summary")?.get("repurchase")?.get("customers")?.dn), note = "So với kỳ trước", modifier = m) },
        { m -> KpiCard(Icons.Filled.Payments, C.teal, "Doanh thu từ khách cũ", Fmt.vnd(r["summary"]["repurchase"]["net"].d), Fmt.delta(r["summary"]["repurchase"]["net"].d, pv?.get("summary")?.get("repurchase")?.get("net")?.dn), modifier = m) },
    ))
    Panel {
        Row { T("Phễu cơ hội mua lại", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Trọn đời") }
        val f = r["funnel"]
        FunnelLine("Tổng khách đã mua", f["once"].d, f["once"].d); FunnelLine("Mua từ 2 lần", f["twice"].d, f["once"].d); FunnelLine("Mua từ 3 lần", f["thrice"].d, f["once"].d); FunnelLine("Mua lại trong kỳ", r["summary"]["repurchase"]["customers"].d, f["once"].d, C.brand)
    }
    Panel {
        T("Lần mua trong kỳ", 15.sp, FontWeight.Bold)
        val lv = r["summary"]["levels"].list; val maxV = (lv.maxOfOrNull { it["orders"].d } ?: 1.0).coerceAtLeast(1.0)
        lv.forEach { l -> Column(verticalArrangement = Arrangement.spacedBy(3.dp)) { Row { T(l["label"].s, 13.sp, modifier = Modifier.weight(1f)); T("${Fmt.int(l["orders"].d)} đơn · ${Fmt.int(l["customers"].d)} khách · ${Fmt.short(l["net"].d)} ₫", 11.sp, color = C.inkSoft) }; Bar(l["orders"].d / maxV, if (l["level"].i == 0) C.gray else C.brand) } }
    }
    val tags = r["byTag"].list.sortedByDescending { it["resaleOrders"].d }
    if (tags.isNotEmpty()) {
        Row { T("Sản phẩm mua lại nhiều", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Theo thẻ trên đơn") }
        Grid2(tags.take(4).map { t -> { m: Modifier -> Panel(12.dp, m) { IconBox(Icons.Filled.Eco, C.good, 30.dp); T(t["tag"].s, 13.sp, FontWeight.Bold, maxLines = 1); T("${Fmt.int(t["resaleOrders"].d)} đơn mua lại / ${Fmt.int(t["orders"].d)}", 10.sp, color = C.inkSoft); Tag("Tỷ lệ mua lại ${Fmt.pct(t["resaleRate"].dn)}") } } })
    }
    Row(verticalAlignment = Alignment.CenterVertically) { T("Theo nhân viên", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); if (sellerId.isNotEmpty()) T("Bỏ lọc", 11.sp, FontWeight.SemiBold, C.brand, modifier = Modifier.clickable { sellerId = "" }) }
    Panel(0.dp) {
        r["byEmployee"].list.take(8).forEachIndexed { i, e ->
            Row(Modifier.fillMaxWidth().clickable { sellerId = if (sellerId == e["sellerId"].s) "" else e["sellerId"].s }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Medal(i + 1); Spacer(Modifier.width(8.dp)); Avatar(e["name"].s, 32.dp); Spacer(Modifier.width(8.dp))
                T(e["name"].s, 13.sp, if (sellerId == e["sellerId"].s) FontWeight.Bold else FontWeight.Medium, if (sellerId == e["sellerId"].s) C.brand else C.ink, 1, Modifier.weight(1f))
                T("${Fmt.int(e["repurchase"]["orders"].d)} đơn · ${Fmt.short(e["repurchase"]["net"].d)} ₫", 11.sp, FontWeight.SemiBold, C.inkSoft)
            }
        }
    }
    Row { T("Khách vừa mua lại", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("${r["recent"].size} đơn") }
    r["recent"].list.take(15).forEach { x ->
        Panel(12.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(x["phone"].s, 38.dp, C.blue); Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) { Row { T(x["phone"].s, 13.sp, FontWeight.SemiBold, modifier = Modifier.weight(1f)); T(Fmt.vnd(x["net"].d), 12.sp, FontWeight.Bold, C.good) }; PosLabel(x["posId"].s, "${x["posName"].s} · ${x["sellerName"].s}"); T("Upsell lần ${x["level"].i} · đơn thứ ${x["prior"].i + 1} · ${Fmt.day(x["createdAt"].sn)}${x["tags"].strings.take(2).joinToString(", ").let { if (it.isEmpty()) "" else " · $it" }}", 10.sp, color = C.inkSoft, maxLines = 1) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionPill(Icons.Filled.Call, "Gọi ngay", C.good, Modifier.weight(1f)) { openUrl(ctx, "tel:${x["phone"].s}") }
                ActionPill(Icons.Filled.Sms, "Nhắn tin", C.brand, Modifier.weight(1f)) { openUrl(ctx, "sms:${x["phone"].s}") }
                ActionPill(Icons.Filled.Badge, "Hồ sơ", C.purple, Modifier.weight(1f)) { nav.push(Screen.Customer(x["posId"].s, x["phone"].s)) }
            }
        }
    }
}

@Composable fun ActionPill(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(modifier.clip(RoundedCornerShape(9.dp)).border(1.dp, tint.copy(alpha = .5f), RoundedCornerShape(9.dp)).clickable { onClick() }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, tint = tint, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(5.dp)); T(text, 11.sp, FontWeight.SemiBold, tint) }
}

// ---------- Khách lâu chưa mua ----------
@Composable fun DormantContent() {
    val nav = LocalNav.current; val ctx = LocalContext.current
    var days by remember { mutableIntStateOf(30) }
    var q by remember { mutableStateOf("") }
    var rows by remember { mutableStateOf<List<J>>(emptyList()) }
    var page by remember { mutableIntStateOf(1) }
    var hasMore by remember { mutableStateOf(false) }
    var total by remember { mutableStateOf(0.0) }
    var busy by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val segment = when (days) { 30 -> "potential"; 60 -> "risk"; else -> "dormant" }
    suspend fun load(next: Boolean) { busy = true; runCatching { Api.customers(segment, "dormant", q, if (next) page + 1 else 1) }.onSuccess { r -> rows = if (next) rows + r["customers"].list else r["customers"].list; page = r["page"].i; hasMore = r["hasMore"].b; total = r["total"].d }; busy = false }
    LaunchedEffect(days, tick) { load(false) }
    PageTitle("Khách lâu chưa mua", "Gọi lại đúng lúc, giữ khách ở lại.", Icons.Filled.Bedtime)
    Segmented(days, listOf(30 to "30 ngày", 60 to "60 ngày", 90 to "90 ngày")) { days = it }
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.bad.copy(alpha = .08f)).border(1.dp, C.bad.copy(alpha = .2f), RoundedCornerShape(14.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(44.dp).clip(androidx.compose.foundation.shape.CircleShape).background(C.bad), contentAlignment = Alignment.Center) { Icon(Icons.Filled.NotificationsActive, null, tint = Color.White) }
        Spacer(Modifier.width(12.dp))
        Column { T(when (days) { 30 -> "Mua 1 lần, 31–90 ngày chưa quay lại"; 60 -> "Từng mua ≥2 lần, quá 60 ngày chưa mua"; else -> "Ngủ đông: quá 90 ngày chưa mua" }, 10.sp, color = C.inkSoft); Row(verticalAlignment = Alignment.Bottom) { Rolling(Fmt.int(total), 22.sp); T(" khách hàng", 13.sp, FontWeight.SemiBold) }; T("cần liên hệ lại", 11.sp, color = C.inkSoft) }
    }
    SearchBox(q, "Tìm theo tên hoặc SĐT", Modifier.fillMaxWidth(), { q = it }) { tick++ }
    SectionHead("Khách hàng ưu tiên liên hệ ($days ngày)", "${Fmt.int(total)} khách")
    if (busy && rows.isEmpty()) { Thinking(); Skeleton(200.dp) }
    rows.forEach { r ->
        val net = r["successNet"].d
        Panel(12.dp, onClick = { nav.push(Screen.Customer(r["posId"].s, r["phone"].s)) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(r["name"].sn ?: r["phone"].s, 40.dp, C.blue); Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { T(r["name"].sn ?: r["phone"].s, 13.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f, false)); Spacer(Modifier.width(6.dp)); Tag(if (net >= 2e6) "Ưu tiên cao" else if (net >= 7e5) "Ưu tiên trung bình" else "Ưu tiên thấp", if (net >= 2e6) Tone.Red else if (net >= 7e5) Tone.Orange else Tone.Green) }
                    T("${Fmt.int(r["daysSinceSuccess"].d)} ngày chưa mua", 11.sp, FontWeight.SemiBold, C.bad)
                    PosLabel(r["posId"].s, "${r["phone"].s} · ${r["posName"].s}${r["sellerName"].sn?.let { " · $it" } ?: ""}")
                }
                IconButton({ openUrl(ctx, "tel:${r["phone"].s}") }) { Icon(Icons.Filled.Call, null, tint = C.good) }
            }
        }
    }
    if (hasMore) TextButton({ scope.launch { load(true) } }, Modifier.fillMaxWidth()) { T("Xem thêm", 13.sp, FontWeight.SemiBold, C.brand) }
}

// ---------- KPI CSKH ----------
@Composable fun KpiContent() {
    var mode by remember { mutableStateOf("person") }
    var month by remember { mutableStateOf(VNDate.today().toString().take(7)) }
    var pick by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<J?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    val staffL = load(Unit) { Api.employees("cskh") }
    val staff = staffL.data?.list?.filter { it["active"].isNull || it["active"].b } ?: emptyList()
    LaunchedEffect(staff) { if (pick.isEmpty()) staff.firstOrNull()?.let { pick = it["id"].s } }
    val end = minOf(VNDate.monthEnd(month), VNDate.today().toString())
    val d = load(month, pick, mode, tick) {
        coroutineScope {
            val t = async { Api.targets(month) }
            val ac = async { Api.overview("$month-01", end, team = "cskh", compare = "none") }
            val ca = async { runCatching { Api.care(if (mode == "person") pick else "", "note_old", 0, "", 1) }.getOrNull() }
            val h = async { runCatching { Api.overview(VNDate.shiftMonth(month, -5) + "-01", end, groupBy = "month", team = "cskh", compare = "none", employeeIds = if (mode == "person" && pick.isNotEmpty()) listOf(pick) else emptyList()) }.getOrNull() }
            listOf(t.await(), ac.await(), ca.await(), h.await())
        }
    }
    PageTitle("KPI CSKH", "Mục tiêu rõ, tiến độ rõ.", Icons.Filled.TrackChanges) { SelectMenu("Tháng ${month.takeLast(2)}/${month.take(4)}", (0..5).map { VNDate.shiftMonth(VNDate.today().toString().take(7), -it.toLong()) }.map { it to "Tháng ${it.takeLast(2)}/${it.take(4)}" }, Icons.Filled.CalendarMonth, Modifier.width(150.dp)) { month = it } }
    Segmented(mode, listOf("person" to "Cá nhân", "team" to "Đội nhóm")) { mode = it }
    val cur = staff.firstOrNull { it["id"].s == pick }
    if (mode == "person") {
        var open by remember { mutableStateOf(false) }
        Box { Panel(12.dp, onClick = { open = true }) { Row(verticalAlignment = Alignment.CenterVertically) { Avatar(cur?.get("name")?.s ?: "?", 40.dp); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T(cur?.get("name")?.s ?: "Chọn nhân viên", 14.sp, FontWeight.Bold); T(cur?.get("department")?.sn ?: "Nhân viên CSKH", 11.sp, color = C.inkSoft) }; OutlineButton("Đổi nhân viên") { open = true } } }
            DropdownMenu(open, { open = false }) { staff.forEach { e -> DropdownMenuItem({ T(e["name"].s, 13.sp) }, { pick = e["id"].s; open = false }) } } }
    }
    val x = d.data ?: run { if (d.error == null) Thinking(); ErrorLine(d.error); return }
    val (targets, actual, care, hist) = x
    val goals = targets!!["items"].list.filter { it["scope"].s == "employee" }.associateBy { it["refId"].s }
    val ids = if (mode == "person") listOf(pick) else staff.map { it["id"].s }
    val by = actual!!["current"]["byEmployee"].list.associateBy { it["sellerId"].s }
    val goalRev = ids.sumOf { goals[it]?.get("revenue")?.d ?: 0.0 }; val goalOrders = ids.sumOf { goals[it]?.get("closedOrders")?.d ?: 0.0 }
    val actRev = ids.sumOf { by[it]?.get("closedNet")?.d ?: 0.0 }; val actOrders = ids.sumOf { by[it]?.get("closedOrders")?.d ?: 0.0 }
    val cs = if (mode == "person") care?.get("staff")?.list?.firstOrNull { it["id"].s == pick } else null
    val assigned = cs?.get("assigned")?.d ?: care?.get("summary")?.get("total")?.d ?: 0.0
    val noted = assigned - (cs?.get("neverNoted")?.d ?: care?.get("summary")?.get("neverNoted")?.d ?: 0.0)
    Grid2(listOf(
        { m -> KpiRing("Khách cần chăm sóc", Fmt.int(assigned), "đang được phân công", null, m) },
        { m -> KpiRing("Đã chăm sóc", Fmt.int(noted), Fmt.pct0(if (assigned > 0) noted / assigned * 100 else null) + " đã ghi chú", if (assigned > 0) noted / assigned else 0.0, m) },
        { m -> KpiRing("Đơn chốt", Fmt.int(actOrders), if (goalOrders > 0) Fmt.pct0(actOrders / goalOrders * 100) + " đạt mục tiêu" else "chưa đặt mục tiêu", if (goalOrders > 0) actOrders / goalOrders else 0.0, m) },
        { m -> KpiRing("Doanh thu từ KH CSKH", Fmt.short(actRev), if (goalRev > 0) Fmt.pct0(actRev / goalRev * 100) + " đạt mục tiêu" else "chưa đặt mục tiêu", if (goalRev > 0) actRev / goalRev else 0.0, m) },
    ))
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) { T("Mục tiêu tháng", 14.sp, FontWeight.Bold); Spacer(Modifier.width(6.dp)); Hint(if (mode == "person") "Cá nhân" else "Cả đội"); Spacer(Modifier.weight(1f)); if (Auth.isOwner && mode == "person" && cur != null) OutlineButton("✎ Sửa") { editing = cur } }
        GoalRow("Số khách cần chăm sóc", Fmt.int(assigned)); GoalRow("Số đơn chốt", if (goalOrders > 0) Fmt.int(goalOrders) else "—"); GoalRow("Doanh thu (triệu đồng)", if (goalRev > 0) Fmt.int(goalRev / 1e6) else "—")
    }
    Panel {
        Row { T("Hiệu suất 6 tháng gần đây", 14.sp, FontWeight.Bold, modifier = Modifier.weight(1f)); Hint("Doanh thu đơn chốt") }
        val s = hist?.get("current")?.get("series")?.list
        if (s.isNullOrEmpty()) Skeleton(120.dp) else LineChart(byDay(s, "closedNet").map { "Th" + it.first.takeLast(2).toInt() to it.second }, C.good, 120.dp)
    }
    if (mode == "team") {
        T("Theo nhân viên", 14.sp, FontWeight.Bold)
        Panel(0.dp) {
            staff.forEachIndexed { i, e ->
                val g = goals[e["id"].s]?.get("revenue")?.d ?: 0.0; val av = by[e["id"].s]?.get("closedNet")?.d ?: 0.0
                Row(Modifier.fillMaxWidth().clickable { if (Auth.isOwner) editing = e else { pick = e["id"].s; mode = "person" } }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(e["name"].s, 34.dp); Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Row { T(e["name"].s, 13.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f)); T(Fmt.pct0(if (g > 0) av / g * 100 else null), 13.sp, FontWeight.Bold, if (g <= 0) C.inkSoft else if (av / g >= 1) C.good else if (av / g >= .7) C.warn else C.bad) }
                        Bar(if (g > 0) av / g else 0.0, C.good, 5.dp)
                        T("${Fmt.short(av)} / ${if (g > 0) Fmt.short(g) else "chưa đặt"} ₫ · ${Fmt.int(by[e["id"].s]?.get("closedOrders")?.d ?: 0.0)} đơn", 10.sp, color = C.inkSoft)
                    }
                }
                if (i < staff.lastIndex) Divider0(54.dp)
            }
        }
    }
    editing?.let { e -> TargetDialog(e, goals[e["id"].s], month, { editing = null }) { editing = null; tick++ } }
}

@Composable fun KpiRing(label: String, value: String, sub: String, ring: Double?, modifier: Modifier) {
    Panel(12.dp, modifier) { Row(verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { T(label, 10.sp, color = C.inkSoft, maxLines = 1); Rolling(value, 20.sp); T(sub, 9.sp, color = C.good, maxLines = 1) }; if (ring != null) Ring(ring, 44.dp, 5.dp, if (ring >= .7) C.good else C.warn, "") else Icon(Icons.Filled.Groups, null, tint = C.good) } }
}
@Composable fun GoalRow(label: String, value: String) { Row(verticalAlignment = Alignment.CenterVertically) { T(label, 12.sp, modifier = Modifier.weight(1f)); Box(Modifier.widthIn(min = 80.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, Color(0x1F000000), RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 6.dp)) { T(value, 12.sp, FontWeight.Bold) } } }

@Composable fun TargetDialog(e: J, cur: J?, month: String, dismiss: () -> Unit, done: () -> Unit) {
    val scope = rememberCoroutineScope()
    var rev by remember { mutableStateOf(cur?.get("revenue")?.d?.toLong()?.toString() ?: "") }
    var ord by remember { mutableStateOf(cur?.get("closedOrders")?.d?.toLong()?.toString() ?: "") }
    var err by remember { mutableStateOf<String?>(null) }
    AlertDialog(dismiss, title = { T("Mục tiêu tháng ${month.takeLast(2)} · ${e["name"].s}", 15.sp, FontWeight.Bold) }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(rev, { rev = it.filter(Char::isDigit) }, label = { Text("Doanh thu (₫)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            OutlinedTextField(ord, { ord = it.filter(Char::isDigit) }, label = { Text("Đơn chốt") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            ErrorLine(err)
        }
    }, confirmButton = { TextButton({ scope.launch { try { Api.send("/api/targets", "PUT", mapOf("month" to month, "only" to listOf("employee:${e["id"].s}"), "items" to listOf(mapOf("scope" to "employee", "refId" to e["id"].s, "revenue" to (rev.toDoubleOrNull() ?: 0.0), "closedOrders" to (ord.toDoubleOrNull() ?: 0.0))))); done() } catch (x: Exception) { err = x.message } } }) { T("Lưu", 14.sp, FontWeight.Bold, C.brand) } },
        dismissButton = { TextButton(dismiss) { T("Hủy", 14.sp, color = C.inkSoft) } }, containerColor = C.card)
}
