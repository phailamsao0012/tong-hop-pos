package vn.megatech.tonghoppos

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

object Fmt {
    private val sym = DecimalFormatSymbols(Locale.US).apply { groupingSeparator = '.'; decimalSeparator = ',' }
    private val intF = DecimalFormat("#,##0", sym)
    fun int(n: Double) = intF.format(n.roundToLong())
    fun int(n: Int) = intF.format(n.toLong())
    fun money(n: Double) = "${int(n)} ₫"
    fun vnd(n: Double) = "${int(n)}đ"
    private fun dec(n: Double, digits: Int) = String.format(Locale.US, "%.${digits}f", n).replace('.', ',')
    /** 1,23 tỷ · 456,7 tr · 12.000 */
    fun short(n: Double): String { val a = abs(n); return when { a >= 1e9 -> dec(n / 1e9, 2) + " tỷ"; a >= 1e6 -> dec(n / 1e6, 1) + " tr"; else -> int(n) } }
    fun pct(n: Double?): String = if (n == null || n.isNaN()) "—" else dec(n, 1) + "%"
    fun pct0(n: Double?): String = if (n == null || n.isNaN()) "—" else String.format(Locale.US, "%.0f%%", n)
    /** Chênh lệch % so kỳ trước: "+12%" / "-8%" */
    fun delta(now: Double, prev: Double?): String? { if (prev == null || prev <= 0) return null; val d = (now - prev) / prev * 100; return (if (d >= 0) "+" else "") + String.format(Locale.US, "%.0f%%", d) }
    fun points(d: Double) = (if (d >= 0) "+" else "") + dec(d, 1) + " điểm"

    val tz: ZoneId = ZoneId.of("Asia/Ho_Chi_Minh")
    fun parse(iso: String?): Instant? {
        if (iso.isNullOrEmpty()) return null
        return runCatching { Instant.parse(if (iso.endsWith("Z") || iso.contains('+')) iso else iso + "Z") }.getOrNull()
            ?: runCatching { LocalDateTime.parse(iso.replace(' ', 'T')).toInstant(ZoneOffset.UTC) }.getOrNull()
    }
    /** "2026-09-24" → "24/09/2026" */
    fun day(s: String?): String { if (s == null || s.length < 10) return "—"; val p = s.take(10).split("-"); return if (p.size == 3) "${p[2]}/${p[1]}/${p[0]}" else s.take(10) }
    fun time(iso: String?): String = parse(iso)?.atZone(tz)?.format(DateTimeFormatter.ofPattern("HH:mm dd/MM")) ?: ""
    fun dateTime(iso: String?): String = parse(iso)?.atZone(tz)?.format(DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy")) ?: "—"
    fun minutesAgo(iso: String?): Int = parse(iso)?.let { ChronoUnit.MINUTES.between(it, Instant.now()).toInt() } ?: 99999
    fun ago(iso: String?): String { val m = minutesAgo(iso); return when { m >= 99999 -> "—"; m < 1 -> "vừa xong"; m < 60 -> "$m phút trước"; m < 1440 -> "${m / 60} giờ trước"; else -> "${m / 1440} ngày trước" } }
}

object VNDate {
    fun today(): LocalDate = LocalDate.now(Fmt.tz)
    fun str(d: LocalDate): String = d.toString()
    fun add(days: Long, from: LocalDate = today()) = from.plusDays(days)
    fun monthStart(d: LocalDate = today()) = d.withDayOfMonth(1)
    fun lastMonth(): Pair<String, String> { val s = monthStart().minusMonths(1); return s.toString() to s.withDayOfMonth(s.lengthOfMonth()).toString() }
    fun monthEnd(ym: String): String { val d = LocalDate.parse(ym.take(7) + "-01"); return d.withDayOfMonth(d.lengthOfMonth()).toString() }
    fun shiftMonth(ym: String, n: Long): String = LocalDate.parse(ym.take(7) + "-01").plusMonths(n).toString().take(7)
    fun pretty(d: LocalDate = today()) = "${d.dayOfMonth} Thg ${d.monthValue}, ${d.year}"
    fun week(offset: Long): Pair<String, String> {
        val now = today().plusWeeks(offset)
        val start = now.minusDays((now.dayOfWeek.value - 1).toLong())
        val end = minOf(today(), start.plusDays(6))
        return start.toString() to end.toString()
    }
}

/** Kỳ báo cáo: các mốc nhanh như web + khoảng tuỳ chọn. */
sealed class Period(val key: String, val title: String) {
    data object Today : Period("today", "Hôm nay")
    data object Yesterday : Period("yesterday", "Hôm qua")
    data object Week : Period("week", "7 ngày")
    data object Month : Period("month", "Tháng này")
    data object Last : Period("last", "Tháng trước")
    data object D30 : Period("d30", "30 ngày")
    data object D60 : Period("d60", "60 ngày")
    data object D90 : Period("d90", "90 ngày")
    data class Custom(val a: String, val b: String) : Period("custom:$a:$b", if (a == b) Fmt.day(a) else "${Fmt.day(a).take(5)} – ${Fmt.day(b).take(5)}")

    val range: Pair<String, String>
        get() {
            val t = VNDate.today()
            return when (this) {
                Today -> t.toString() to t.toString()
                Yesterday -> t.minusDays(1).toString().let { it to it }
                Week -> t.minusDays(6).toString() to t.toString()
                Month -> VNDate.monthStart().toString() to t.toString()
                Last -> VNDate.lastMonth()
                D30 -> t.minusDays(29).toString() to t.toString()
                D60 -> t.minusDays(59).toString() to t.toString()
                D90 -> t.minusDays(89).toString() to t.toString()
                is Custom -> minOf(a, b) to maxOf(a, b)
            }
        }
    /** Kỳ liền trước cùng độ dài. */
    val previous: Pair<String, String>
        get() {
            val (a, b) = range; val da = LocalDate.parse(a); val db = LocalDate.parse(b)
            val len = ChronoUnit.DAYS.between(da, db) + 1
            return da.minusDays(len).toString() to db.minusDays(len).toString()
        }
    val label: String get() { val (a, b) = range; return if (a == b) Fmt.day(a) else "${Fmt.day(a)} – ${Fmt.day(b)}" }
    companion object { val presets = listOf(Today, Yesterday, Week, Month, Last, D30, D90) }
}

/** Bộ lọc được mang theo khi đi sâu tới danh sách đơn. */
data class OrderQuery(
    val start: String = "", val end: String = "", val posIds: List<String> = emptyList(), val group: String = "",
    val sellerId: String = "", val basis: String = "created", val q: String = "", val hour: Int? = null,
    val title: String = "Đơn hàng", val team: String = "all", val product: String = "all",
) {
    val queryString: String get() = buildList {
        add("posIds=${posIds.joinToString(",")}"); add("start=$start"); add("end=$end"); add("basis=$basis")
        if (group.isNotEmpty()) add("group=$group"); if (sellerId.isNotEmpty()) add("sellerId=$sellerId")
        hour?.let { add("hour=$it") }; if (team != "all") add("team=$team"); if (product != "all") add("productSegment=$product")
        if (q.isNotEmpty()) add("q=${Api.enc(q)}")
    }.joinToString("&")
    val contextLine: String get() = buildString {
        append(if (start == end) Fmt.day(start) else "${Fmt.day(start)} – ${Fmt.day(end)}")
        append(when (basis) { "confirmed" -> " · theo ngày chốt"; "assigned" -> " · theo ngày chia"; else -> " · theo ngày tạo" })
        hour?.let { append(" · $it:00–${it + 1}:00") }
        if (team != "all") append(" · " + if (team == "sale") "Sale" else "CSKH")
        if (product != "all") append(" · " + if (product == "gentadox") "Gentadox" else "SK + GK")
        if (posIds.isNotEmpty()) append(" · " + posIds.joinToString(", ") { Pos.name(it) })
    }
}

object Pos {
    val order = listOf("sieu-vo-gao", "mgt-apex", "thuy-san", "bio-nano", "megaroot", "oxytetra")
    private val names = mapOf("sieu-vo-gao" to "Siêu Vô Gạo", "mgt-apex" to "MGT - APEX", "thuy-san" to "Thủy sản Megatech", "bio-nano" to "BIO NANO", "megaroot" to "MEGAROOT", "oxytetra" to "Oxytetra - Megatech")
    private val shorts = mapOf("sieu-vo-gao" to "Siêu Vô Gạo", "mgt-apex" to "MGT APEX", "thuy-san" to "Thủy sản", "bio-nano" to "BIO NANO", "megaroot" to "MEGAROOT", "oxytetra" to "Oxytetra")
    fun name(id: String) = names[id] ?: id
    fun short(id: String) = shorts[id] ?: id
}
