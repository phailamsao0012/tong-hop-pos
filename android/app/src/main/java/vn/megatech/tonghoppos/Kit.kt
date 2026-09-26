package vn.megatech.tonghoppos

import android.content.Context
import android.content.Intent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
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
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import java.io.File
import java.time.Instant
import java.time.ZoneOffset

/** Bảng màu theo bộ ảnh thiết kế. */
object C {
    val brand = Color(0xFF17684B)
    val brandDeep = Color(0xFF0F3D2E)
    val brandSoft = Color(0xFFE3F1E8)
    val cream = Color(0xFFF4F6F3)
    val lime = Color(0xFFD9F36D)
    val good = Color(0xFF15804A)
    val bad = Color(0xFFC8403F)
    val warn = Color(0xFFE08A1E)
    val blue = Color(0xFF2F6FDB)
    val purple = Color(0xFF8A4FD1)
    val teal = Color(0xFF14A3A8)
    val gray = Color(0xFF8A938E)
    val ink = Color(0xFF141F1A)
    val inkSoft = Color(0xFF6B7771)
    val line = Color(0x14000000)
    val card = Color.White
}

enum class Tone(val color: Color) { Green(C.good), Red(C.bad), Orange(C.warn), Blue(C.blue), Gray(C.inkSoft), Purple(C.purple) }

/** Màu tỷ lệ chốt theo ngưỡng chung với web (MetricPrefs.rateGood / rateWarn, mặc định 40 / 25). */
fun rateTone(r: Double?): Color = when (rateLevel(r)) { "good" -> C.good; "warn" -> C.warn; "bad" -> C.bad; else -> C.inkSoft }
/** "good" / "warn" / "bad" (null khi không có tỷ lệ). */
fun rateLevel(r: Double?): String? = when { r == null || r.isNaN() -> null; r >= MetricPrefs.rateGood -> "good"; r >= MetricPrefs.rateWarn -> "warn"; else -> "bad" }

@Composable fun T(text: String, size: TextUnit = 13.sp, weight: FontWeight = FontWeight.Normal, color: Color = C.ink, maxLines: Int = Int.MAX_VALUE, modifier: Modifier = Modifier, align: TextAlign? = null) =
    Text(text, modifier = modifier, fontSize = size, fontWeight = weight, color = color, maxLines = maxLines, overflow = TextOverflow.Ellipsis, textAlign = align, lineHeight = size * 1.25)

/** Số đổi bằng hiệu ứng cuộn lên/xuống. */
@Composable fun Rolling(text: String, size: TextUnit, weight: FontWeight = FontWeight.Bold, color: Color = C.ink) {
    AnimatedContent(targetState = text, transitionSpec = { (slideInVertically { it / 2 } + fadeIn()) togetherWith (slideOutVertically { -it / 2 } + fadeOut()) }, label = "roll") { T(it, size, weight, color, 1) }
}

/** Trạng thái đồng bộ dùng cho thanh đầu và Trang chủ. */
object Sync {
    var pos by mutableStateOf<List<J>>(emptyList())
    fun age(p: J) = Fmt.minutesAgo(p["lastSyncAt"].sn)
    val maxAge get() = pos.maxOfOrNull { age(it) } ?: 99999
    val hasError get() = pos.any { it["lastError"].sn != null }
    val alertCount get() = pos.count { it["lastError"].sn != null || age(it) > 15 }
    val tone get() = when { pos.isEmpty() -> C.gray; hasError -> C.bad; maxAge > 15 -> C.warn; else -> C.lime }
    val title get() = when { pos.isEmpty() -> "Đang kiểm tra"; hasError -> "Lỗi đồng bộ"; maxAge > 15 -> "Đồng bộ chậm"; else -> "Đồng bộ OK" }
    val subtitle get() = if (pos.isEmpty()) "…" else maxAge.let { m -> when { m <= 1 -> "Cập nhật vừa xong"; m < 60 -> "$m phút trước"; m < 1440 -> "${m / 60} giờ trước"; else -> "${m / 1440} ngày trước" } }
    suspend fun refresh() { runCatching { Api.syncStatus() }.onSuccess { pos = it.list } }
}

/** Thanh đầu xanh đậm: MEGATECH + khẩu hiệu, ô trạng thái đồng bộ, chuông. */
@Composable fun AppHeader(tagline: String = "Bán hàng tốt hơn mỗi ngày") {
    val nav = LocalNav.current
    LaunchedEffect(Unit) { Sync.refresh() }
    Row(Modifier.fillMaxWidth().background(C.brandDeep).statusBarsPadding().padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            T("MEGATECH", 20.sp, FontWeight.Black, Color.White)
            T(tagline, 10.sp, color = Color.White.copy(alpha = .75f), maxLines = 2)
        }
        Row(Modifier.clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = .12f)).padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(Sync.tone))
            Spacer(Modifier.width(6.dp))
            Column { T(Sync.title, 11.sp, FontWeight.SemiBold, Color.White); T(Sync.subtitle, 9.sp, color = Color.White.copy(alpha = .75f)) }
        }
        Box(Modifier.padding(start = 8.dp).size(36.dp).clip(CircleShape).clickable { nav.push(Screen.Alerts) }, contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Notifications, null, tint = Color.White)
            if (Sync.alertCount > 0) Box(Modifier.align(Alignment.TopEnd).size(16.dp).clip(CircleShape).background(C.bad), contentAlignment = Alignment.Center) { T("${Sync.alertCount}", 9.sp, FontWeight.Bold, Color.White) }
        }
    }
}

@Composable fun PageTitle(title: String, subtitle: String? = null, icon: ImageVector? = null, trailing: (@Composable () -> Unit)? = null) {
    Row(verticalAlignment = Alignment.Top) {
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) { Icon(icon, null, tint = C.brand, modifier = Modifier.size(22.dp)); Spacer(Modifier.width(10.dp)) }
            Column { T(title, 22.sp, FontWeight.Bold); if (subtitle != null) T(subtitle, 12.sp, color = C.inkSoft) }
        }
        if (trailing != null) trailing()
    }
}

@Composable fun DatePill(text: String, chevron: Boolean = true, onClick: (() -> Unit)? = null) {
    Row(Modifier.clip(RoundedCornerShape(9.dp)).background(C.card).border(1.dp, C.line, RoundedCornerShape(9.dp)).then(if (onClick != null) Modifier.clickable { onClick() } else Modifier).padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.CalendarMonth, null, Modifier.size(14.dp), tint = C.ink); Spacer(Modifier.width(6.dp)); T(text, 12.sp, FontWeight.SemiBold, maxLines = 1)
        if (chevron) { Spacer(Modifier.width(4.dp)); Icon(Icons.Filled.KeyboardArrowDown, null, Modifier.size(14.dp), tint = C.ink) }
    }
}

@Composable fun Panel(padding: Dp = 14.dp, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().thinkingBorder(LocalRefreshing.current).shadow(3.dp, RoundedCornerShape(14.dp), ambientColor = Color(0x14000000), spotColor = Color(0x14000000)).clip(RoundedCornerShape(14.dp)).background(C.card)
        .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier).padding(padding), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
}

@Composable fun SectionHead(title: String, action: String? = null, count: Int? = null, onAction: (() -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        T(title, 15.sp, FontWeight.Bold)
        if (count != null && count > 0) { Spacer(Modifier.width(6.dp)); Box(Modifier.clip(CircleShape).background(C.bad).padding(horizontal = 6.dp, vertical = 1.dp)) { T("$count", 10.sp, FontWeight.Bold, Color.White) } }
        Spacer(Modifier.weight(1f))
        if (action != null) Row(Modifier.then(if (onAction != null) Modifier.clickable { onAction() } else Modifier), verticalAlignment = Alignment.CenterVertically) {
            T(action, 12.sp, FontWeight.SemiBold, C.brand); if (onAction != null) Icon(Icons.Filled.ChevronRight, null, Modifier.size(14.dp), tint = C.brand)
        }
    }
}

@Composable fun IconBox(icon: ImageVector, tint: Color, size: Dp = 34.dp, circle: Boolean = false) {
    Box(Modifier.size(size).clip(if (circle) CircleShape else RoundedCornerShape(9.dp)).background(tint.copy(alpha = .13f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint, modifier = Modifier.size(size * .5f)) }
}

/** Ô chỉ số: icon trong ô màu, nhãn, giá trị, mũi tên tăng giảm. */
@Composable fun KpiCard(icon: ImageVector, tint: Color, label: String, value: String, delta: String? = null, deltaGood: Boolean? = null, note: String? = null, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Row(modifier.thinkingBorder(LocalRefreshing.current).shadow(3.dp, RoundedCornerShape(14.dp), ambientColor = Color(0x14000000), spotColor = Color(0x14000000)).clip(RoundedCornerShape(14.dp)).background(C.card)
        .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier).padding(12.dp)) {
        IconBox(icon, tint)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            T(label, 11.sp, color = C.inkSoft, maxLines = 1)
            Rolling(value, 18.sp)
            if (delta != null) {
                val up = deltaGood ?: !delta.startsWith("-")
                Row(verticalAlignment = Alignment.CenterVertically) { Icon(if (up) Icons.Filled.ArrowDropUp else Icons.Filled.ArrowDropDown, null, Modifier.size(16.dp), tint = if (up) C.good else C.bad); T(delta, 11.sp, FontWeight.SemiBold, if (up) C.good else C.bad, 1) }
                if (note != null) T(note, 10.sp, color = C.inkSoft, maxLines = 1)
            } else if (note != null) T(note, 10.sp, color = C.inkSoft, maxLines = 2)
        }
    }
}

@Composable fun StatCard(icon: ImageVector, tint: Color, label: String, value: String, sub: String? = null, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Column(modifier.thinkingBorder(LocalRefreshing.current).shadow(3.dp, RoundedCornerShape(14.dp), ambientColor = Color(0x14000000), spotColor = Color(0x14000000)).clip(RoundedCornerShape(14.dp)).background(C.card)
        .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { IconBox(icon, tint, 28.dp); Spacer(Modifier.width(8.dp)); T(label, 11.sp, color = C.inkSoft, maxLines = 1) }
        Rolling(value, 22.sp)
        if (sub != null) T(sub, 10.sp, color = C.inkSoft, maxLines = 1)
    }
}

/** Hai ô trên một hàng. */
@Composable fun Grid2(items: List<@Composable (Modifier) -> Unit>, gap: Dp = 10.dp) {
    Column(verticalArrangement = Arrangement.spacedBy(gap)) {
        items.chunked(2).forEach { row -> Row(horizontalArrangement = Arrangement.spacedBy(gap), modifier = Modifier.height(IntrinsicSize.Max)) { row.forEach { it(Modifier.weight(1f).fillMaxHeight()) }; if (row.size == 1) Spacer(Modifier.weight(1f)) } }
    }
}
@Composable fun GridN(n: Int, items: List<@Composable (Modifier) -> Unit>, gap: Dp = 8.dp) {
    Column(verticalArrangement = Arrangement.spacedBy(gap)) {
        items.chunked(n).forEach { row -> Row(horizontalArrangement = Arrangement.spacedBy(gap), modifier = Modifier.height(IntrinsicSize.Max)) { row.forEach { it(Modifier.weight(1f).fillMaxHeight()) }; repeat(n - row.size) { Spacer(Modifier.weight(1f)) } } }
    }
}

@Composable fun Avatar(name: String, size: Dp = 36.dp, tint: Color = C.brand) {
    val parts = name.split(" ").filter { it.isNotBlank() && it.first().isLetter() }
    val ini = (if (parts.size >= 2) listOf(parts[parts.size - 2], parts.last()) else parts.take(1)).joinToString("") { it.first().uppercase() }
    Box(Modifier.size(size).clip(CircleShape).background(tint.copy(alpha = .14f)), contentAlignment = Alignment.Center) { T(ini.ifEmpty { "?" }, (size.value * .36f).sp, FontWeight.Bold, tint) }
}

@Composable fun Tag(text: String, tone: Tone = Tone.Green, dot: Boolean = false) {
    Row(Modifier.clip(RoundedCornerShape(6.dp)).background(tone.color.copy(alpha = .12f)).padding(horizontal = 7.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        if (dot) { Box(Modifier.size(6.dp).clip(CircleShape).background(tone.color)); Spacer(Modifier.width(4.dp)) }
        T(text, 10.sp, FontWeight.SemiBold, tone.color, 1)
    }
}

@Composable fun Chip(label: String, on: Boolean, badge: Int? = null, chevron: Boolean = false, onClick: () -> Unit) {
    val bg by androidx.compose.animation.animateColorAsState(if (on) C.brandDeep else C.card, label = "chip")
    Row(Modifier.clip(CircleShape).background(bg).border(1.dp, if (on) Color.Transparent else Color(0x1A000000), CircleShape).clickable { onClick() }.padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        T(label, 12.sp, FontWeight.SemiBold, if (on) Color.White else C.ink, 1)
        if (badge != null && badge > 0) { Spacer(Modifier.width(5.dp)); Box(Modifier.clip(CircleShape).background(C.bad).padding(horizontal = 5.dp, vertical = 1.dp)) { T("$badge", 9.sp, FontWeight.Bold, Color.White) } }
        if (chevron) Icon(Icons.Filled.KeyboardArrowDown, null, Modifier.size(14.dp), tint = if (on) Color.White else C.ink)
    }
}
@Composable fun ChipRow(content: @Composable RowScope.() -> Unit) { Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = content) }

/** Bộ chọn phân đoạn: nền xám nhạt, mục chọn xanh đậm. */
@Composable fun <V> Segmented(selection: V, options: List<Pair<V, String>>, onSelect: (V) -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0x0D000000)).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEach { (v, label) ->
            val on = v == selection
            val bg by androidx.compose.animation.animateColorAsState(if (on) C.brandDeep else Color.Transparent, label = "seg")
            Box(Modifier.weight(1f).clip(RoundedCornerShape(9.dp)).background(bg).clickable { onSelect(v) }.padding(vertical = 8.dp), contentAlignment = Alignment.Center) { T(label, 12.sp, FontWeight.SemiBold, if (on) Color.White else C.ink, 1) }
        }
    }
}

/** Thanh tỷ lệ mọc từ 0 khi hiện ra. */
@Composable fun Bar(value: Double, tint: Color = C.good, height: Dp = 6.dp, modifier: Modifier = Modifier) {
    val anim = remember { Animatable(0f) }
    LaunchedEffect(value) { anim.animateTo(value.coerceIn(0.0, 1.0).toFloat(), spring(dampingRatio = .85f, stiffness = 120f)) }
    Box(modifier.fillMaxWidth().height(height).clip(CircleShape).background(Color(0x12000000))) { Box(Modifier.fillMaxWidth(anim.value).fillMaxHeight().clip(CircleShape).background(tint)) }
}

@Composable fun Ring(value: Double, size: Dp = 64.dp, stroke: Dp = 7.dp, tint: Color = C.good, label: String? = null) {
    val anim = remember { Animatable(0f) }
    LaunchedEffect(value) { anim.animateTo(value.coerceIn(0.0, 1.0).toFloat(), tween(900)) }
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val s = stroke.toPx(); val inset = s / 2
            drawArc(tint.copy(alpha = .15f), 0f, 360f, false, Offset(inset, inset), Size(this.size.width - s, this.size.height - s), style = Stroke(s))
            drawArc(tint, -90f, 360f * anim.value, false, Offset(inset, inset), Size(this.size.width - s, this.size.height - s), style = Stroke(s, cap = StrokeCap.Round))
        }
        T(label ?: Fmt.pct0(value * 100), (size.value * .24f).sp, FontWeight.Bold)
    }
}

@Composable fun FunnelLine(label: String, n: Double, of: Double, tint: Color = C.good, onClick: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable { onClick() } else Modifier).padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        T(label, 12.sp, modifier = Modifier.width(130.dp), maxLines = 1)
        Bar(if (of > 0) n / of else 0.0, tint, 9.dp, Modifier.weight(1f))
        T(Fmt.int(n), 12.sp, FontWeight.Bold, modifier = Modifier.width(56.dp), align = TextAlign.End)
    }
}

@Composable fun StackedBar(parts: List<Triple<String, Double, Color>>) {
    val total = parts.sumOf { it.second }.coerceAtLeast(1.0)
    Row(Modifier.fillMaxWidth().height(10.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) { parts.filter { it.second > 0 }.forEach { Box(Modifier.weight((it.second / total).toFloat()).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(it.third)) } }
    ChipRow { parts.forEach { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(7.dp).clip(CircleShape).background(it.third)); Spacer(Modifier.width(4.dp)); T(it.first, 10.sp, color = C.inkSoft) } } }
}

@Composable fun Medal(rank: Int) {
    val c = when (rank) { 1 -> Color(0xFFF2B733); 2 -> Color(0xFFB3B8BF); 3 -> Color(0xFFCC804D); else -> Color(0x0F000000) }
    Box(Modifier.size(22.dp).clip(CircleShape).background(c), contentAlignment = Alignment.Center) { T("$rank", 11.sp, FontWeight.Bold, if (rank <= 3) Color.White else C.inkSoft) }
}

/** Đường gấp khúc có tô nền và nhãn đỉnh. */
@Composable fun LineChart(points: List<Pair<String, Double>>, tint: Color = C.brand, height: Dp = 130.dp) {
    val prog = remember(points) { Animatable(0f) }
    LaunchedEffect(points) { prog.animateTo(1f, tween(900)) }
    val maxV = (points.maxOfOrNull { it.second } ?: 1.0).coerceAtLeast(1.0)
    Column {
        Box(Modifier.fillMaxWidth().height(height)) {
            Canvas(Modifier.fillMaxSize()) {
                val w = size.width; val h = size.height - 8
                for (i in 0..3) { val y = 4 + h * i / 3; drawLine(Color(0x0D000000), Offset(0f, y), Offset(w, y), 2f) }
                if (points.size > 1) {
                    val n = points.size - 1
                    val pts = points.mapIndexed { i, p -> Offset(w * i / n, (4 + h * (1 - p.second / maxV)).toFloat()) }
                    val cut = (pts.size * prog.value).toInt().coerceIn(1, pts.size)
                    val fill = Path().apply { moveTo(pts[0].x, h + 4); pts.take(cut).forEach { lineTo(it.x, it.y) }; lineTo(pts[cut - 1].x, h + 4); close() }
                    drawPath(fill, Brush.verticalGradient(listOf(tint.copy(alpha = .28f), tint.copy(alpha = .02f))))
                    val line = Path().apply { moveTo(pts[0].x, pts[0].y); pts.take(cut).drop(1).forEach { lineTo(it.x, it.y) } }
                    drawPath(line, tint, style = Stroke(5f, cap = StrokeCap.Round))
                    pts.take(cut).forEach { drawCircle(tint, 5f, it) }
                }
            }
            if (points.size > 1) {
                val mi = points.indices.maxByOrNull { points[it].second } ?: 0
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    val x = maxWidth * (mi.toFloat() / (points.size - 1)); val y = (maxHeight - 8.dp) * (1 - points[mi].second / maxV).toFloat()
                    Box(Modifier.offset(x = (x - 28.dp).coerceIn(0.dp, maxWidth - 60.dp), y = (y - 14.dp).coerceAtLeast(0.dp)).clip(RoundedCornerShape(5.dp)).background(C.brandDeep).padding(horizontal = 6.dp, vertical = 3.dp)) { T(Fmt.short(points[mi].second), 9.sp, FontWeight.Bold, Color.White) }
                }
            }
        }
        Row(Modifier.fillMaxWidth()) { val step = maxOf(1, points.size / 7); points.forEachIndexed { i, p -> if (points.size <= 8 || i % step == 0) T(p.first, 9.sp, color = C.inkSoft, modifier = Modifier.weight(1f), align = TextAlign.Center, maxLines = 1) } }
    }
}

/** Cột mọc từ đáy; chạm một cột gọi onClick với nhãn. */
@Composable fun BarChart(points: List<Pair<String, Double>>, money: Boolean = false, tint: Color = C.good, onClick: ((Int) -> Unit)? = null) {
    val maxV = (points.maxOfOrNull { it.second } ?: 1.0).coerceAtLeast(1.0)
    Row(Modifier.horizontalScroll(rememberScrollState()).height(170.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
        points.forEachIndexed { i, p ->
            val anim = remember(p.second) { Animatable(0f) }
            LaunchedEffect(p.second) { anim.animateTo((p.second / maxV).toFloat(), spring(dampingRatio = .7f, stiffness = 90f)) }
            Column(Modifier.width(if (points.size > 12) 26.dp else 34.dp).fillMaxHeight().then(if (onClick != null) Modifier.clickable { onClick(i) } else Modifier), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                T(if (money) Fmt.short(p.second) else Fmt.int(p.second), 8.sp, FontWeight.SemiBold, maxLines = 1)
                Box(Modifier.width(18.dp).height((120 * anim.value).dp.coerceAtLeast(3.dp)).clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp)).background(tint))
                T(p.first, 8.sp, color = C.inkSoft, maxLines = 1)
            }
        }
    }
}

@Composable fun Donut(parts: List<Triple<String, Double, Color>>, center: String, label: String, size: Dp = 110.dp) {
    val anim = remember { Animatable(0f) }
    LaunchedEffect(Unit) { anim.animateTo(1f, tween(900)) }
    val total = parts.sumOf { it.second }.coerceAtLeast(1.0)
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            var start = -90f; val s = 26f
            parts.forEach { p -> val sweep = (360f * (p.second / total).toFloat()) * anim.value; drawArc(p.third, start, sweep, false, Offset(s / 2, s / 2), Size(this.size.width - s, this.size.height - s), style = Stroke(s)); start += sweep }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) { T(center, 15.sp, FontWeight.Bold); T(label, 9.sp, color = C.inkSoft) }
    }
}

@Composable fun MiniCell(label: String, value: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Column(modifier.clip(RoundedCornerShape(10.dp)).background(Color(0x0A000000)).then(if (onClick != null) Modifier.clickable { onClick() } else Modifier).padding(10.dp)) {
        T(label, 9.sp, color = C.inkSoft, maxLines = 1); Rolling(value, 15.sp)
    }
}

@Composable fun Hint(text: String) { Box(Modifier.clip(CircleShape).background(Color(0x0D000000)).padding(horizontal = 6.dp, vertical = 3.dp)) { T(text, 9.sp, FontWeight.Medium, C.inkSoft, 1) } }

@Composable fun PrimaryButton(title: String, icon: ImageVector? = null, tint: Color = C.brandDeep, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(tint).clickable { onClick() }.padding(vertical = 13.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) { Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
        T(title, 14.sp, FontWeight.Bold, Color.White)
    }
}

@Composable fun OutlineButton(title: String, onClick: () -> Unit) {
    Box(Modifier.clip(RoundedCornerShape(8.dp)).border(1.dp, Color(0x26000000), RoundedCornerShape(8.dp)).clickable { onClick() }.padding(horizontal = 12.dp, vertical = 7.dp)) { T(title, 11.sp, FontWeight.SemiBold) }
}

@Composable fun ErrorLine(msg: String?) { if (msg != null) Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.WifiOff, null, tint = C.bad, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); T(msg, 12.sp, color = C.bad) } }

@Composable fun Divider0(start: Dp = 0.dp) { HorizontalDivider(Modifier.padding(start = start), color = C.line) }

/** Ô chọn có mũi tên + menu thả xuống. */
@Composable fun <V> SelectMenu(text: String, options: List<Pair<V, String>>, icon: ImageVector? = null, modifier: Modifier = Modifier, onPick: (V) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(C.card).border(1.dp, Color(0x1A000000), RoundedCornerShape(9.dp)).clickable { open = true }.padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) { Icon(icon, null, Modifier.size(14.dp), tint = C.inkSoft); Spacer(Modifier.width(6.dp)) }
            T(text, 12.sp, FontWeight.Medium, maxLines = 1, modifier = Modifier.weight(1f)); Icon(Icons.Filled.KeyboardArrowDown, null, Modifier.size(14.dp), tint = C.inkSoft)
        }
        DropdownMenu(open, { open = false }, containerColor = C.card) { options.forEach { (v, l) -> DropdownMenuItem({ T(l, 13.sp) }, { open = false; onPick(v) }) } }
    }
}

/** Nút chọn kỳ như web: mốc nhanh + Khoảng tuỳ chọn (lịch chọn 2 ngày). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun PeriodMenu(period: Period, options: List<Period> = Period.presets, prefix: String = "", onChange: (Period) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var custom by remember { mutableStateOf(false) }
    Box {
        DatePill(prefix + period.title) { open = true }
        DropdownMenu(open, { open = false }, containerColor = C.card) {
            options.forEach { p -> DropdownMenuItem({ T(p.title, 14.sp, if (p == period) FontWeight.Bold else FontWeight.Normal) }, { open = false; onChange(p) }, leadingIcon = { if (p == period) Icon(Icons.Filled.Check, null, tint = C.brand) }) }
            HorizontalDivider()
            DropdownMenuItem({ T("Khoảng tuỳ chọn…", 14.sp) }, { open = false; custom = true }, leadingIcon = { Icon(Icons.Filled.DateRange, null, tint = C.brand) })
        }
    }
    if (custom) {
        val (a, b) = period.range
        val toMs = { s: String -> java.time.LocalDate.parse(s).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli() }
        val st = rememberDateRangePickerState(initialSelectedStartDateMillis = toMs(a), initialSelectedEndDateMillis = toMs(b))
        DatePickerDialog(onDismissRequest = { custom = false }, confirmButton = {
            TextButton({
                val s = st.selectedStartDateMillis; val e = st.selectedEndDateMillis ?: s
                if (s != null && e != null) onChange(Period.Custom(Instant.ofEpochMilli(s).atZone(ZoneOffset.UTC).toLocalDate().toString(), Instant.ofEpochMilli(e).atZone(ZoneOffset.UTC).toLocalDate().toString()))
                custom = false
            }) { T("Áp dụng", 14.sp, FontWeight.Bold, C.brand) }
        }, dismissButton = { TextButton({ custom = false }) { T("Hủy", 14.sp, color = C.inkSoft) } }) {
            DateRangePicker(st, Modifier.height(470.dp), title = { T("Chọn khoảng thời gian", 14.sp, FontWeight.Bold, modifier = Modifier.padding(16.dp)) })
        }
    }
}

/** Xuất bảng ra file Excel (CSV có BOM) rồi mở bảng chia sẻ. */
fun exportCsv(ctx: Context, filename: String, headers: List<String>, rows: List<List<String>>) {
    val dir = File(ctx.cacheDir, "exports").apply { mkdirs() }
    val f = File(dir, "$filename.csv")
    val csv = "﻿" + (listOf(headers) + rows).joinToString("\r\n") { r -> r.joinToString(",") { "\"" + it.replace("\"", "\"\"") + "\"" } }
    f.writeText(csv)
    val uri = FileProvider.getUriForFile(ctx, "vn.megatech.tonghoppos.files", f)
    ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Xuất Excel"))
}
@Composable fun ExportButton(filename: String, headers: List<String>, rows: () -> List<List<String>>) {
    val ctx = LocalContext.current
    Row(Modifier.clip(RoundedCornerShape(8.dp)).background(C.card).border(1.dp, Color(0x1F000000), RoundedCornerShape(8.dp)).clickable { exportCsv(ctx, filename, headers, rows()) }.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.FileDownload, null, Modifier.size(14.dp), tint = C.ink); Spacer(Modifier.width(4.dp)); T("Xuất Excel", 11.sp, FontWeight.SemiBold)
    }
}

fun openUrl(ctx: Context, url: String) { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))) } }
