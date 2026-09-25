package vn.megatech.tonghoppos

import android.os.Build
import android.provider.Settings
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SweepGradientShader
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** Bảng màu "AI đang nghĩ" (giống web / iPhone): chanh → xanh lá → xanh dương → tím → hồng → chanh. */
val THINK_COLORS = listOf(Color(0xFFD9F36D), Color(0xFF1BAF7A), Color(0xFF2A78D6), Color(0xFF7F6FD2), Color(0xFFE87BA4), Color(0xFFD9F36D))
val THINK_CAPTIONS = listOf("Đang tổng hợp số liệu…", "Đang đối chiếu 6 POS…", "Đang tính doanh thu và tỷ lệ chốt…", "Sắp xong…")

/** Thẻ đang làm mới (vẫn hiện số cũ): TabPage / SubPage cung cấp, Panel / KpiCard / thẻ POS vẽ viền phát sáng. */
val LocalRefreshing = compositionLocalOf { false }

/** Người dùng tắt hiệu ứng (Cài đặt → Hỗ trợ tiếp cận → Xoá hiệu ứng động / thang thời lượng hoạt ảnh = 0). */
@Composable fun reduceMotion(): Boolean {
    val ctx = LocalContext.current
    return remember { runCatching { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false) }
}

/** Góc quay 0→360 mỗi 2,2 giây (đứng yên khi tắt hiệu ứng). */
@Composable fun thinkAngle(): State<Float> {
    if (reduceMotion()) return remember { mutableFloatStateOf(0f) }
    return rememberInfiniteTransition(label = "think").animateFloat(0f, 360f, infiniteRepeatable(tween(2200, easing = LinearEasing)), label = "angle")
}

/**
 * Hiệu ứng "AI đang nghĩ" nằm ngay trên viền của thẻ / ô / nút đang tải: viền sweep gradient
 * (chanh → xanh lá → xanh dương → tím → hồng) quay liên tục, kèm quầng sáng mờ cùng dải màu ra phía ngoài.
 * Đặt TRƯỚC clip / background trong chuỗi modifier để quầng sáng không bị cắt. Tắt hiệu ứng → viền đứng yên.
 */
fun Modifier.thinkingBorder(active: Boolean, shape: Shape = RoundedCornerShape(14.dp), width: Dp = 2.2.dp, glow: Boolean = true): Modifier = if (!active) this else composed {
    val angle = thinkAngle()
    drawWithContent {
        val a = angle.value
        val brush = object : ShaderBrush() {
            override fun createShader(size: Size): Shader = SweepGradientShader(Offset(size.width / 2, size.height / 2), THINK_COLORS).also {
                it.setLocalMatrix(android.graphics.Matrix().apply { setRotate(a, size.width / 2, size.height / 2) })
            }
        }
        val full = shape.createOutline(size, layoutDirection, this)
        if (glow) listOf(12.dp to .07f, 8.dp to .11f, 4.5.dp to .18f).forEach { (w, al) -> drawOutline(full, brush, alpha = al, style = Stroke(w.toPx())) }
        drawContent()
        val w = width.toPx()
        val inner = shape.createOutline(Size(size.width - w, size.height - w), layoutDirection, this)
        translate(w / 2, w / 2) { drawOutline(inner, brush, alpha = .95f, style = Stroke(w)) }
    }
}

/** Tải lần đầu cả trang: thẻ có viền chạy + dòng chữ đổi mỗi 1,8 giây. */
@Composable fun Thinking(captions: List<String> = THINK_CAPTIONS, modifier: Modifier = Modifier) {
    var i by remember { mutableIntStateOf(0) }
    LaunchedEffect(captions) { while (true) { delay(1800); i = (i + 1) % captions.size } }
    Box(modifier.fillMaxWidth().height(84.dp).thinkingBorder(true).clip(RoundedCornerShape(14.dp)).background(C.card), contentAlignment = Alignment.Center) {
        Crossfade(captions[i % captions.size], label = "cap") { T(it, 13.sp, androidx.compose.ui.text.font.FontWeight.Medium, C.inkSoft, align = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) }
    }
}

/** Ô chờ: nền trung tính + dải sáng nhiều màu (18%) quét ngang 1,4 giây; viền chạy (border = false khi thẻ chứa đã có viền). */
@Composable fun Skeleton(height: Dp = 96.dp, border: Boolean = true) {
    val still = reduceMotion()
    val p by (if (still) remember { mutableFloatStateOf(.5f) } else rememberInfiniteTransition(label = "sk").animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "p"))
    val sheen = remember { listOf(Color.Transparent) + THINK_COLORS.dropLast(1).map { it.copy(alpha = .18f) } + Color.Transparent }
    Box(Modifier.fillMaxWidth().height(height).thinkingBorder(border).clip(RoundedCornerShape(14.dp)).background(Color(0xFFE8EDE7)).drawBehind {
        val w = size.width; val x = -w + p * 2.2f * w
        drawRect(Brush.linearGradient(sheen, start = Offset(x, 0f), end = Offset(x + w * .9f, size.height)))
    })
}
