package vn.megatech.tonghoppos

import android.content.SharedPreferences
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.math.abs

private val compareModes = listOf("previous" to "Kỳ liền trước", "weekday" to "Cùng thứ tuần trước",
    "monthday" to "Cùng ngày tháng trước", "year" to "Cùng kỳ năm trước", "custom" to "Tự chọn ngày")
private val compareKinds = listOf("wave" to "Lên xuống", "diff" to "Chênh lệch", "cum" to "Cộng dồn")
private val compareMetrics = listOf("closed" to "Đơn chốt", "closedNet" to "Doanh thu", "closeRate" to "Tỷ lệ chốt")

class CompareState(private val prefs: SharedPreferences) {
    var mode by mutableStateOf(prefs.getString("thp_cmp_mode", "previous").takeIf { raw -> compareModes.any { it.first == raw } } ?: "previous")
    var step by mutableIntStateOf(prefs.getString("thp_cmp_step", "1")?.toIntOrNull() ?: 1)
    var kind by mutableStateOf(prefs.getString("thp_cmp_kind", "wave").takeIf { raw -> compareKinds.any { it.first == raw } } ?: "wave")
    var metric by mutableStateOf("closed")
    var cstart by mutableStateOf<String?>(null)
    var cend by mutableStateOf<String?>(null)
    var focusId by mutableStateOf<String?>(null)
    val steps get() = when (mode) { "previous" -> listOf(1, 2, 3, 4); "weekday" -> listOf(1, 2, 3, 4, 8); "monthday" -> listOf(1, 2, 3, 6, 12); "year" -> listOf(1, 2); else -> emptyList() }
    val effectiveStep get() = step.takeIf { it in steps } ?: 1
    val bootstrap get() = mode == "custom" && (cstart == null || cend == null)
    val invalid get() = mode == "custom" && !bootstrap &&
        (runCatching { LocalDate.parse(cstart); LocalDate.parse(cend) }.isFailure || cstart!! > cend!! || cend!! > VNDate.today().toString())
    val requestKey get() = listOf(mode, effectiveStep, if (mode == "custom") cstart else null, if (mode == "custom") cend else null)
    fun save() { prefs.edit().putString("thp_cmp_mode", mode).putString("thp_cmp_step", Fmt.int(effectiveStep)).putString("thp_cmp_kind", kind).apply() }
    fun value(cell: CmpCell?): Double? = when (metric) { "closed" -> cell?.closed; "closedNet" -> cell?.closedNet; else -> cell?.closeRate }
    fun change(a: Double?, b: Double?) = if (metric == "closeRate") Fmt.changePoints(a, b) else Fmt.changePct(a, b)
    fun stepLabel(n: Int, days: Int): String = when (mode) {
        "weekday" -> if (days <= 7) "${Fmt.int(n)} tuần trước" else "lùi ${Fmt.int(n * ((days + 6) / 7))} tuần"
        "monthday" -> "${Fmt.int(n)} tháng trước"; "year" -> "${Fmt.int(n)} năm trước"; else -> "${Fmt.int(n)} kỳ trước"
    }
    fun label(days: Int): String {
        val n = effectiveStep
        if (mode == "custom" || n == 1 && (mode != "weekday" || days <= 7)) return compareModes.first { it.first == mode }.second
        return when (mode) { "weekday" -> "Cùng thứ, ${stepLabel(n, days)}"; "monthday" -> "Cùng ngày ${Fmt.int(n)} tháng trước"; "year" -> "Cùng kỳ ${Fmt.int(n)} năm trước"; else -> "Lùi ${Fmt.int(n)} kỳ" }
    }
}

@Composable fun rememberCompareState(): CompareState {
    val context = LocalContext.current
    return remember { CompareState(context.getSharedPreferences("megatech", 0)) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun CompareControls(state: CompareState, result: StaffCompare?, error: String?, loading: Boolean, focusName: String?, clearFocus: () -> Unit, controlsModifier: Modifier = Modifier, reload: () -> Unit) {
    val days = runCatching { java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(result?.period?.start), LocalDate.parse(result?.period?.end)).toInt() + 1 }.getOrDefault(1)
    if (BuildConfig.DEBUG) LaunchedEffect(DebugTour.tick) {
        if (DebugTour.tour == "xnkho" && DebugTour.target == "xnk-chart-wave") { state.kind = "wave"; state.save() }
    }
    var dateField by remember { mutableStateOf<String?>(null) }
    Column(controlsModifier) {
    T("So cùng kỳ")
    CompareMenu(state.mode, compareModes) { state.mode = it; state.save() }
    if (state.steps.size > 1) {
        T("Lùi bao xa", 11.sp)
        CompareMenu(Fmt.int(state.effectiveStep), state.steps.map { Fmt.int(it) to state.stepLabel(it, days) }) { state.step = it.toInt(); state.save() }
    }
    if (state.mode == "custom") {
        TextButton({ dateField = "start" }) { T("Kỳ so từ ngày: ${Fmt.day(state.cstart)}") }
        TextButton({ dateField = "end" }) { T("Kỳ so đến ngày: ${Fmt.day(state.cend)}") }
        if (state.invalid) T("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc và không sau hôm nay.", color = C.warn)
    }
    Segmented(state.kind, compareKinds) { state.kind = it; state.save() }
    T("Từng nhân viên:", 11.sp)
    Segmented(state.metric, compareMetrics) { state.metric = it }
    if (state.focusId != null) {
        Column(Modifier.fillMaxWidth().padding(8.dp)) {
            TextButton(clearFocus) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                T("Xem cả đội")
            }
            Row { T("Đang xem riêng "); T(focusName ?: "—", weight = FontWeight.Bold) }
        }
    } else T("Đang xem cả đội · bấm biểu đồ nhỏ ở cột So cùng kỳ để xem riêng từng người", 11.sp)
    ErrorLine(error)
    if (loading) T("Đang tải So cùng kỳ…", 11.sp)
    TextButton(reload) { T("Làm mới So cùng kỳ") }
    }
    result?.let { r ->
        val cutoff = r.compare?.cutoff
        fun span(a: String?, b: String?) = if (a == null || b == null) "—" else Fmt.cmpSpan(a, b)
        val suffix = cutoff?.let { " tới $it" }.orEmpty()
        val focused = r.staff.firstOrNull { it.sellerId == state.focusId }
        val current = state.value(if (state.focusId == null) r.current?.total else focused?.current)
        val previous = state.value(if (state.focusId == null) r.previous?.total else focused?.previous)
        fun summary(value: Double?) = if (state.metric == "closedNet") value?.let { Fmt.shortMoney(it) } ?: "—" else Fmt.cmpShort(value, state.metric)
        T("Kỳ này · ${if (r.period?.start == VNDate.today().toString() && r.period?.start == r.period?.end) "Hôm nay" else span(r.period?.start, r.period?.end)}$suffix: ${summary(current)}")
        T("${state.label(days)} · ${span(r.compare?.start, r.compare?.end)}$suffix: ${summary(previous)}")
        T("${state.change(current, previous)} so với kỳ so", color = compareTone(state, current, previous))
        if (cutoff != null) T("Kỳ đang xem chưa hết ngày nên kỳ so cũng chỉ tính tới $cutoff.", 11.sp)
        key(state.focusId) {
            (if (state.focusId == null) r.chart else focused?.chart)?.let { CompareChart(it, state.kind, state.metric, r) }
        }
    }
    dateField?.let { field ->
        val selected = if (field == "start") state.cstart else state.cend
        val picker = rememberDatePickerState(initialSelectedDateMillis = selected?.let { runCatching { LocalDate.parse(it).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli() }.getOrNull() },
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                    val day = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate().toString()
                    return day <= VNDate.today().toString() && if (field == "start") state.cend?.let { day <= it } ?: true else state.cstart?.let { day >= it } ?: true
                }
            })
        SafeDatePicker({ dateField = null }, confirmButton = {
            TextButton({ picker.selectedDateMillis?.let {
                val day = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()
                if (field == "start") state.cstart = day else state.cend = day
            }; dateField = null }) { T("Áp dụng") }
        }, dismissButton = { TextButton({ dateField = null }) { T("Hủy") } }) { DatePicker(picker) }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable fun CompareChart(chart: CmpChart, kind: String, metric: String, result: StaffCompare) {
    val len = (chart.len ?: 0).coerceAtLeast(0)
    if (len == 0) return
    val displayMetric = if (kind == "cum" && metric != "closed") "closedNet" else metric
    fun value(p: ChartPoint?): Double? = if (kind == "cum") {
        if (metric == "closed") p?.cumClosed else p?.cumClosedNet
    } else when (metric) { "closed" -> p?.closed; "closedNet" -> p?.closedNet; else -> p?.closeRate }
    val current = List(len) { value(chart.current.getOrNull(it)) }
    val previous = List(len) { value(chart.previous.getOrNull(it)) }
    val differences = List(len) { i -> current[i]?.let { a -> previous[i]?.let { a - it } } }
    var selected by remember(chart, kind, metric) { mutableStateOf<Int?>(null) }
    val bring = remember { BringIntoViewRequester() }
    if (BuildConfig.DEBUG) LaunchedEffect(chart, kind, metric) {
        if (DebugTour.tour == "xnkho") DebugTour.log("[XNK] bieu-do kind=$kind diem=${Fmt.int(len)}")
    }
    if (BuildConfig.DEBUG) LaunchedEffect(DebugTour.tick, chart, kind, metric) {
        if (DebugTour.tour == "xnkho") {
            val valid = current.indices.filter { current[it] != null }
            val slot = listOf("xnk-chart-first", "xnk-chart-middle", "xnk-chart-last").indexOf(DebugTour.target)
            if (slot >= 0 && valid.isNotEmpty()) {
                selected = listOf(valid.first(), valid[valid.size / 2], valid.last())[slot]
                bring.bringIntoView()
                val i = selected!!
                DebugTour.log("[XNK] cham kind=$kind i=${Fmt.int(i)} nay=${Fmt.chartPointValue(current[i], displayMetric)} so=${Fmt.chartPointValue(previous[i], displayMetric)} chenh=${Fmt.chartDiff(current[i], previous[i], displayMetric)?.first ?: "—"}")
                DebugTour.chartReady = true
            }
            if (DebugTour.target == "xnk-chart-clear") selected = null
        }
    }
    val title = when (kind) {
        "diff" -> "Mỗi cột là kỳ này trừ kỳ so: xanh lên là hơn, đỏ xuống là kém"
        "cum" -> "Cộng dồn từ đầu kỳ"
        else -> "Từng ngày (xem một ngày thì từng giờ) của kỳ này và kỳ so"
    }
    Column(Modifier.fillMaxWidth().bringIntoViewRequester(bring)) {
        T(title, 11.sp)
        Box {
            Canvas(Modifier.fillMaxWidth().height(160.dp).pointerInput(chart, kind, metric) {
                fun pick(x: Float) { selected = (((x - 58.dp.toPx()) / (size.width - 66.dp.toPx())) * len).toInt().coerceIn(0, len - 1) }
                detectDragGesturesAfterLongPress(onDragStart = { pick(it.x) }, onDrag = { change, _ -> change.consume(); pick(change.position.x) })
            }) {
                val left = 58.dp.toPx(); val right = size.width - 8.dp.toPx()
                val top = 8.dp.toPx(); val bottom = size.height - 23.dp.toPx()
                val values = (if (kind == "diff") differences else current + previous).filterNotNull()
                val low = minOf(0.0, values.minOrNull() ?: 0.0)
                val high = maxOf(0.0, values.maxOrNull() ?: 0.0).let { if (it == low) low + 1 else it }
                fun x(i: Int) = left + (i + .5f) / len * (right - left)
                fun y(v: Double) = bottom - ((v - low) / (high - low)).toFloat() * (bottom - top)
                val paint = android.graphics.Paint().apply { color = android.graphics.Color.GRAY; textSize = 9.sp.toPx(); isAntiAlias = true }
                repeat(3) { tick ->
                    val v = low + (high - low) * tick / 2
                    drawLine(C.line, Offset(left, y(v)), Offset(right, y(v)))
                    drawContext.canvas.nativeCanvas.drawText(Fmt.chartAxis(v, displayMetric), 0f, y(v), paint)
                }
                val ticks = ((0 until len step maxOf(1, (len + 4) / 5)).toList() + (len - 1)).distinct()
                paint.textAlign = android.graphics.Paint.Align.CENTER
                ticks.forEach { i -> drawContext.canvas.nativeCanvas.drawText(Fmt.chartX(i, result.bucket, kind == "cum", result.period?.start, maxOf(1, result.group ?: 1)), x(i), size.height - 3.dp.toPx(), paint) }
                if (kind == "diff") differences.forEachIndexed { i, d -> if (d != null) {
                    drawRect(if (d >= 0) C.good else C.bad, Offset(x(i) - (right - left) / len * .35f, minOf(y(d), y(0.0))),
                        Size((right - left) / len * .7f, abs(y(d) - y(0.0))))
                } } else listOf(previous to false, current to true).forEach { (points, now) ->
                    val path = Path(); var connected = false
                    points.forEachIndexed { i, v -> if (v == null) connected = false else {
                        if (connected) path.lineTo(x(i), y(v)) else path.moveTo(x(i), y(v))
                        connected = true
                        drawCircle(if (now) C.brand else C.inkSoft, 1.5.dp.toPx(), Offset(x(i), y(v)))
                    } }
                    drawPath(path, if (now) C.brand else C.inkSoft, style = Stroke((if (now) 2.dp else 1.5.dp).toPx(),
                        pathEffect = if (now) null else PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))))
                }
                selected?.let { drawLine(C.inkSoft, Offset(x(it), top), Offset(x(it), bottom)) }
            }
            selected?.let { i -> Column(Modifier.align(Alignment.TopEnd).fillMaxWidth(.85f).padding(6.dp)) {
                Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 2.dp) { Column(Modifier.padding(8.dp)) {
                    fun time(previous: Boolean) = Fmt.chartTime(i, result.bucket, kind == "cum", if (previous) result.compare?.start else result.period?.start, if (previous) result.compare?.end else result.period?.end, maxOf(1, result.group ?: 1))
                    T("Kỳ này ${time(false)}: ${Fmt.chartPointValue(current[i], displayMetric)}", 10.sp, color = C.brand)
                    T("Kỳ so ${time(true)}: ${Fmt.chartPointValue(previous[i], displayMetric)}", 10.sp)
                    Fmt.chartDiff(current[i], previous[i], displayMetric)?.let { (text, up) -> T("Chênh lệch: $text", 10.sp, color = if (up) C.good else C.bad) }
                } }
            } }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            T("━ Kỳ này", 10.sp, color = C.brand); T("┄ Kỳ so", 10.sp, color = C.inkSoft)
        }
    }
}

@Composable private fun CompareMenu(value: String, options: List<Pair<String, String>>, change: (String) -> Unit) {
    SelectMenu(options.firstOrNull { it.first == value }?.second.orEmpty(), options, onPick = change)
}

private fun compareTone(state: CompareState, a: Double?, b: Double?) = when (Fmt.changeTone(a, b, state.metric == "closeRate")) { 1 -> C.good; -1 -> C.bad; else -> C.inkSoft }

fun compareSeries(state: CompareState, series: CmpSeries?, rate: CmpSeriesRate?, current: Boolean, result: StaffCompare): List<Double?> {
    val tuples = (if (current) series?.current else series?.previous).orEmpty()
    val values = tuples.mapIndexed { i, tuple -> if (state.metric == "closeRate")
        (if (current) rate?.current else rate?.previous)?.getOrNull(i) else tuple.getOrNull(if (state.metric == "closed") 0 else 1) }
    val limit = if (result.bucket == "hour") result.compare?.cutoff?.take(2)?.toIntOrNull()?.plus(1) else null
    return values.mapIndexed { i, v -> if (limit != null && i >= limit) null else v }
}

@Composable fun CompareCell(state: CompareState, current: CmpCell?, previous: CmpCell?, series: CmpSeries?, rate: CmpSeriesRate?, result: StaffCompare, total: Boolean = false) {
    val a = state.value(current); val b = state.value(previous)
    if (a == null && b == null) { T("—"); return }
    val tone = compareTone(state, a, b)
    val xs = compareSeries(state, series, rate, true, result)
    val ys = compareSeries(state, series, rate, false, result)
    val max = if (state.metric == "closeRate" && !total) 100.0 else if (total) maxOf(a ?: 0.0, b ?: 0.0, 1e-9)
        else result.staff.flatMap { listOfNotNull(state.value(it.current), state.value(it.previous)) }.maxOrNull()?.coerceAtLeast(1e-9) ?: 1e-9
    Canvas(Modifier.size(84.dp, 20.dp)) {
        // Work in the web's 84 × 20 coordinate system, then scale to device pixels.
        val sx = size.width / 84f; val sy = size.height / 20f
        val len = maxOf(xs.size, ys.size)
        fun x(i: Int) = (if (len <= 1) 42f else 2f + i.toFloat() / (len - 1) * 80f) * sx
        when (state.kind) {
            "cum" -> listOf(a to C.brand, b to C.inkSoft).forEachIndexed { i, (v, color) ->
                if (v != null && v > 0) drawRect(color, Offset(0f, (4 + i * 8) * sy), Size((maxOf(.03, v / max) * 84).toFloat() * sx, 4 * sy))
            }
            "diff" -> {
                drawLine(C.line, Offset(2 * sx, 10 * sy), Offset(82 * sx, 10 * sy), sy)
                val diffs = List(len) { i -> xs.getOrNull(i)?.let { av -> ys.getOrNull(i)?.let { av - it } } }
                val hi = diffs.filterNotNull().maxOfOrNull { abs(it) }?.coerceAtLeast(1e-9) ?: 1e-9
                diffs.forEachIndexed { i, d -> if (d != null && d != 0.0) {
                    val h = maxOf(1.0, abs(d) / hi * 9).toFloat() * sy
                    val w = maxOf(1.5f, minOf(6f, 80f / len - 1.5f)) * sx
                    drawRect(if (d > 0) C.good else C.bad, Offset(x(i) - w / 2, if (d > 0) 10 * sy - h else 10 * sy), Size(w, h))
                } }
            }
            else -> {
                val hi = (xs + ys).filterNotNull().maxOrNull()?.coerceAtLeast(1e-9) ?: 1e-9
                listOf(ys to false, xs to true).forEach { (values, now) ->
                    val path = Path(); var connected = false
                    values.forEachIndexed { i, v -> if (v == null) connected = false else {
                        val y = (17 - v / hi * 14).toFloat() * sy
                        if (connected) path.lineTo(x(i), y) else path.moveTo(x(i), y)
                        connected = true
                    } }
                    drawPath(path, if (now) tone else C.inkSoft, style = Stroke((if (now) 1.7f else 1.3f) * sx,
                        pathEffect = if (now) null else PathEffect.dashPathEffect(floatArrayOf(3 * sx, 2 * sx))))
                    if (now) values.indexOfLast { it != null }.takeIf { it >= 0 }?.let { i -> drawCircle(tone, 1.8f * sx, Offset(x(i), (17 - values[i]!! / hi * 14).toFloat() * sy)) }
                }
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        T("trước ${Fmt.cmpShort(b, state.metric)}", 10.sp, maxLines = 1)
        T(state.change(a, b), 10.sp, color = tone, maxLines = 1)
    }
}
