package vn.megatech.tonghoppos

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

fun statusTone(code: Int?): Tone = when (code) { 3, 16 -> Tone.Green; 2 -> Tone.Blue; 4, 5, 15 -> Tone.Orange; 6, 7 -> Tone.Red; 0, 17 -> Tone.Gray; else -> Tone.Orange }

/** Ô tìm kiếm gọn. */
@Composable fun SearchBox(value: String, placeholder: String, modifier: Modifier = Modifier, onChange: (String) -> Unit, onSubmit: () -> Unit) {
    Row(modifier.clip(RoundedCornerShape(10.dp)).background(C.card).border(1.dp, Color(0x14000000), RoundedCornerShape(10.dp)).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Search, null, tint = C.inkSoft, modifier = Modifier.size(18.dp))
        TextField(value, onChange, Modifier.weight(1f), placeholder = { T(placeholder, 13.sp, color = C.inkSoft, maxLines = 1) }, singleLine = true,
            colors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { onSubmit() }), textStyle = LocalTextStyle.current.copy(fontSize = 13.sp))
    }
}

@Composable fun OrderCard(o: J) {
    val nav = LocalNav.current
    Panel(12.dp, onClick = { nav.push(Screen.Order(o["id"].s)) }) {
        Row(verticalAlignment = Alignment.CenterVertically) { T("#${o["orderId"].s}", 13.sp, FontWeight.Bold); Spacer(Modifier.width(8.dp)); Tag(o["statusName"].s, statusTone(o["statusCode"].dn?.toInt())); Spacer(Modifier.weight(1f)); T(Fmt.vnd(o["net"].dn ?: o["currentTotal"].d), 13.sp, FontWeight.Bold) }
        T(listOfNotNull(o["customer"].sn, o["phone"].sn).joinToString(" · "), 11.sp, color = C.inkSoft, maxLines = 1)
        Row(verticalAlignment = Alignment.CenterVertically) { PosBadge(o["posId"].s, 16.dp); Spacer(Modifier.width(5.dp)); T(Pos.short(o["posId"].s) + (o["sellerName"].sn?.let { " · $it" } ?: ""), 10.sp, color = C.inkSoft, maxLines = 1, modifier = Modifier.weight(1f)); T(Fmt.time(o["firstConfirmedAt"].sn ?: o["createdAt"].sn), 10.sp, color = C.inkSoft) }
    }
}

/** Danh sách đơn có lọc (mẫu dùng chung): mang theo kỳ, POS, nhóm trạng thái, nhân viên, cơ sở thời gian. */
@Composable fun OrderListScreen(query: OrderQuery, filterable: Boolean = false) {
    var active by remember { mutableStateOf(query) }
    var search by remember { mutableStateOf("") }
    var rows by remember { mutableStateOf<List<J>>(emptyList()) }
    var page by remember { mutableIntStateOf(1) }
    var hasMore by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    suspend fun load(next: Boolean) {
        busy = true
        try { val r = Api.orders(active.copy(q = search), if (next) page + 1 else 1); rows = if (next) rows + r["orders"].list else r["orders"].list; page = r["page"].i; hasMore = r["hasMore"].b; error = null }
        catch (e: Exception) { error = e.message } finally { busy = false }
    }
    LaunchedEffect(active, tick) { load(false) }
    SubPage(active.title, busy && rows.isNotEmpty(), { tick++ }) {
        T(active.contextLine, 11.sp, color = C.inkSoft)
        SearchBox(search, "Mã đơn, SĐT, tên khách", Modifier.fillMaxWidth(), { search = it; if (it.isEmpty()) tick++ }) { tick++ }
        if (filterable) OrderFilters(active) { active = it }
        ErrorLine(error.takeIf { rows.isEmpty() })
        if (busy && rows.isEmpty()) { Thinking(); Skeleton() }
        if (!busy && rows.isEmpty() && error == null) Panel { T("Không có đơn nào khớp bộ lọc này.", 13.sp, color = C.inkSoft) }
        rows.forEach { OrderCard(it) }
        if (hasMore) TextButton({ scope.launch { load(true) } }, Modifier.fillMaxWidth()) { T(if (busy) "Đang tải…" else "Tải thêm", 13.sp, FontWeight.SemiBold, C.brand) }
    }
}

@Composable fun OrderFilters(q: OrderQuery, onChange: (OrderQuery) -> Unit) {
    val groups = listOf("" to "Tất cả", "closed" to "Đơn chốt", "unconfirmed" to "Chờ xác nhận", "confirmed" to "Đang xử lý", "shipping" to "Đang giao", "delivered" to "Đã nhận", "returned" to "Hoàn", "cancelled" to "Đã hủy")
    var period by remember { mutableStateOf<Period>(Period.Custom(q.start, q.end)) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PosSelectMenu(q.posIds.firstOrNull() ?: "", modifier = Modifier.weight(1f)) { onChange(q.copy(posIds = if (it.isEmpty()) emptyList() else listOf(it))) }
        SelectMenu(groups.first { it.first == q.group }.second, groups, Icons.Filled.FilterList, Modifier.weight(1f)) { onChange(q.copy(group = it)) }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        PeriodMenu(period) { period = it; onChange(q.copy(start = it.range.first, end = it.range.second)) }
        SelectMenu(when (q.basis) { "confirmed" -> "Theo ngày chốt"; "assigned" -> "Theo ngày chia"; else -> "Theo ngày tạo" }, listOf("created" to "Theo ngày tạo", "confirmed" to "Theo ngày chốt", "assigned" to "Theo ngày chia"), modifier = Modifier.weight(1f)) { onChange(q.copy(basis = it)) }
    }
}

@Composable fun KV(k: String, v: String, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth()) { T(k, 13.sp, color = C.inkSoft, modifier = Modifier.weight(1f)); T(v, 13.sp, if (bold) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(1.4f), align = androidx.compose.ui.text.style.TextAlign.End) }
}

@Composable fun OrderDetailScreen(id: String) {
    val nav = LocalNav.current; val ctx = LocalContext.current
    val d = load(id) { Api.order(id) }
    SubPage("Đơn hàng", d.loading && d.data != null, { d.reload() }) {
        ErrorLine(d.error)
        val o = d.data
        if (o != null) {
            Panel {
                Row { Column(Modifier.weight(1f)) { T("#${o["orderId"].s}", 20.sp, FontWeight.Bold); PosLabel(o["posId"].s, o["posName"].s, 18.dp) }; Column(horizontalAlignment = Alignment.End) { T(o["statusName"].s, 14.sp, FontWeight.SemiBold, C.brand); o["subStatus"].sn?.let { T(it, 11.sp, color = C.inkSoft) } } }
                o["phone"].sn?.let { ph ->
                    Divider0()
                    Row(Modifier.clickable { nav.push(Screen.Customer(o["posId"].s, ph)) }, verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { T(o["customer"].sn ?: "Khách", 14.sp, FontWeight.SemiBold); T("$ph · xem hồ sơ khách", 11.sp, color = C.inkSoft) }; Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft) }
                    Row(Modifier.clickable { openUrl(ctx, "tel:$ph") }, verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.Call, null, tint = C.good); Spacer(Modifier.width(8.dp)); T("Gọi $ph", 14.sp, FontWeight.SemiBold, C.good) }
                }
            }
            T("Tiền", 13.sp, FontWeight.Bold, C.inkSoft)
            Panel { KV("Doanh số", Fmt.money(o["gross"].d)); KV("Giảm giá / quà", "−" + Fmt.money(o["discount"].d)); KV("Doanh thu", Fmt.money(o["net"].d), true); if (o["shippingFee"].d > 0) KV("Phí ship", Fmt.money(o["shippingFee"].d)); if (o["cod"].d > 0) KV("COD", Fmt.money(o["cod"].d)) }
            val items = o["items"].list
            if (items.isNotEmpty()) { T("Sản phẩm · ${items.size}", 13.sp, FontWeight.Bold, C.inkSoft); Panel { items.forEach { i -> Row { Column(Modifier.weight(1f)) { T(i["name"].s, 13.sp); T("${Fmt.int(i["quantity"].d)} × ${Fmt.money(i["price"].d)}${if (i["bonus"].b) " · quà" else ""}", 11.sp, color = C.inkSoft) }; T(Fmt.money(i["total"].d), 13.sp) } } } }
            T("Người phụ trách", 13.sp, FontWeight.Bold, C.inkSoft)
            Panel { listOf("Marketing" to "marketerName", "Người bán" to "sellerName", "Người chốt" to "closerName", "CSKH" to "careName", "Người tạo" to "creatorName", "Nguồn" to "source").forEach { (k, f) -> o[f].sn?.let { KV(k, it) } } }
            T("Mốc thời gian", 13.sp, FontWeight.Bold, C.inkSoft)
            Panel { KV("Tạo", Fmt.dateTime(o["createdAt"].sn)); listOf("Chia người bán" to "sellerAssignedAt", "Chốt (xác nhận)" to "firstConfirmedAt", "Giao thành công" to "deliveredAt", "Hoàn" to "returnedAt", "Hủy" to "cancelledAt").forEach { (k, f) -> o[f].sn?.let { KV(k, Fmt.dateTime(it)) } } }
            val hist = o["history"].list
            if (hist.isNotEmpty()) { T("Lịch sử trạng thái", 13.sp, FontWeight.Bold, C.inkSoft); Panel { hist.forEach { h -> Column { T("${h["fromName"].sn ?: "—"} → ${h["toName"].sn ?: "—"}", 13.sp); T("${h["by"].sn ?: "Hệ thống"} · ${Fmt.dateTime(h["at"].sn)}", 11.sp, color = C.inkSoft) } } } }
            if (o["address"].sn != null || o["note"].sn != null) { T("Giao hàng & ghi chú", 13.sp, FontWeight.Bold, C.inkSoft); Panel { o["address"].sn?.let { KV("Địa chỉ", listOfNotNull(o["receiver"].sn, it).joinToString(" · ")) }; o["warehouse"].sn?.let { KV("Kho", it) }; o["returnedReason"].sn?.let { KV("Lý do hoàn", it) }; o["note"].sn?.let { T(it, 13.sp) } } }
            o["pancakeUrl"].sn?.let { u -> OutlineButton("Mở trên Pancake POS") { openUrl(ctx, u) } }
        } else if (d.error == null) { Thinking(); Skeleton() }
    }
}

// ---------- Hồ sơ khách ----------
@Composable fun CustomerScreen(posId: String, phone: String) {
    val ctx = LocalContext.current
    var tab by remember { mutableStateOf("overview") }
    val d = load(posId, phone) { Api.customer(posId, phone) }
    SubPage("Hồ sơ khách hàng", d.loading && d.data != null, { d.reload() }) {
        ErrorLine(d.error)
        val c = d.data
        if (c != null) {
            val st = c["stats"]; val pr = c["profile"]; val name = st["name"].sn ?: "Khách"
            Panel {
                Row {
                    Avatar(name, 56.dp); Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        T(name, 16.sp, FontWeight.Bold)
                        Tag(if (st["successOrders"].d >= 3) "Khách hàng thân thiết" else if (st["successOrders"].d > 0) "Đã mua hàng" else "Chưa mua", if (st["successOrders"].d > 0) Tone.Green else Tone.Gray)
                        T("☎ $phone", 11.sp, color = C.inkSoft)
                        pr["address"].sn?.let { T("⌖ " + listOfNotNull(it, pr["province"].sn).joinToString(", "), 11.sp, color = C.inkSoft, maxLines = 1) }
                        Row(verticalAlignment = Alignment.CenterVertically) { PosBadge(posId, 18.dp); Spacer(Modifier.width(5.dp)); T("Khách từ ${Fmt.day(st["firstOrderAt"].sn ?: pr["customerSince"].sn)} · ${c["posName"].sn ?: Pos.name(posId)}", 11.sp, color = C.inkSoft) }
                    }
                    Column(Modifier.clip(RoundedCornerShape(10.dp)).background(C.brandSoft).padding(10.dp)) { T("Tổng chi tiêu", 9.sp, color = C.inkSoft); T(Fmt.vnd(st["successNet"].d), 13.sp, FontWeight.Bold, C.good); T("Số đã mua", 9.sp, color = C.inkSoft); T(Fmt.int(st["successOrders"].d), 13.sp, FontWeight.Bold) }
                }
            }
            Segmented(tab, listOf("overview" to "Tổng quan", "history" to "Lịch sử mua", "care" to "CSKH", "notes" to "Ghi chú")) { tab = it }
            val orders = c["orders"].list
            when (tab) {
                "history" -> Panel { OrderTimeline(orders) }
                "care" -> Panel {
                    T("Nhân viên chăm sóc", 13.sp, FontWeight.Bold)
                    st["sellerName"].sn?.let { s -> Row(verticalAlignment = Alignment.CenterVertically) { Avatar(s, 40.dp); Spacer(Modifier.width(10.dp)); Column { T(s, 13.sp, FontWeight.SemiBold); T("Người phụ trách hiện tại", 10.sp, color = C.inkSoft) } } } ?: T("Chưa gán người phụ trách.", 12.sp, color = C.inkSoft)
                    if (pr["marketers"].size > 0) T("Marketing: ${pr["marketers"].strings.joinToString(", ")}", 11.sp, color = C.inkSoft)
                    if (pr["sources"].size > 0) T("Nguồn: ${pr["sources"].strings.joinToString(", ")}", 11.sp, color = C.inkSoft)
                    if (pr["tags"].size > 0) ChipRow { pr["tags"].strings.take(6).forEach { Tag(it, Tone.Blue) } }
                }
                "notes" -> Panel {
                    T("Ghi chú", 13.sp, FontWeight.Bold)
                    val notes = pr["notes"].strings + orders.mapNotNull { o -> o["note"].sn?.let { "Đơn #${o["sourceOrderId"].s}: $it" } }
                    if (notes.isEmpty()) T("Chưa có ghi chú.", 12.sp, color = C.inkSoft)
                    notes.forEach { T("❝ $it", 12.sp) }
                }
                else -> {
                    Grid2(listOf(
                        { m -> KpiCard(Icons.Filled.ShoppingCart, C.good, "Đơn tạo / chốt", "${Fmt.int(st["orders"].d)} / ${Fmt.int(st["closedOrders"].d)}", modifier = m) },
                        { m -> KpiCard(Icons.Filled.Verified, C.good, "Mua thành công", Fmt.int(st["successOrders"].d), modifier = m) },
                        { m -> KpiCard(Icons.Filled.Payments, C.teal, "Giá trị TB đơn", Fmt.short(st["averageOrder"].d) + " ₫", modifier = m) },
                        { m -> KpiCard(Icons.Filled.Undo, C.warn, "Hoàn / hủy", "${Fmt.int(st["returnedOrders"].d)} / ${Fmt.int(st["cancelledOrders"].d)}", modifier = m) },
                    ))
                    Panel { SectionHead("Lịch sử mua hàng", "Xem tất cả") { tab = "history" }; OrderTimeline(orders.take(4)) }
                    st["sellerName"].sn?.let { s -> Panel { T("Nhân viên chăm sóc", 13.sp, FontWeight.Bold); Row(verticalAlignment = Alignment.CenterVertically) { Avatar(s, 40.dp); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T(s, 13.sp, FontWeight.SemiBold); T("Chuyên viên phụ trách", 10.sp, color = C.inkSoft) } } } }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(C.brandDeep).clickable { openUrl(ctx, "tel:$phone") }.padding(vertical = 12.dp), horizontalArrangement = Arrangement.Center) { Icon(Icons.Filled.Call, null, tint = Color.White, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); T("Gọi điện", 13.sp, FontWeight.Bold, Color.White) }
                Row(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(C.brandSoft).clickable { openUrl(ctx, "sms:$phone") }.padding(vertical = 12.dp), horizontalArrangement = Arrangement.Center) { Icon(Icons.Filled.Sms, null, tint = C.brandDeep, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); T("Nhắn tin", 13.sp, FontWeight.Bold, C.brandDeep) }
            }
        } else if (d.error == null) { Thinking(); Skeleton() }
    }
}

@Composable fun OrderTimeline(orders: List<J>) {
    val nav = LocalNav.current
    if (orders.isEmpty()) T("Chưa có đơn.", 12.sp, color = C.inkSoft)
    orders.forEach { o ->
        Row(Modifier.fillMaxWidth().clickable { nav.push(Screen.Order(o["id"].s)) }.padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.padding(top = 5.dp).size(9.dp).clip(CircleShape).background(C.good)); Spacer(Modifier.width(10.dp))
            Column(Modifier.width(78.dp)) { T(Fmt.day(o["createdAt"].sn), 12.sp, FontWeight.SemiBold); T(Fmt.time(o["createdAt"].sn).take(5), 9.sp, color = C.inkSoft) }
            Column(Modifier.weight(1f)) { T("Đơn #${o["sourceOrderId"].s}", 12.sp); o["successRank"].dn?.let { r -> T(if (r.toInt() == 1) "Lần đầu" else "Mua lại ${r.toInt() - 1}", 9.sp, FontWeight.SemiBold, C.good) } ?: T(o["items"].list.mapNotNull { it["name"].sn }.joinToString(", "), 9.sp, color = C.inkSoft, maxLines = 1) }
            Column(horizontalAlignment = Alignment.End) { T(Fmt.vnd(o["net"].d), 12.sp, FontWeight.Bold); Tag(o["statusName"].s, statusTone(o["statusCode"].dn?.toInt())) }
        }
    }
}

@Composable fun CustomerSearchScreen() {
    val nav = LocalNav.current
    var q by remember { mutableStateOf("") }
    var pos by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<J>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var searched by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun run() = scope.launch { if (q.isBlank()) { results = emptyList(); return@launch }; busy = true; results = runCatching { Api.orders(OrderQuery(posIds = if (pos.isEmpty()) emptyList() else listOf(pos), q = q.trim()), 1)["orders"].list }.getOrDefault(emptyList()); busy = false; searched = true }
    SubPage("Hồ sơ khách hàng") {
        PageTitle("Hồ sơ khách hàng", "Tìm theo số điện thoại hoặc tên", Icons.Filled.Badge)
        SearchBox(q, "Số điện thoại hoặc tên khách hàng", Modifier.fillMaxWidth(), { q = it }) { run() }
        PosSelectMenu(pos, full = true) { pos = it; run() }
        if (busy) Thinking(listOf("Đang tìm khách hàng…", "Đang đối chiếu 6 POS…", "Sắp xong…"))
        val seen = mutableSetOf<String>()
        results.filter { it["phone"].sn != null && seen.add(it["posId"].s + it["phone"].s) }.forEach { r ->
            Panel(12.dp, onClick = { nav.push(Screen.Customer(r["posId"].s, r["phone"].s)) }) { Row(verticalAlignment = Alignment.CenterVertically) { Avatar(r["customer"].sn ?: "K", 40.dp); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T(r["customer"].sn ?: "Khách", 13.sp, FontWeight.SemiBold); PosLabel(r["posId"].s, "${r["phone"].s} · ${r["posName"].s}") }; Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft) } }
        }
        if (searched && results.isEmpty() && !busy) Panel { T("Không thấy khách khớp.", 12.sp, color = C.inkSoft) }
    }
}
