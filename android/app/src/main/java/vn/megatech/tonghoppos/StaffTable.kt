package vn.megatech.tonghoppos

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

private val staffColumns = listOf("Nhân viên", "Số chia", "Đơn chốt", "Tỷ lệ chốt", "Đang đóng hàng", "Doanh thu")
private fun staffNumber(s: StaffRow, column: Int): Double? = when (column) {
    1 -> s.created; 2 -> s.closed; 3 -> s.closeRate; 4 -> s.packedRate; else -> s.closedNet
}
private fun staffCount(n: Double?) = n?.let { Fmt.int(it) } ?: "—"
private fun StaffSum.row() = StaffRow(null, "Tổng", null, created, createdClosed, closed, closedNet,
    closeRate, aov, packed, packedRate, confirmedNotPacked, cancelledBeforePack, waiting,
    closedFromCreated, closedFromEarlier, createdOpen)

// All values and explanation parts come from the response; missing parts stay missing.
private data class StaffWhy(val title: String, val rows: List<Pair<String, String>>, val definition: String)
private fun staffWhy(s: StaffRow, column: Int, definitions: StaffDefinitions?): StaffWhy {
    val rows = mutableListOf<Pair<String, String>>()
    fun count(label: String, value: Double?) { if (value != null) rows.add(label to Fmt.int(value)) }
    var definition = ""
    when (column) {
        1 -> { count("Số chia (đơn lên trong kỳ)", s.created); count("Trong đó đã chốt", s.createdClosed); count("Chưa chốt / hủy", s.createdOpen)
            definition = "Đơn tạo trong kỳ của nhân viên này (không tính đơn xóa), như ô Tất cả khi lọc NV xử lý trên Pancake." }
        2 -> { count("Đơn chốt trong kỳ", s.closed); count("Từ số chia kỳ này", s.closedFromCreated); count("Từ số chia trước đó", s.closedFromEarlier); definition = definitions?.closed.orEmpty() }
        3 -> { count("Số chia đã chốt", s.createdClosed); count("Tổng số chia", s.created); rows.add("Tỷ lệ" to Fmt.pct(s.closeRate))
            definition = "Trong số đơn chia trong kỳ, bao nhiêu đơn nay đã chốt — đơn chia hôm trước, hôm sau mới chốt vẫn tính cho ngày chia. Không vượt 100%." }
        4 -> { count("Đã vào Đang đóng hàng hoặc đi tiếp", s.packed); count("Còn Đã xác nhận, chưa đóng", s.confirmedNotPacked); count("Còn Chờ xác nhận", s.waiting); count("Hủy trước khi đóng", s.cancelledBeforePack); definition = definitions?.packed.orEmpty() }
        5 -> { s.closedNet?.let { rows.add("Doanh thu đơn chốt" to Fmt.money(it)) }; count("Số đơn chốt", s.closed); s.aov?.let { rows.add("GTTB" to Fmt.shortMoney(it)) }; definition = definitions?.closed.orEmpty() }
    }
    return StaffWhy(if (column == 4) "${s.name.orEmpty()} · đã vào Đang đóng hàng" else "${s.name.orEmpty()} · ${staffColumns[column]}", rows, definition)
}

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable fun StaffTableBlock(team: String, period: Period, pos: String) {
    val nav = LocalNav.current
    val (start, end) = period.range
    val by = if (team == "cskh") "care" else "seller"
    val positions = if (pos.isEmpty()) emptyList() else listOf(pos)
    var loadedAt by remember(start, end, team, pos) { mutableLongStateOf(0L) }
    val data = key(start, end, team, pos) { load(start, end, team, pos) {
        Api.staffTable(start, end, positions, team, by).also {
            loadedAt = android.os.SystemClock.elapsedRealtime()
            if (BuildConfig.DEBUG && DebugTour.tour == "xnkho") {
                DebugTour.log("[XNKQ] path=${Api.staffTablePath(start, end, positions, team, by)}")
            }
        }
    } }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner, data) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && loadedAt != 0L &&
                android.os.SystemClock.elapsedRealtime() - loadedAt >= 60_000 && !data.loading) data.reload()
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
    var column by remember { mutableIntStateOf(5) }
    var descending by remember { mutableStateOf(true) }
    var expanded by remember(start, end, team, pos) { mutableStateOf(false) }
    var why by remember(start, end, team, pos) { mutableStateOf<StaffWhy?>(null) }
    val horizontal = rememberScrollState()
    val bringIntoView = remember { BringIntoViewRequester() }
    val table = data.data
    val rows = table?.staff.orEmpty().sortedWith { a, b ->
        val x = staffNumber(a, column); val y = staffNumber(b, column)
        val order = if (column == 0) a.name.orEmpty().compareTo(b.name.orEmpty()) else when {
            x == null && y != null -> return@sortedWith 1
            x != null && y == null -> return@sortedWith -1
            else -> (x ?: 0.0).compareTo(y ?: 0.0)
        }
        if (order == 0) a.sellerId.orEmpty().compareTo(b.sellerId.orEmpty()) else if (descending) -order else order
    }
    fun orders(s: StaffRow, packed: Boolean) {
        s.sellerId?.let { id -> nav.push(Screen.StaffOrders(StaffOrderQuery(team, by, start, end, positions, id, packed,
            title = "${s.name.orEmpty()} · ${if (packed) "đơn chốt đã vào Đang đóng hàng" else "tất cả đơn chốt"}"))) }
    }
    LaunchedEffect(table, data.loading, column, descending) {
        if (BuildConfig.DEBUG && table != null && !data.loading && data.error == null && DebugTour.tour in listOf("xnkho", "team")) {
            val prefix = if (DebugTour.tour == "team") "TEAM" else "XNK"
            if (prefix == "XNK") DebugTour.log("[XNK] bang team=$team nguoi=${Fmt.int(table.staff.size)} tong=${if (table.staffTotal != null) "co" else "khong"} tu=${table.period?.start.orEmpty()} den=${table.period?.end.orEmpty()}")
            fun log(s: StaffRow, index: String) { DebugTour.log("[$prefix] dong=$index chia=${staffCount(s.created)} chot=${staffCount(s.closed)} tl=${Fmt.pct(s.closeRate)} dh=${if (s.packed == null) "—" else "${staffCount(s.packed)}/${staffCount(s.closed)}"} tldh=${Fmt.pct(s.packedRate)} dt=${s.closedNet?.let { Fmt.short(it) } ?: "—"}") }
            rows.take(5).forEachIndexed { i, s -> log(s, Fmt.int(i + 1)) }
            table.staffTotal?.let { log(it.row(), "tong") }
            if (DebugTour.tour == "xnkho") DebugTour.tableReady = true
        }
    }
    if (BuildConfig.DEBUG) {
        LaunchedEffect(DebugTour.target, DebugTour.tick) {
            val first = rows.firstOrNull() ?: return@LaunchedEffect
            when (DebugTour.target) {
                "xnk-cot" -> { bringIntoView.bringIntoView(); horizontal.animateScrollTo(horizontal.maxValue) }
                "xnk-o" -> why = staffWhy(first, 4, table?.definitions)
                "xnk-dong" -> why = null
                "xnk-ds" -> if (first.packed != null) orders(first, true)
                "xnk-chot" -> orders(first, false)
            }
        }
    }
    androidx.compose.material3.pulltorefresh.PullToRefreshBox(data.loading, { data.reload() }) {
    Panel {
        T(if (team == "cskh") "Từng nhân viên CSKH" else "Từng nhân viên Sale", 15.sp, FontWeight.Bold, modifier = Modifier.bringIntoViewRequester(bringIntoView))
        T((if (team == "cskh") "Đơn chốt trong kỳ của từng người (NV chăm sóc trên đơn, trống thì người bán) · so cùng kỳ chọn ngay dưới · bấm số để xem từng đơn" else "Đơn chốt trong kỳ của từng người bán · Số chia = đơn lên trong kỳ (như ô Tất cả trên Pancake) · tỷ lệ chốt = số chia đã chốt ÷ số chia (không vượt 100%) · bấm số để xem từng đơn") + " · Tỷ lệ chốt ở bảng này không theo Cách tính", 11.sp)
        ErrorLine(data.error)
        if (table == null && data.loading) Thinking()
        TextButton({ data.reload() }) { T("Làm mới bảng") }
        if (table != null && rows.isEmpty()) T("Không có dữ liệu")
        val visible = (if (expanded) rows else rows.take(10)) + listOfNotNull(table?.staffTotal?.takeIf { (it.people ?: 0.0) > 1 }?.row())
        Row {
            Column(Modifier.width(132.dp)) {
                TextButton({ if (column == 0) descending = !descending else { column = 0; descending = false } }, Modifier.height(80.dp)) { T("Nhân viên") }
                visible.forEach { s -> Column(Modifier.height(56.dp).padding(4.dp)) { T(s.name.orEmpty(), maxLines = 1); T(s.department.orEmpty(), 10.sp, maxLines = 1) } }
            }
            Column(Modifier.horizontalScroll(horizontal)) {
                Row { (1..5).forEach { c -> Column(Modifier.width(if (c == 4) 220.dp else 145.dp).height(80.dp)) {
                    TextButton({ if (column == c) descending = !descending else { column = c; descending = true } }) { T(staffColumns[c], maxLines = 2) }
                    if (c == 4) T("Đơn chốt kho đã chuyển sang Đang đóng hàng (hoặc đã đi tiếp)", 9.sp, maxLines = 2)
                } } }
                visible.forEach { s -> Row {
                    (1..5).forEach { c -> Column(Modifier.width(if (c == 4) 220.dp else 145.dp).height(56.dp).padding(4.dp)) {
                        val value = when(c) { 3 -> Fmt.pct(s.closeRate); 4 -> Fmt.pct(s.packedRate); 5 -> s.closedNet?.let { Fmt.shortMoney(it) } ?: "—"; else -> staffCount(staffNumber(s, c)) }
                        T(value, weight = FontWeight.Bold, maxLines = 2, modifier = Modifier.clickable(enabled = c != 4 || s.packed != null) {
                            if (c == 2 && s.sellerId != null) orders(s, false) else why = staffWhy(s, c, table?.definitions)
                        })
                        if (c == 3) T("${staffCount(s.createdClosed)}/${staffCount(s.created)} đã chốt", 10.sp, maxLines = 2)
                        if (c == 4) T(if (s.packed == null) "—" else "${staffCount(s.packed)}/${staffCount(s.closed)} đơn chốt", 11.sp, FontWeight.Bold, maxLines = 2,
                            modifier = Modifier.semantics { contentDescription = "${s.name.orEmpty()} · ${staffCount(s.packed)} đơn chốt đã vào Đang đóng hàng" }.clickable(enabled = s.packed != null) {
                                if (s.sellerId == null) why = staffWhy(s, c, table?.definitions) else orders(s, true)
                            })
                    } }
                } }
            }
        }
        if (!expanded && rows.size > 10) TextButton({ expanded = true }) { T("Xem cả ${Fmt.int(rows.size)} người") }
    }
    }
    why?.let { explanation -> SafeSheet({ why = null }) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp)) {
            T(explanation.title, 17.sp, FontWeight.Bold)
            explanation.rows.forEach { (label, value) -> T("$label: $value", modifier = Modifier.padding(vertical = 5.dp)) }
            T(explanation.definition)
            TextButton({ why = null }) { T("Đóng") }
        }
    } }
}

@Composable fun StaffOrdersScreen(query: StaffOrderQuery) {
    val nav = LocalNav.current
    val data = load(query) { Api.staffOrders(query) }
    val result = data.data
    val orders = result?.orders.orEmpty()
    val row = result?.staff?.firstOrNull { it.sellerId == query.staffId }
    val expected = if (query.packed) row?.packed else row?.closed
    LaunchedEffect(result) {
        if (BuildConfig.DEBUG && DebugTour.tour == "xnkho" && result != null) {
            DebugTour.log("[XNK] ds dh=${if (query.packed) "1" else "0"} don=${Fmt.int(orders.size)} du=${if (expected == orders.size.toDouble()) "co" else "khong"}")
            DebugTour.ordersReady = true
        }
    }
    SubPage(query.title, data.loading, { data.reload() }) {
        ErrorLine(data.error)
        if (result == null && data.loading) Thinking()
        if (result != null && orders.isEmpty()) T("Không có đơn")
        if (expected != null && orders.size < expected) T("Đang hiện ${Fmt.int(orders.size)} đơn đầu trong ${Fmt.int(expected)} đơn")
        orders.forEach { order -> Panel(onClick = { order.id?.let { nav.push(Screen.Order(it)) } }) {
            T("#${order.orderCode.orEmpty()} · ${order.posName ?: order.posId.orEmpty()}")
            T("Giờ chốt: ${Fmt.dateTime(order.closedAt)}", 11.sp)
            T(order.net?.let { Fmt.money(it) } ?: "—")
            T(order.products.joinToString(", "), maxLines = 1)
        } }
    }
}
