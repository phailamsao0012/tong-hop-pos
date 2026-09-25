package vn.megatech.tonghoppos

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val LoginInk = Color(0xFFE8F5EC)
private val LoginSoft = Color(0xFFA7C6B3)
private val LimeInk = Color(0xFF14372D)

/** Logo MEGATECH (chữ M trên ô xanh đậm). */
@Composable fun MegaLogo(size: androidx.compose.ui.unit.Dp = 40.dp) {
    Canvas(Modifier.size(size)) {
        val u = this.size.width / 64f
        drawRoundRect(Color(0xFF0F3328), cornerRadius = CornerRadius(16 * u))
        drawRoundRect(Color(0xFF2B5D4E), cornerRadius = CornerRadius(16 * u), style = Stroke(1.5f * u))
        drawRoundRect(C.lime, Offset(11 * u, 18 * u), Size(9 * u, 34 * u), CornerRadius(3 * u))
        drawRoundRect(C.lime, Offset(44 * u, 18 * u), Size(9 * u, 34 * u), CornerRadius(3 * u))
        drawPath(Path().apply { moveTo(15.5f * u, 21.5f * u); lineTo(32 * u, 39 * u); lineTo(48.5f * u, 21.5f * u) }, C.lime, style = Stroke(7 * u, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

/** vuvanvu@gmail.com → vu***@gmail.com */
fun maskEmail(e: String): String { val at = e.indexOf('@'); return if (at <= 0) e else e.take(minOf(2, at)) + "***" + e.substring(at) }

@Composable private fun LimeButton(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector? = null, enabled: Boolean = true, busy: Boolean = false, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(50.dp).thinkingBorder(busy, RoundedCornerShape(14.dp)).clip(RoundedCornerShape(14.dp)).background(if (enabled || busy) C.lime else C.lime.copy(alpha = .35f)).clickable(enabled = enabled && !busy) { onClick() }, horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        run { if (icon != null) { Icon(icon, null, tint = LimeInk, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)) }; T(title, 15.sp, FontWeight.Bold, LimeInk) }
    }
}

@Composable private fun GhostButton(title: String, onClick: () -> Unit) {
    Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, Color.White.copy(alpha = .22f), RoundedCornerShape(14.dp)).clickable { onClick() }, contentAlignment = Alignment.Center) { T(title, 15.sp, FontWeight.Bold, LoginInk) }
}

@Composable private fun LoginField(value: String, label: String, keyboard: KeyboardType, password: Boolean = false, onChange: (String) -> Unit) {
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard), shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(focusedTextColor = LoginInk, unfocusedTextColor = LoginInk, focusedBorderColor = C.lime, unfocusedBorderColor = Color.White.copy(alpha = .22f),
            focusedLabelColor = C.lime, unfocusedLabelColor = LoginSoft, cursorColor = C.lime, focusedContainerColor = Color.White.copy(alpha = .06f), unfocusedContainerColor = Color.White.copy(alpha = .06f)))
}

/**
 * Màn đăng nhập (theo mẫu duyệt 25/09/2026): nền xanh đậm, "Chào mừng trở lại" khi đã từng đăng nhập,
 * nút vàng chanh mở phiên đã lưu bằng vân tay / khuôn mặt, nút viền mở form email + mật khẩu.
 * Sau mật khẩu có thể là: mã ứng dụng (totp), mã email (otp), hoặc duyệt trên app khác (approve).
 */
@Composable fun LoginScreen(act: FragmentActivity) {
    val scope = rememberCoroutineScope()
    val welcome = Auth.state == Auth.State.Welcome
    val last = Api.lastEmail
    var form by remember { mutableStateOf(!welcome) }
    var email by remember { mutableStateOf(last ?: "") }
    var password by remember { mutableStateOf("") }
    var keep by remember { mutableStateOf(Api.remember) }
    var prompted by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var challenge by remember { mutableStateOf<J?>(null) }
    var approve by remember { mutableStateOf<J?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun signedIn() = scope.launch {
        if (keep) Api.lastEmail = email.trim().lowercase().ifEmpty { Api.lastEmail }
        Auth.restore()
    }
    fun bio() {
        if (!AppLock.available(act)) { error = "Máy chưa cài vân tay, khuôn mặt hoặc mã khoá màn hình."; form = true; return }
        AppLock.authenticate(act, "Đăng nhập MEGATECH", "Xác thực để mở phiên đã lưu trên máy này") { ok ->
            if (ok) scope.launch { busy = true; Auth.restore(); busy = false; if (Auth.state != Auth.State.SignedIn) { form = true; if (!Auth.expired) error = "Không kết nối được máy chủ." } }
        }
    }
    fun submit() = scope.launch {
        busy = true; error = null
        try {
            Api.remember = keep
            val step = challenge?.let { Api.send("/api/auth/verify", "POST", mapOf("challengeId" to it["challengeId"].s, "code" to code, "kind" to if (it["step"].s == "totp") "totp" else "otp")) }
                ?: Api.send("/api/auth/login", "POST", mapOf("email" to email.trim(), "password" to password, "remember" to keep))
            when (step["step"].s) {
                "done" -> signedIn()
                "approve" -> { approve = step; challenge = null }
                else -> { challenge = step; code = "" }
            }
        } catch (e: Exception) { error = e.message ?: "Không kết nối được máy chủ." } finally { busy = false }
    }
    fun switchAccount() = scope.launch { Api.logout(); Api.lastEmail = null; email = ""; password = ""; Auth.expired = false; form = true; Auth.state = Auth.State.SignedOut }

    // Chờ duyệt trên app khác: hỏi mỗi 2 giây.
    approve?.let { ap ->
        LaunchedEffect(ap) {
            val until = System.currentTimeMillis() + ap["seconds"].i.coerceAtLeast(30) * 1000L
            while (true) {
                delay(2000)
                if (System.currentTimeMillis() > until) { approve = null; error = "Yêu cầu đã hết hạn, đăng nhập lại."; break }
                val st = runCatching { Api.send("/api/auth/qr", "POST", mapOf("action" to "poll", "id" to ap["requestId"].s, "pollToken" to ap["pollToken"].s))["status"].s }.getOrNull() ?: continue
                when (st) {
                    "done" -> { signedIn(); break }
                    "denied" -> { approve = null; error = "Yêu cầu bị từ chối."; break }
                    "expired", "invalid", "consumed" -> { approve = null; error = "Yêu cầu đã hết hạn, đăng nhập lại."; break }
                }
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Brush.radialGradient(0f to Color(0xFF1B5A45), .55f to Color(0xFF113C30), 1f to Color(0xFF0C2E25), center = Offset(80f, 0f), radius = 2400f))
        .statusBarsPadding().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 16.dp)) {
        Row(Modifier.padding(top = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            MegaLogo(42.dp); Spacer(Modifier.width(12.dp))
            Column { T("MEGATECH", 19.sp, FontWeight.Black, LoginInk); T("Tổng hợp POS", 12.sp, color = LoginSoft) }
        }
        Spacer(Modifier.height(if (form) 48.dp else 96.dp))
        val ap = approve
        when {
            ap != null -> {
                T("Duyệt trên\nđiện thoại kia", 28.sp, FontWeight.ExtraBold, LoginInk)
                Spacer(Modifier.height(8.dp))
                T("Mở app MEGATECH trên điện thoại đang đăng nhập và chọn số này.", 13.sp, color = LoginSoft)
                Spacer(Modifier.height(28.dp))
                Box(Modifier.align(Alignment.CenterHorizontally).size(120.dp).thinkingBorder(true, RoundedCornerShape(28.dp), 2.5.dp).clip(RoundedCornerShape(28.dp)).background(C.lime.copy(alpha = .1f)), contentAlignment = Alignment.Center) {
                    T(ap["number"].s, 54.sp, FontWeight.ExtraBold, C.lime)
                }
                Spacer(Modifier.height(18.dp))
                Row(Modifier.align(Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                    T("Đang chờ duyệt…", 13.sp, FontWeight.SemiBold, LoginSoft)
                }
                Spacer(Modifier.height(36.dp))
                when (ap["fallback"].s) {
                    "totp" -> GhostButton("Nhập mã ứng dụng xác thực") { challenge = J(org.json.JSONObject().put("step", "totp").put("challengeId", ap["challengeId"].s)); code = ""; approve = null }
                    "otp" -> GhostButton("Nhận mã qua email") {
                        scope.launch {
                            busy = true; error = null
                            try { challenge = Api.send("/api/auth/qr", "POST", mapOf("action" to "email", "id" to ap["requestId"].s, "pollToken" to ap["pollToken"].s)); code = ""; approve = null }
                            catch (e: Exception) { error = e.message } finally { busy = false }
                        }
                    }
                }
                ErrorText(error)
                TextButton({ approve = null; error = null }, Modifier.align(Alignment.CenterHorizontally)) { T("Hủy, đăng nhập lại", 13.sp, color = LoginSoft) }
            }
            !form -> {
                T("Chào mừng\ntrở lại", 30.sp, FontWeight.ExtraBold, LoginInk)
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    last?.let { T(maskEmail(it) + " · ", 13.sp, color = LoginSoft) }
                    Text("đổi tài khoản", color = LoginSoft, fontSize = 13.sp, textDecoration = TextDecoration.Underline, modifier = Modifier.clickable { switchAccount() })
                }
                Spacer(Modifier.height(40.dp))
                Box(Modifier.align(Alignment.CenterHorizontally).size(96.dp).thinkingBorder(busy || AppLock.authing, RoundedCornerShape(26.dp), 2.5.dp).clip(RoundedCornerShape(26.dp)).background(C.lime.copy(alpha = .1f)).border(1.dp, C.lime.copy(alpha = .35f), RoundedCornerShape(26.dp)).clickable { bio() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Fingerprint, null, tint = C.lime, modifier = Modifier.size(50.dp))
                }
                Spacer(Modifier.height(10.dp))
                T("Chạm để đăng nhập bằng vân tay / khuôn mặt", 13.sp, color = LoginSoft, modifier = Modifier.fillMaxWidth(), align = TextAlign.Center)
                ErrorText(error)
                Spacer(Modifier.height(72.dp))
                LimeButton("Đăng nhập bằng vân tay / khuôn mặt", Icons.Filled.Fingerprint, busy = busy || AppLock.authing) { bio() }
                Spacer(Modifier.height(10.dp))
                GhostButton("Dùng email và mật khẩu") { form = true; error = null }
                LaunchedEffect(Unit) { if (!prompted) { prompted = true; bio() } }
            }
            else -> {
                T(if (last != null && challenge == null) "Chào mừng\ntrở lại" else if (challenge != null) "Xác minh\nđăng nhập" else "Đăng nhập", 30.sp, FontWeight.ExtraBold, LoginInk)
                Spacer(Modifier.height(6.dp))
                if (Auth.expired) T("Phiên đã hết hạn, nhập mật khẩu một lần.", 13.sp, FontWeight.SemiBold, C.lime)
                else T(if (challenge != null) "Bước hai để giữ tài khoản an toàn." else "Dùng email và mật khẩu của tài khoản MEGATECH.", 13.sp, color = LoginSoft)
                Spacer(Modifier.height(24.dp))
                val ch = challenge
                if (ch != null) {
                    T(if (ch["step"].s == "totp") "Nhập mã 6 số trong ứng dụng xác thực." else "Nhập mã 6 số đã gửi tới ${ch["to"].sn ?: "email"}.", 13.sp, color = LoginSoft)
                    Spacer(Modifier.height(10.dp))
                    LoginField(code, "Mã xác minh", KeyboardType.NumberPassword) { code = it.filter(Char::isDigit).take(6) }
                } else {
                    LoginField(email, "Email", KeyboardType.Email) { email = it }
                    Spacer(Modifier.height(12.dp))
                    LoginField(password, "Mật khẩu", KeyboardType.Password, password = true) { password = it }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { T("Nhớ máy này", 14.sp, FontWeight.SemiBold, LoginInk); T("Giữ đăng nhập, mở lại bằng vân tay / khuôn mặt", 11.sp, color = LoginSoft) }
                        Switch(keep, { keep = it }, colors = SwitchDefaults.colors(checkedThumbColor = LimeInk, checkedTrackColor = C.lime, uncheckedTrackColor = Color.White.copy(alpha = .1f), uncheckedBorderColor = Color.White.copy(alpha = .3f), uncheckedThumbColor = LoginSoft))
                    }
                }
                ErrorText(error)
                Spacer(Modifier.height(20.dp))
                val ok = !busy && (if (ch == null) email.isNotBlank() && password.isNotEmpty() else code.length == 6)
                LimeButton(if (ch == null) "Đăng nhập" else "Xác minh", enabled = ok, busy = busy) { submit() }
                Spacer(Modifier.height(6.dp))
                if (ch != null) TextButton({ challenge = null; code = "" }, Modifier.align(Alignment.CenterHorizontally)) { T("Đăng nhập lại", 13.sp, color = LoginSoft) }
                else if (welcome) TextButton({ form = false; error = null }, Modifier.align(Alignment.CenterHorizontally)) { T("Dùng vân tay / khuôn mặt", 13.sp, color = LoginSoft) }
            }
        }
    }
}

@Composable private fun ErrorText(msg: String?) { if (msg != null) { Spacer(Modifier.height(10.dp)); T(msg, 13.sp, FontWeight.SemiBold, Color(0xFFFF9C94)) } }
