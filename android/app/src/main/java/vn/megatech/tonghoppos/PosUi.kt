package vn.megatech.tonghoppos

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Màu từng POS (giống web: ui-kit POS_COLORS, lib/pos-icons.ts). */
fun posColor(id: String): Color = when (id) {
    "sieu-vo-gao" -> Color(0xFF2A78D6); "mgt-apex" -> Color(0xFFEB6834); "thuy-san" -> Color(0xFF1BAF7A)
    "bio-nano" -> Color(0xFFEDA100); "megaroot" -> Color(0xFFE87BA4); "oxytetra" -> Color(0xFF4A3AA7); else -> C.gray
}

/** Biểu tượng nét của POS (res/drawable/pos_*.xml sinh từ lib/pos-icons.ts). */
fun posIcon(id: String): Int = when (id) {
    "sieu-vo-gao" -> R.drawable.pos_sieu_vo_gao; "mgt-apex" -> R.drawable.pos_mgt_apex; "thuy-san" -> R.drawable.pos_thuy_san
    "bio-nano" -> R.drawable.pos_bio_nano; "megaroot" -> R.drawable.pos_megaroot; "oxytetra" -> R.drawable.pos_oxytetra; else -> 0
}

/**
 * Ô biểu tượng POS: ô vuông bo 28%, nền màu POS 14% trộn trên nền thẻ (tối 22%), nét màu POS (tối: 70% + 30% trắng),
 * viền trong 1px màu POS 28%, biểu tượng chiếm 62% ô. gray = trạng thái không chọn (xám, mờ 55%).
 */
@Composable fun PosBadge(id: String, size: Dp = 18.dp, gray: Boolean = false, dark: Boolean = false, base: Color = if (dark) Color(0xFF182A21) else C.card) {
    val c = if (gray) Color(0xFF8A938E) else posColor(id)
    val bg = lerp(base, c, if (dark) .22f else .14f)
    val fg = if (dark) lerp(c, Color.White, .3f) else c
    val shape = RoundedCornerShape(size * .28f)
    Box(Modifier.size(size).then(if (gray) Modifier.alpha(.55f) else Modifier).clip(shape).background(bg).border(1.dp, c.copy(alpha = .28f), shape), contentAlignment = Alignment.Center) {
        val icon = posIcon(id)
        if (icon != 0) Icon(painterResource(icon), null, Modifier.size(size * .62f), tint = fg)
    }
}

/** Badge + tên POS trên một dòng (thay cho chấm màu cũ trong danh sách). */
@Composable fun PosLabel(id: String, text: String = Pos.short(id), size: Dp = 16.dp, color: Color = C.inkSoft, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) { if (posIcon(id) != 0) { PosBadge(id, size); Spacer(Modifier.width(5.dp)) }; T(text, 10.sp, color = color, maxLines = 1) }
}

/**
 * Chip chọn POS. Đang chọn: nền màu POS 8%, viền 1.5dp màu POS 55%, badge màu, tích tròn màu POS bên phải.
 * Không chọn: nền surface2, viền line, chữ ink3, badge xám mờ, không tích. status = ("lỗi", true) → pill đỏ, ("lịch sử…", false) → pill vàng.
 */
@Composable fun PosChip(id: String, on: Boolean, narrow: Boolean = true, status: Pair<String, Boolean>? = null, onClick: () -> Unit) {
    val c = posColor(id)
    val shape = RoundedCornerShape(12.dp)
    Row(Modifier.height(36.dp).clip(shape).background(if (on) lerp(C.card, c, .08f) else Color(0xFFF5F8F3)).border(1.5.dp, if (on) c.copy(alpha = .55f) else Color(0xFFD5DFD6), shape)
        .clickable { onClick() }.padding(start = 4.dp, end = if (on) 8.dp else 12.dp), verticalAlignment = Alignment.CenterVertically) {
        PosBadge(id, 28.dp, gray = !on)
        Spacer(Modifier.width(8.dp))
        T(if (narrow) Pos.tiny(id) else Pos.short(id), 13.sp, if (on) FontWeight.SemiBold else FontWeight.Medium, if (on) C.ink else Color(0xFF5F7468), 1)
        if (status != null) {
            Spacer(Modifier.width(6.dp))
            val (bg, fg) = if (status.second) Color(0xFFFDEAEA) to Color(0xFFC8403F) else Color(0xFFFFF4DC) to Color(0xFF9A6500)
            Box(Modifier.clip(CircleShape).background(bg).padding(horizontal = 6.dp, vertical = 1.dp)) { T(status.first, 10.sp, FontWeight.Bold, fg, 1) }
        }
        if (on) {
            Spacer(Modifier.width(6.dp))
            Box(Modifier.size(16.dp).clip(CircleShape).background(c), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Check, null, Modifier.size(11.dp), tint = Color.White) }
        }
    }
}

/** Trạng thái đồng bộ một POS cho chip: chỉ báo "lỗi" khi lần đồng bộ gần nhất lỗi. */
fun posChipStatus(id: String): Pair<String, Boolean>? = Sync.pos.firstOrNull { it["posId"].s == id }?.takeIf { it["lastError"].sn != null }?.let { "lỗi" to true }

/** Hàng chip: "Tất cả" + 6 POS. */
@Composable fun PosChipRow(selected: String?, label: String? = "POS", allLabel: String = "Tất cả", onPick: (String?) -> Unit) {
    ChipRow {
        if (label != null) T(label, 10.sp, FontWeight.Bold, C.inkSoft)
        Chip(allLabel, selected.isNullOrEmpty()) { onPick(null) }
        Pos.order.forEach { id -> PosChip(id, selected == id, status = posChipStatus(id)) { onPick(if (selected == id) null else id) } }
    }
}

/** Ô chọn POS dạng menu, mỗi dòng có badge. */
@Composable fun PosSelectMenu(selected: String, placeholder: String = "Tất cả POS", full: Boolean = false, modifier: Modifier = Modifier, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(C.card).border(1.dp, Color(0x1A000000), RoundedCornerShape(9.dp)).clickable { open = true }.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            if (selected.isEmpty()) { Icon(Icons.Filled.Storefront, null, Modifier.size(14.dp), tint = C.inkSoft); Spacer(Modifier.width(6.dp)) } else { PosBadge(selected, 18.dp); Spacer(Modifier.width(6.dp)) }
            T(if (selected.isEmpty()) placeholder else if (full) Pos.name(selected) else Pos.short(selected), 12.sp, FontWeight.Medium, maxLines = 1, modifier = Modifier.weight(1f)); Icon(Icons.Filled.KeyboardArrowDown, null, Modifier.size(14.dp), tint = C.inkSoft)
        }
        DropdownMenu(open, { open = false }, containerColor = C.card) {
            DropdownMenuItem({ T(placeholder, 13.sp) }, { open = false; onPick("") }, leadingIcon = { Icon(Icons.Filled.Storefront, null, Modifier.size(20.dp), tint = C.inkSoft) })
            Pos.order.forEach { id -> DropdownMenuItem({ T(Pos.name(id), 13.sp, if (id == selected) FontWeight.Bold else FontWeight.Normal) }, { open = false; onPick(id) }, leadingIcon = { PosBadge(id, 20.dp) }) }
        }
    }
}

/** Đường nhỏ 7 ngày, màu POS. */
@Composable fun Sparkline(values: List<Double>, tint: Color, modifier: Modifier = Modifier) {
    if (values.size < 2) return
    val maxV = values.max().coerceAtLeast(1.0); val minV = minOf(0.0, values.min())
    Canvas(modifier) {
        val w = size.width; val h = size.height - 4
        val pts = values.mapIndexed { i, v -> Offset(w * i / (values.size - 1), (2 + h * (1 - (v - minV) / (maxV - minV))).toFloat()) }
        val fill = Path().apply { moveTo(pts[0].x, size.height); pts.forEach { lineTo(it.x, it.y) }; lineTo(pts.last().x, size.height); close() }
        drawPath(fill, Brush.verticalGradient(listOf(tint.copy(alpha = .22f), tint.copy(alpha = 0f))))
        val line = Path().apply { moveTo(pts[0].x, pts[0].y); pts.drop(1).forEach { lineTo(it.x, it.y) } }
        drawPath(line, tint, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        drawCircle(tint, 2.5.dp.toPx(), pts.last())
    }
}

/** Pill % so kỳ trước: xanh ↗ / đỏ ↘. */
@Composable fun DeltaPill(delta: String) {
    val down = delta.startsWith("-"); val c = if (down) C.bad else C.good
    Box(Modifier.clip(CircleShape).background(c.copy(alpha = .12f)).padding(horizontal = 6.dp, vertical = 2.dp)) { T((if (down) "↘ " else "↗ ") + delta, 10.sp, FontWeight.Bold, c, 1) }
}

/**
 * Thẻ POS: dải màu POS nhạt ở mép trên, badge + tên + pill so kỳ trước, doanh thu to, 3 ô Đơn chốt · GTTB · Tỷ lệ chốt,
 * thanh tỷ trọng trong tổng các POS, sparkline 7 ngày (nếu có số theo ngày). row/prev = byPos của báo cáo tổng quan.
 */
@Composable fun PosTile(id: String, row: J?, prev: J?, totalNet: Double, spark: List<Double>?, status: Pair<Color, String>?, loading: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = posColor(id)
    val shape = RoundedCornerShape(16.dp)
    Column(modifier.thinkingBorder(loading || LocalRefreshing.current, shape).clip(shape).background(C.card).border(1.dp, Color(0xFFE3EAE2), shape)
        .drawBehind { drawRect(Brush.verticalGradient(listOf(c.copy(alpha = .11f), Color.Transparent), endY = 64.dp.toPx()), size = Size(size.width, 64.dp.toPx())) }
        .clickable { onClick() }.padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val net = row?.get("closedNet")?.d ?: 0.0; val co = row?.get("closedOrders")?.d ?: 0.0; val or = row?.get("orders")?.d ?: 0.0
        Row(verticalAlignment = Alignment.CenterVertically) {
            PosBadge(id, 34.dp)
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                T(Pos.short(id), 12.sp, FontWeight.Bold, maxLines = 1)
                if (status != null) Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(6.dp).clip(CircleShape).background(status.first)); Spacer(Modifier.width(4.dp)); T(status.second, 9.sp, color = status.first, maxLines = 1) }
            }
        }
        if (loading) { Skeleton(52.dp, border = false); return@Column }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.Bottom) { Rolling(Fmt.short(net), 19.sp); Spacer(Modifier.width(2.dp)); T("₫", 10.sp, color = C.inkSoft) }
            Fmt.delta(net, prev?.get("closedNet")?.dn)?.let { DeltaPill(it) }
        }
        val rate = if (or > 0) co / or * 100 else null
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TileCell("Đơn chốt", Fmt.int(co), Modifier.weight(1f))
            TileCell("GTTB", if (co > 0) (net / co).let { if (it >= 1e6) Fmt.short(it) else "${Fmt.int(it / 1000)}k" } else "—", Modifier.weight(1f))
            TileCell("% chốt", Fmt.pct0(rate), Modifier.weight(1f), rateTone(rate))
        }
        val share = if (totalNet > 0) net / totalNet else 0.0
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Bar(share, c, 4.dp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                T("${Fmt.pct0(share * 100)} tổng POS", 9.sp, color = C.inkSoft, maxLines = 1, modifier = Modifier.weight(1f))
                if (spark != null && spark.size >= 2) Sparkline(spark, c, Modifier.width(56.dp).height(18.dp))
            }
        }
    }
}

@Composable private fun TileCell(label: String, value: String, modifier: Modifier, tint: Color = C.ink) {
    Column(modifier.clip(RoundedCornerShape(8.dp)).background(Color(0xFFF5F8F3)).padding(horizontal = 6.dp, vertical = 5.dp)) {
        T(label, 8.sp, color = C.inkSoft, maxLines = 1); T(value, 11.sp, FontWeight.Bold, tint, 1)
    }
}
