package vn.megatech.tonghoppos

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import org.json.JSONObject
import java.util.Locale

/**
 * "Cách tính" dùng chung với web: lưu trên máy chủ theo tài khoản (/api/prefs/metrics). Api gắn rateBase / returnBase /
 * success vào mọi URL /api/reports/…; load() lấy [query] làm khoá nên đổi cách tính là các màn báo cáo tự tải lại.
 */
object MetricPrefs {
    var rateBase by mutableStateOf("created"); private set
    var returnBase by mutableStateOf("shipped"); private set
    var success by mutableStateOf("delivered"); private set
    /** Tài khoản có cách tính riêng (khác mặc định công ty). */
    var own by mutableStateOf(false); private set
    var labels by mutableStateOf<J?>(null); private set
    /** Ngưỡng màu tỷ lệ chốt (labels.rateThresholds): xanh từ rateGood, cam từ rateWarn, còn lại đỏ. */
    var rateGood by mutableDoubleStateOf(40.0); private set
    var rateWarn by mutableDoubleStateOf(25.0); private set

    val query get() = "rateBase=$rateBase&returnBase=$returnBase&success=$success"
    val assigned get() = rateBase == "assigned"
    /** "tạo" / "chia" trong phân số "X chốt / Y …". */
    val denWord get() = if (assigned) "chia" else "tạo"
    val rateHint get() = labels?.get("rateBases")?.get(rateBase)?.get("hint")?.sn ?: if (assigned) "Đơn chốt ÷ đơn được chia cho người bán trong kỳ" else "Như Pancake: đơn chốt ÷ (tổng đơn − đơn xóa)"
    val rateShort get() = labels?.get("rateBases")?.get(rateBase)?.get("short")?.sn ?: if (assigned) "chốt ÷ đơn chia" else "chốt ÷ đơn lên"

    private fun apply(j: J) {
        val s = j["settings"]
        rateBase = if (s["rateBase"].s == "assigned") "assigned" else "created"
        returnBase = s["returnBase"].s.takeIf { it == "closed" || it == "created" } ?: "shipped"
        success = if (s["success"].s == "sent") "sent" else "delivered"
        own = j["own"].b
        if (!j["labels"].isNull) labels = j["labels"]
        j["labels"]["rateThresholds"].let { th -> th["good"].dn?.let { rateGood = it }; th["warn"].dn?.let { rateWarn = it } }
    }
    suspend fun load() { runCatching { Api.get("/api/prefs/metrics") }.onSuccess { apply(it) } }
    suspend fun save(rate: String = rateBase, ret: String = returnBase, suc: String = success) =
        apply(Api.send("/api/prefs/metrics", "PUT", mapOf("rateBase" to rate, "returnBase" to ret, "success" to suc)))
    suspend fun reset() = apply(Api.send("/api/prefs/metrics", "PUT", mapOf("scope" to "reset")))
    fun clear() { rateBase = "created"; returnBase = "shipped"; success = "delivered"; own = false; labels = null; rateGood = 40.0; rateWarn = 25.0 }
}

/** Tỷ lệ chốt theo cách tính đang chọn (máy chủ điền `rate`); bản cũ chưa có `rate` thì lấy closeRate / assignedCloseRate. */
val J.rate: Double? get() =
    if ((v as? JSONObject)?.has("rate") == true) this["rate"].dn
    else (if (MetricPrefs.assigned) this["assignedCloseRate"] else this["closeRate"]).dn
val J.rateD: Double get() = rate ?: 0.0
/** Mẫu số tỷ lệ chốt: đơn tạo hoặc đơn chia. */
val J.rateDen: Double get() = if (MetricPrefs.assigned) this["assignedOrders"].d else this["orders"].d
/** "12 chốt / 30 tạo" hoặc "12 chốt / 30 chia". */
val J.rateFrac: String get() = "${Fmt.int(this["closedOrders"].d)} chốt / ${Fmt.int(rateDen)} ${MetricPrefs.denWord}"
/** "12 / 30" cho cột hẹp. */
val J.rateFracShort: String get() = "${Fmt.int(this["closedOrders"].d)} / ${Fmt.int(rateDen)}"

/** Biểu tượng chỉ số dùng chung với web (lib/metric-icons.ts → res/drawable/ic_m_*.xml, nét đen, tô bằng tint). */
object MI {
    val orders: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_orders)
    val closed: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_closed)
    val revenue: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_revenue)
    val aov: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_aov)
    val rate: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_rate)
    val returned: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_returned)
    val cancelled: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_cancelled)
    val shipping: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_shipping)
    val calls: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_calls)
    val upsell: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_upsell)
    val marketing: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_marketing)
    val kpi: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_kpi)
    val customers: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_customers)
    val products: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_products)
    val staff: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_staff)
    val time: ImageVector @Composable get() = ImageVector.vectorResource(R.drawable.ic_m_time)
}

// ---------- Màn Cách tính (tab Thêm) ----------
@Composable fun MetricSettingsScreen() {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val d = load(Unit) { MetricPrefs.load(); true }
    val lb = MetricPrefs.labels
    fun options(group: String, fallback: List<Pair<String, String>>): List<Triple<String, String, String>> =
        lb?.get(group)?.let { g -> g.keys.map { Triple(it, g[it]["label"].s, g[it]["hint"].s) } }?.takeIf { it.isNotEmpty() } ?: fallback.map { Triple(it.first, it.second, "") }
    fun change(rate: String = MetricPrefs.rateBase, ret: String = MetricPrefs.returnBase, suc: String = MetricPrefs.success) {
        if (busy) return
        scope.launch { busy = true; try { MetricPrefs.save(rate, ret, suc); Notice.show("Đã lưu cách tính. Các báo cáo đang tải lại.") } catch (e: Exception) { Notice.show(e.message ?: "Không lưu được.", true) } finally { busy = false } }
    }
    SubPage("Cách tính", d.loading && d.data != null, { d.reload() }) {
        PageTitle("Cách tính chỉ số", "Chọn mẫu số cho tỷ lệ chốt, tỷ lệ hoàn và đơn mua thành công")
        ErrorLine(d.error)
        if (lb == null && d.loading) { Thinking(); return@SubPage }
        CalcGroup("Tỷ lệ chốt so với", MI.rate, C.purple, options("rateBases", listOf("created" to "Đơn lên", "assigned" to "Data được chia")), MetricPrefs.rateBase, busy) { change(rate = it) }
        CalcGroup("Tỷ lệ hoàn chia cho", MI.returned, C.warn, options("returnBases", listOf("shipped" to "Đơn đã gửi ĐVVC", "closed" to "Đơn chốt", "created" to "Đơn lên")), MetricPrefs.returnBase, busy) { change(ret = it) }
        CalcGroup("Mua thành công gồm", Icons.Filled.CheckCircle, C.good, options("successBases", listOf("delivered" to "Đã nhận + Đã thu tiền", "sent" to "Thêm cả Đã gửi hàng")), MetricPrefs.success, busy) { change(suc = it) }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.blue.copy(alpha = .08f)).padding(12.dp)) {
            Icon(Icons.Filled.Info, null, tint = C.blue); Spacer(Modifier.width(8.dp))
            T("Lưu theo tài khoản: web và app dùng chung. Khối Số tham chiếu Pancake luôn giữ cách Pancake tính.", 11.sp, color = C.inkSoft)
        }
        if (MetricPrefs.own) OutlineButton(if (busy) "Đang lưu…" else "Về mặc định công ty") {
            if (!busy) scope.launch { busy = true; try { MetricPrefs.reset(); Notice.show("Đã về cách tính mặc định của công ty.") } catch (e: Exception) { Notice.show(e.message ?: "Không lưu được.", true) } finally { busy = false } }
        }
    }
}

@Composable private fun CalcGroup(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, options: List<Triple<String, String, String>>, selected: String, busy: Boolean, pick: (String) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) { IconBox(icon, tint, 26.dp); Spacer(Modifier.width(8.dp)); T(title, 13.sp, FontWeight.Bold, C.inkSoft) }
    Panel(0.dp) {
        options.forEachIndexed { i, (key, label, hint) ->
            val on = key == selected
            Row(Modifier.fillMaxWidth().clickable(enabled = !busy && !on) { pick(key) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { T(label, 14.sp, if (on) FontWeight.Bold else FontWeight.Medium); if (hint.isNotEmpty()) T(hint, 11.sp, color = C.inkSoft) }
                Spacer(Modifier.width(8.dp))
                if (on) Icon(Icons.Filled.CheckCircle, null, tint = C.good) else Icon(Icons.Filled.RadioButtonUnchecked, null, tint = C.inkSoft.copy(alpha = .35f))
            }
            if (i < options.lastIndex) Divider0(12.dp)
        }
    }
}

// ---------- Khối Số tham chiếu Pancake ----------
private class RefSum(val orders: Double, val sales: Double, val revenue: Double, val profit: Double?, val quantity: Double)

/** RefPos → phần số dùng: pancake nếu có, không thì web. */
private fun refPart(p: J): J = if (p["pancake"].isNull) p["web"] else p["pancake"]
private fun refSum(list: List<J>, ch: String): RefSum {
    val bs = list.map { refPart(it)[ch] }
    return RefSum(bs.sumOf { it["orders"].d }, bs.sumOf { it["sales"].d }, bs.sumOf { it["revenue"].d },
        if (bs.isEmpty() || bs.any { it["profit"].dn == null }) null else bs.sumOf { it["profit"].d }, bs.sumOf { it["quantity"].d })
}

/** Số tham chiếu Pancake cho kỳ + POS đang xem (luôn theo cách Pancake tính, không đổi theo "Cách tính"). */
@Composable fun PancakeRefBlock(a: String, b: String, posIds: List<String>) {
    val d = load(a, b, posIds.joinToString(",")) { Api.pancakeRef(a, b, posIds) }
    var ch by remember { mutableStateOf("total") }
    Panel {
        val cur = d.data?.get("current")?.list; val prv = d.data?.get("previous")?.list ?: emptyList()
        Row(verticalAlignment = Alignment.CenterVertically) {
            T("Số tham chiếu Pancake", 15.sp, FontWeight.Bold, modifier = Modifier.weight(1f))
            if (!cur.isNullOrEmpty()) { val pc = cur.all { it["source"].s == "pancake" }; Tag(if (pc) "Lấy từ Pancake" else "Web tự tính", if (pc) Tone.Green else Tone.Gray, dot = true) }
        }
        Segmented(ch, listOf("total" to "Tổng cộng", "online" to "Online", "counter" to "Bán tại quầy")) { ch = it }
        if (cur == null) { ErrorLine(d.error); if (d.error == null) Skeleton(120.dp, border = false); return@Panel }
        val c = refSum(cur, ch); val p = refSum(prv, ch)
        fun money(n: Double) = Fmt.short(n) + " ₫"
        fun dec2(n: Double) = String.format(Locale.US, "%.2f", n).replace('.', ',')
        val aov = if (c.orders > 0) c.revenue / c.orders else 0.0; val pAov = if (p.orders > 0) p.revenue / p.orders else 0.0
        val spo = if (c.orders > 0) c.quantity / c.orders else 0.0; val pSpo = if (p.orders > 0) p.quantity / p.orders else 0.0
        GridN(2, listOf(
            { m -> RefCell(MI.revenue, "Doanh số", money(c.sales), c.sales, p.sales, m) },
            { m -> RefCell(MI.revenue, "Doanh thu", money(c.revenue), c.revenue, p.revenue, m) },
            { m -> RefCell(MI.kpi, "Lợi nhuận", c.profit?.let { money(it) } ?: "—", c.profit, p.profit, m) },
            { m -> RefCell(MI.closed, "Đơn chốt", Fmt.int(c.orders), c.orders, p.orders, m) },
            { m -> RefCell(MI.aov, "GTTB", money(aov), aov, pAov, m) },
            { m -> RefCell(MI.products, "SL sản phẩm", Fmt.int(c.quantity), c.quantity, p.quantity, m) },
            { m -> RefCell(MI.products, "SP trung bình", dec2(spo), spo, pSpo, m) },
        ))
        val tq = cur.sumOf { refPart(it)["total"]["quantity"].d }; val ptq = prv.sumOf { refPart(it)["total"]["quantity"].d }
        val rq = cur.sumOf { refPart(it)["returned"]["quantity"].d }; val prq = prv.sumOf { refPart(it)["returned"]["quantity"].d }
        Row(verticalAlignment = Alignment.CenterVertically) {
            T("Hàng chốt ", 11.sp, color = C.inkSoft); T(Fmt.int(tq), 11.sp, FontWeight.Bold); RefDelta(tq, ptq, true)
            T("  ·  Hàng hoàn ", 11.sp, color = C.inkSoft); T(Fmt.int(rq), 11.sp, FontWeight.Bold); RefDelta(rq, prq, false)
        }
        val on = cur.sumOf { refPart(it)["online"]["revenue"].d }; val ct = cur.sumOf { refPart(it)["counter"]["revenue"].d }
        val all = (on + ct).takeIf { it > 0 }
        StackedBar(listOf(Triple("Online ${Fmt.pct0(all?.let { on / it * 100 })}", on, C.blue), Triple("Tại quầy ${Fmt.pct0(all?.let { ct / it * 100 })}", ct, C.warn)))
        val ps = d.data?.get("prevStart")?.sn; val pe = d.data?.get("prevEnd")?.sn
        if (ps != null && pe != null) T("% so với ${Fmt.day(ps).take(5)}–${Fmt.day(pe).take(5)}", 10.sp, color = C.inkSoft)
        cur.filter { it["error"].sn != null }.takeIf { it.isNotEmpty() }?.let { bad -> T("Chưa lấy được từ Pancake: ${bad.joinToString { Pos.short(it["posId"].s) }} · dùng số web tự tính.", 10.sp, color = C.warn) }
    }
}

@Composable private fun RefCell(icon: ImageVector, label: String, value: String, now: Double?, prev: Double?, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(10.dp)).background(Color(0x0A000000)).padding(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, Modifier.size(13.dp), tint = C.inkSoft); Spacer(Modifier.width(4.dp)); T(label, 9.sp, color = C.inkSoft, maxLines = 1) }
        Rolling(value, 15.sp)
        if (now != null && prev != null) RefDelta(now, prev, true)
    }
}

/** % so kỳ trước với mũi tên; ẩn khi cả hai bằng 0. upGood = false khi tăng là xấu (hàng hoàn). */
@Composable private fun RefDelta(now: Double, prev: Double, upGood: Boolean) {
    if (now == 0.0 && prev == 0.0) return
    val txt = Fmt.delta(now, prev) ?: return
    val up = !txt.startsWith("-"); val good = if (upGood) up else !up
    val c = if (txt == "+0%" || txt == "-0%") C.inkSoft else if (good) C.good else C.bad
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(if (up) Icons.Filled.ArrowDropUp else Icons.Filled.ArrowDropDown, null, Modifier.size(16.dp), tint = c)
        T(txt, 10.sp, FontWeight.SemiBold, c, 1)
    }
}
