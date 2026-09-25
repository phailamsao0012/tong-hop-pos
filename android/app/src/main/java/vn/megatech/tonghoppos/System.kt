package vn.megatech.tonghoppos

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Hộp thoại toàn màn hình có thanh tiêu đề + nút Lưu. */
@Composable fun FullDialog(title: String, onDismiss: () -> Unit, saveLabel: String? = "Lưu", saving: Boolean = false, onSave: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Dialog(onDismiss, DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(C.cream)) {
            Row(Modifier.fillMaxWidth().background(C.brandDeep).statusBarsPadding().padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onDismiss) { T("Đóng", 14.sp, color = Color.White) }
                T(title, 16.sp, FontWeight.Bold, Color.White, 1, Modifier.weight(1f), androidx.compose.ui.text.style.TextAlign.Center)
                if (onSave != null && saveLabel != null) TextButton(onSave, enabled = !saving) { T(if (saving) "Đang lưu…" else saveLabel, 14.sp, FontWeight.Bold, C.lime) } else Spacer(Modifier.width(64.dp))
            }
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
        }
    }
}
@Composable fun Field(value: String, label: String, number: Boolean = false, password: Boolean = false, onChange: (String) -> Unit) {
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true, visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Number else if (password) KeyboardType.Password else KeyboardType.Text),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = C.brand, unfocusedContainerColor = C.card, focusedContainerColor = C.card), shape = RoundedCornerShape(12.dp))
}
@Composable fun CheckRow(label: String, sub: String? = null, on: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { T(label, 13.sp); if (sub != null) T(sub, 10.sp, color = C.inkSoft) }; if (on) Icon(Icons.Filled.Check, null, tint = C.good) }
}

// ---------- Bảo mật ----------
@Composable fun SecurityScreen() {
    val ctx = LocalContext.current; val scope = rememberCoroutineScope()
    var dialog by remember { mutableStateOf("") }
    var notice by remember { mutableStateOf<String?>(null) }
    val d = load(Unit) { Api.security() }
    fun relogin(msg: String) { notice = msg; dialog = ""; scope.launch { delay(1200); Auth.signOut() } }
    SubPage("Bảo mật", d.loading && d.data != null, { d.reload() }) {
        PageTitle("Bảo mật tài khoản", "Tài khoản an toàn – Công việc luôn thông suốt")
        notice?.let { T("✓ $it", 12.sp, FontWeight.SemiBold, C.good) }
        ErrorLine(d.error)
        val s = d.data ?: run { if (d.error == null) Thinking(); return@SubPage }
        val ok = s["mfaEnabled"].b; val c = if (ok) C.good else C.warn
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.copy(alpha = .1f)).border(1.dp, c.copy(alpha = .25f), RoundedCornerShape(12.dp)).padding(12.dp)) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(c), contentAlignment = Alignment.Center) { Icon(if (ok) Icons.Filled.VerifiedUser else Icons.Filled.GppMaybe, null, tint = Color.White) }; Spacer(Modifier.width(10.dp))
            Column { T(if (ok) "Tài khoản của bạn đang được bảo vệ tốt" else if (s["mfaRequired"].b) "Vai trò của bạn bắt buộc bật xác thực 2 bước" else "Tài khoản chưa bật xác thực 2 bước", 13.sp, FontWeight.Bold); T(if (ok) "Tiếp tục duy trì các cài đặt bảo mật để giữ an toàn dữ liệu của doanh nghiệp." else "Bật mã ứng dụng bên dưới; mỗi lần đăng nhập máy mới cần thêm mã 6 số.", 10.sp, color = C.inkSoft) }
        }
        T("Bảo vệ trên máy này", 13.sp, FontWeight.Bold)
        Panel(12.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) { IconBox(Icons.Filled.Fingerprint, C.blue); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T("Khoá app bằng vân tay / khuôn mặt", 13.sp, FontWeight.SemiBold); T("Người khác cầm máy phải xác thực mới xem được số liệu", 10.sp, color = C.inkSoft) }
                Switch(AppLock.enabled, { on -> if (on && !AppLock.available(ctx as FragmentActivity)) notice = "Máy chưa cài vân tay, khuôn mặt hoặc mã khoá màn hình." else AppLock.set(on) }, colors = SwitchDefaults.colors(checkedTrackColor = C.good)) }
            if (AppLock.enabled) { Divider0(); Row(verticalAlignment = Alignment.CenterVertically) { T("Khoá lại sau khi rời app", 12.sp, modifier = Modifier.weight(1f)); SelectMenu(when (AppLock.graceSeconds) { 1 -> "Ngay lập tức"; 30 -> "30 giây"; 120 -> "2 phút"; 300 -> "5 phút"; else -> "30 phút" }, listOf(1 to "Ngay lập tức", 30 to "30 giây", 120 to "2 phút", 300 to "5 phút", 1800 to "30 phút"), modifier = Modifier.width(140.dp)) { AppLock.setGrace(it) } } }
            Divider0()
            Row(verticalAlignment = Alignment.CenterVertically) { IconBox(Icons.Filled.ScreenLockPortrait, C.purple); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T("Chặn chụp màn hình", 13.sp, FontWeight.SemiBold); T("Không cho chụp / quay màn hình, che số liệu trong màn chuyển app", 10.sp, color = C.inkSoft) }
                Switch(Privacy.secure, { Privacy.set(ctx as FragmentActivity, it) }, colors = SwitchDefaults.colors(checkedTrackColor = C.good)) }
        }
        Panel(0.dp) { ScanQrRow(ctx as FragmentActivity) }
        T("Phương thức đăng nhập", 13.sp, FontWeight.Bold)
        Panel(0.dp) {
            MethodRow(Icons.Filled.Face, C.blue, "Passkey (Face ID / vân tay)", if (s["passkeys"].size == 0) "Chưa có passkey nào" else "${s["passkeys"].size} passkey · gỡ ở mục dưới", s["passkeys"].size > 0) {}
            Divider0(56.dp)
            MethodRow(Icons.Filled.Lock, C.good, "Xác thực 2 bước (2FA)", if (s["totpEnabled"].b) "Mã ứng dụng đang bật · chạm để tắt" else "Bảo vệ tài khoản bằng mã xác thực · chạm để bật", s["totpEnabled"].b) { dialog = if (s["totpEnabled"].b) "totpOff" else "totpOn" }
        }
        if (s["passkeys"].size > 0) Panel(12.dp) {
            T("Passkey đã đăng ký", 12.sp, FontWeight.Bold)
            s["passkeys"].list.forEach { k -> Row(verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { T(k["name"].sn ?: "Passkey", 12.sp); T("Tạo ${Fmt.dateTime(k["created_at"].sn)}", 9.sp, color = C.inkSoft) }; IconButton({ scope.launch { runCatching { Api.send("/api/auth/passkey?id=" + Api.enc(k["id"].s), "DELETE", emptyMap()) }; d.reload() } }) { Icon(Icons.Filled.Delete, null, tint = C.bad) } } }
        }
        SessionsSection()
        Panel(0.dp) {
            Row(Modifier.fillMaxWidth().clickable { dialog = "password" }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.Key, null); Spacer(Modifier.width(12.dp)); T("Đổi mật khẩu", 13.sp, FontWeight.SemiBold, modifier = Modifier.weight(1f)); Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft) }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.brandSoft).padding(12.dp)) { Icon(Icons.Filled.VerifiedUser, null, tint = C.good); Spacer(Modifier.width(10.dp)); Column { T("Dữ liệu của bạn được mã hóa và bảo vệ theo tiêu chuẩn quốc tế.", 11.sp, FontWeight.SemiBold); T("MEGATECH – An tâm để phát triển bền vững.", 10.sp, color = C.inkSoft) } }
    }
    when (dialog) {
        "password" -> PasswordDialog({ dialog = "" }) { relogin("Đã đổi mật khẩu. Đăng nhập lại để tiếp tục.") }
        "totpOn" -> TotpOnDialog({ dialog = "" }) { relogin("Đã bật mã ứng dụng. Đăng nhập lại để tiếp tục.") }
        "totpOff" -> TotpOffDialog({ dialog = "" }) { relogin("Đã tắt mã ứng dụng. Đăng nhập lại để tiếp tục.") }
    }
}

@Composable fun MethodRow(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, title: String, sub: String, on: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onClick() }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { IconBox(icon, tint); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T(title, 13.sp, FontWeight.SemiBold); T(sub, 10.sp, color = C.inkSoft, maxLines = 1) }; Tag(if (on) "Đã bật" else "Chưa bật", if (on) Tone.Green else Tone.Gray); Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft) }
}

@Composable fun PasswordDialog(dismiss: () -> Unit, done: () -> Unit) {
    val scope = rememberCoroutineScope()
    var cur by remember { mutableStateOf("") }; var nx by remember { mutableStateOf("") }; var again by remember { mutableStateOf("") }; var err by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    FullDialog("Đổi mật khẩu", dismiss, "Đổi", busy, onSave = { if (nx.length < 10 || nx != again || cur.isEmpty()) err = "Mật khẩu mới từ 10 ký tự và nhập lại phải khớp." else scope.launch { busy = true; try { Api.send("/api/auth/password", "PUT", mapOf("current" to cur, "next" to nx)); done() } catch (e: Exception) { err = e.message }; busy = false } }) {
        Field(cur, "Mật khẩu hiện tại", password = true) { cur = it }; Field(nx, "Mật khẩu mới (từ 10 ký tự)", password = true) { nx = it }; Field(again, "Nhập lại mật khẩu mới", password = true) { again = it }
        ErrorLine(err); T("Sau khi đổi, mọi thiết bị kể cả máy này phải đăng nhập lại.", 11.sp, color = C.inkSoft)
    }
}

@Composable fun TotpOnDialog(dismiss: () -> Unit, done: () -> Unit) {
    val ctx = LocalContext.current; val scope = rememberCoroutineScope()
    var setup by remember { mutableStateOf<J?>(null) }; var code by remember { mutableStateOf("") }; var err by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { try { setup = Api.send("/api/auth/totp", "POST", mapOf("action" to "setup")) } catch (e: Exception) { err = e.message } }
    FullDialog("Bật mã ứng dụng", dismiss, "Bật", busy, onSave = { scope.launch { busy = true; try { Api.send("/api/auth/totp", "POST", mapOf("action" to "enable", "code" to code)); done() } catch (e: Exception) { err = e.message }; busy = false } }) {
        setup?.let { s ->
            Panel {
                T("1. Mở ứng dụng xác thực (Google Authenticator, Microsoft Authenticator…) và thêm tài khoản bằng nút dưới hoặc nhập khoá thủ công.", 13.sp)
                OutlineButton("Thêm vào ứng dụng xác thực") { openUrl(ctx, s["uri"].s) }
                Row(verticalAlignment = Alignment.CenterVertically) { T(s["secret"].s, 12.sp, FontWeight.Medium, modifier = Modifier.weight(1f)); IconButton({ (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("secret", s["secret"].s)) }) { Icon(Icons.Filled.ContentCopy, null, tint = C.brand) } }
            }
            T("2. Nhập mã đang hiện trong ứng dụng", 13.sp, FontWeight.Bold)
            Field(code, "Mã 6 số", number = true) { code = it.filter(Char::isDigit).take(6) }
        } ?: if (err == null) Skeleton(120.dp) else Unit
        ErrorLine(err)
    }
}

@Composable fun TotpOffDialog(dismiss: () -> Unit, done: () -> Unit) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }; var err by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    FullDialog("Tắt mã ứng dụng", dismiss, "Tắt", busy, onSave = { scope.launch { busy = true; try { Api.send("/api/auth/totp", "POST", mapOf("action" to "disable", "code" to code)); done() } catch (e: Exception) { err = e.message }; busy = false } }) {
        Field(code, "Mã 6 số từ ứng dụng xác thực", number = true) { code = it.filter(Char::isDigit).take(6) }
        T("Tắt xong, đăng nhập trên máy mới sẽ chỉ cần mật khẩu và mã gửi email. Vai trò bắt buộc 2 lớp sẽ bị chặn cho đến khi bật lại.", 11.sp, color = C.inkSoft); ErrorLine(err)
    }
}

// ---------- Cấu hình & kết nối ----------
@Composable fun ConfigScreen() {
    val scope = rememberCoroutineScope()
    var dialog by remember { mutableStateOf("") }
    var shopEdit by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(setOf<String>()) }
    var toast by remember { mutableStateOf<String?>(null) }
    val cfg = load(Unit) { Sync.refresh(); Api.get("/api/config") to runCatching { Api.get("/api/telegram") }.getOrNull() }
    fun syncNow(id: String) = scope.launch { busy = busy + id; toast = runCatching { Api.syncNow(id) }.fold({ "${Pos.name(id)}: đã đồng bộ ${Fmt.int(it["records"].d)} đơn mới." }, { it.message }); Sync.refresh(); busy = busy - id }
    SubPage("Cấu hình & kết nối", cfg.loading && cfg.data != null, { cfg.reload() }) {
        PageTitle("Cấu hình & kết nối", "Kết nối ổn định. Làm chủ hệ thống.") { Tag(if (Auth.isOwner) "Chỉ dành cho Admin" else "Chỉ xem", Tone.Green, true) }
        toast?.let { Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(C.brandSoft).padding(10.dp)) { T(it, 11.sp, FontWeight.SemiBold, C.good) } }
        SectionHead("Kết nối hệ thống POS", "${Sync.pos.size} shop")
        val shops = cfg.data?.first?.get("shops")?.list ?: emptyList()
        GridN(3, Pos.order.map { id -> { m: Modifier ->
            val p = Sync.pos.firstOrNull { it["posId"].s == id }; val shop = shops.firstOrNull { it["id"].s == id }
            val err = p?.get("lastError")?.sn != null; val slow = p?.let { Sync.age(it) > 15 } ?: true
            Column(m.clip(RoundedCornerShape(12.dp)).background(if (err) C.bad.copy(alpha = .06f) else C.card).border(1.dp, if (err) C.bad.copy(alpha = .3f) else Color.Transparent, RoundedCornerShape(12.dp)).clickable(enabled = Auth.isOwner) { shopEdit = id }.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                PosBadge(id, 28.dp)
                T(Pos.short(id), 11.sp, FontWeight.Bold, maxLines = 1)
                T(if (err) "● Gián đoạn" else if (slow) "● Chậm" else "● Hoạt động", 9.sp, FontWeight.SemiBold, if (err) C.bad else if (slow) C.warn else C.good)
                T("Đồng bộ: ${p?.let { Fmt.ago(it["lastSyncAt"].sn) } ?: "chưa"}", 8.sp, color = C.inkSoft, maxLines = 1)
                T("Shop ID ${shop?.get("shopId")?.sn ?: "—"}", 8.sp, color = C.inkSoft, maxLines = 1)
                if (Auth.isOwner) T(if (id in busy) "Đang đồng bộ…" else "Đồng bộ ngay", 8.sp, FontWeight.Bold, C.brand, modifier = Modifier.clickable(enabled = id !in busy) { syncNow(id) })
            }
        } })
        Sync.pos.firstOrNull { it["lastError"].sn != null }?.let { T("Lỗi gần nhất: ${it["lastError"].s}", 10.sp, color = C.bad) }
        Panel(12.dp) { Row(verticalAlignment = Alignment.CenterVertically) { IconBox(Icons.Filled.Schedule, C.good); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T("Lịch đồng bộ dữ liệu", 13.sp, FontWeight.Bold); T("Tự động mỗi 5 phút · khách hàng và ghi chú vài phút một lần", 10.sp, color = C.inkSoft); T("Lần đồng bộ gần nhất: ${Sync.pos.mapNotNull { it["lastSyncAt"].sn }.maxOrNull()?.let { Fmt.dateTime(it) } ?: "—"}", 10.sp, color = C.inkSoft) }; if (Auth.isOwner) OutlineButton("Đồng bộ tất cả") { Pos.order.forEach { syncNow(it) } } } }
        Grid2(listOf(
            { m -> Panel(12.dp, m, { dialog = "teams" }) { Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.Groups, null, tint = C.good); Spacer(Modifier.width(6.dp)); T("Phân công theo team", 12.sp, FontWeight.Bold) }; T("Team Marketing và marketer phụ trách.", 10.sp, color = C.inkSoft); T("Mở thiết lập ›", 10.sp, FontWeight.Bold, C.brand) } },
            { m -> Panel(12.dp, m, { if (Auth.isOwner) dialog = "users" }) { Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.Checklist, null, tint = C.good); Spacer(Modifier.width(6.dp)); T("Thiết lập quyền truy cập", 12.sp, FontWeight.Bold) }; listOf("Tài khoản & vai trò", "Trang được xem", "POS được xem", "Đội Sale / CSKH").forEach { T("☑ $it", 9.sp, color = C.inkSoft) }; T(if (Auth.isOwner) "Quản lý người dùng ›" else "Chỉ chủ hệ thống", 10.sp, FontWeight.Bold, if (Auth.isOwner) C.brand else C.inkSoft) } },
        ))
        val al = cfg.data?.first?.get("alert")
        Panel(12.dp, onClick = { if (Auth.isOwner) dialog = "alert" }) { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(34.dp).clip(CircleShape).background(C.warn), contentAlignment = Alignment.Center) { Icon(Icons.Filled.NotificationsActive, null, tint = Color.White, modifier = Modifier.size(18.dp)) }; Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T("Cảnh báo tỷ lệ chốt thấp", 13.sp, FontWeight.Bold); T(al?.let { if (it["enabled"].b) "Đang bật · dưới ${it["threshold"].i}% khi ≥ ${it["minReceived"].i} số · ca ${it["shiftStart"].s}–${it["shiftEnd"].s}" else "Đang tắt" } ?: "—", 10.sp, color = if (al?.get("enabled")?.b == true) C.good else C.inkSoft) }; if (Auth.isOwner) OutlineButton("Cấu hình") { dialog = "alert" } } }
        val tg = cfg.data?.second
        Panel(12.dp, onClick = { dialog = "telegram" }) { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(34.dp).clip(CircleShape).background(C.blue), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Send, null, tint = Color.White, modifier = Modifier.size(16.dp)) }; Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T("Kết nối Telegram", 13.sp, FontWeight.Bold); T("Trạng thái: ${if (tg == null) "—" else if (tg["hasToken"].b && tg["botError"].sn == null) "Hoạt động" else "Chưa sẵn sàng"}", 11.sp, FontWeight.SemiBold, if (tg?.get("hasToken")?.b == true && tg["botError"].sn == null) C.good else C.warn); T(tg?.get("bot")?.get("username")?.sn?.let { "Bot @$it · ${tg["allowed"].size} chat được phép" } ?: "Nhận cảnh báo, lỗi đồng bộ, tuyển dụng, báo cáo nhanh.", 10.sp, color = C.inkSoft) }; OutlineButton("Kiểm tra") { dialog = "telegram" } } }
        Panel(12.dp, onClick = { dialog = "shifts" }) { Row(verticalAlignment = Alignment.CenterVertically) { IconBox(Icons.Filled.MoreTime, C.purple); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T("Ca làm cá nhân", 13.sp, FontWeight.Bold); T("Giờ ca riêng từng nhân viên cho chế độ Ca cá nhân.", 10.sp, color = C.inkSoft) }; Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft) } }
    }
    shopEdit?.let { id -> ShopDialog(id, cfg.data?.first?.get("shops")?.list?.firstOrNull { it["id"].s == id }, { shopEdit = null }) { shopEdit = null; toast = "Đã lưu Shop ID cho ${Pos.name(id)}."; cfg.reload() } }
    when (dialog) {
        "alert" -> AlertDialogScreen(cfg.data?.first?.get("alert"), { dialog = "" }) { dialog = ""; toast = "Đã lưu cảnh báo."; cfg.reload() }
        "users" -> UsersDialog { dialog = "" }
        "teams" -> TeamsDialog { dialog = "" }
        "telegram" -> TelegramDialog(cfg.data?.second) { dialog = ""; cfg.reload() }
        "shifts" -> ShiftsDialog { dialog = "" }
    }
}

@Composable fun ShopDialog(id: String, shop: J?, dismiss: () -> Unit, done: () -> Unit) {
    val scope = rememberCoroutineScope()
    var v by remember { mutableStateOf(shop?.get("shopId")?.sn ?: "") }; var err by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    FullDialog("Kết nối ${Pos.name(id)}", dismiss, "Lưu", busy, onSave = { scope.launch { busy = true; try { Api.send("/api/config", "PUT", mapOf("type" to "shop", "id" to id, "shopId" to v)); done() } catch (e: Exception) { err = e.message }; busy = false } }) {
        Field(v, "Shop ID (dãy số trên Pancake)", number = true) { v = it.filter(Char::isDigit) }
        T("Lấy trong Pancake POS: địa chỉ trang có dạng pos.pancake.vn/shop/<số>/…; số đó là Shop ID. API key giữ ở Cloudflare, không nhập ở đây.", 11.sp, color = C.inkSoft)
        shop?.get("historyStart")?.sn?.let { T("Lịch sử đã lấy từ ${Fmt.day(it)}", 11.sp, color = C.inkSoft) }; ErrorLine(err)
    }
}

@Composable fun AlertDialogScreen(a: J?, dismiss: () -> Unit, done: () -> Unit) {
    val scope = rememberCoroutineScope()
    var enabled by remember { mutableStateOf(a?.get("enabled")?.b ?: false) }
    var threshold by remember { mutableStateOf((a?.get("threshold")?.i ?: 40).toString()) }
    var minRecv by remember { mutableStateOf((a?.get("minReceived")?.i ?: 20).toString()) }
    var cooldown by remember { mutableStateOf((a?.get("cooldownMinutes")?.i ?: 60).toString()) }
    var start by remember { mutableStateOf(a?.get("shiftStart")?.sn ?: "08:00") }
    var end by remember { mutableStateOf(a?.get("shiftEnd")?.sn ?: "12:00") }
    var repeat by remember { mutableStateOf(a?.get("repeat")?.b ?: false) }
    var chat by remember { mutableStateOf(a?.get("chatId")?.sn ?: "") }
    val ids = remember { mutableStateListOf<String>().apply { addAll(a?.get("employeeIds")?.strings ?: emptyList()) } }
    var err by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    val staff = load(Unit) { Api.employees() }
    FullDialog("Cảnh báo tỷ lệ chốt", dismiss, "Lưu", busy, onSave = { scope.launch { busy = true; try {
        Api.send("/api/config", "PUT", mapOf("type" to "alert", "alert" to mapOf("enabled" to enabled, "threshold" to (threshold.toIntOrNull() ?: 40), "minReceived" to (minRecv.toIntOrNull() ?: 20), "cooldownMinutes" to (cooldown.toIntOrNull() ?: 60), "shiftStart" to start, "shiftEnd" to end, "repeat" to repeat, "chatId" to chat, "employeeIds" to ids.toList()))); done()
    } catch (e: Exception) { err = e.message }; busy = false } }) {
        Panel { Row(verticalAlignment = Alignment.CenterVertically) { T("Bật cảnh báo qua Telegram", 13.sp, modifier = Modifier.weight(1f)); Switch(enabled, { enabled = it }, colors = SwitchDefaults.colors(checkedTrackColor = C.good)) }; Row(verticalAlignment = Alignment.CenterVertically) { T("Lặp lại khi vẫn thấp", 13.sp, modifier = Modifier.weight(1f)); Switch(repeat, { repeat = it }, colors = SwitchDefaults.colors(checkedTrackColor = C.good)) } }
        Field(threshold, "Tỷ lệ chốt dưới (%)", true) { threshold = it.filter(Char::isDigit) }
        Field(minRecv, "Khi đã nhận từ (số)", true) { minRecv = it.filter(Char::isDigit) }
        Field(cooldown, "Nhắc lại sau (phút, 5–1440)", true) { cooldown = it.filter(Char::isDigit) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Box(Modifier.weight(1f)) { Field(start, "Ca từ (HH:MM)") { start = it.take(5) } }; Box(Modifier.weight(1f)) { Field(end, "đến (HH:MM)") { end = it.take(5) } } }
        Field(chat, "Chat ID Telegram (để trống: gửi các chat được phép)") { chat = it }
        T("Nhân viên theo dõi (${if (ids.isEmpty()) "tất cả" else ids.size})", 13.sp, FontWeight.Bold)
        Panel(8.dp) { staff.data?.list?.filter { it["active"].isNull || it["active"].b }?.forEach { e -> CheckRow(e["name"].s, e["department"].sn, e["id"].s in ids) { if (e["id"].s in ids) ids.remove(e["id"].s) else ids.add(e["id"].s) } } }
        ErrorLine(err)
    }
}

val VIEW_LABELS = listOf("center" to "Điều khiển trung tâm", "overview" to "Tổng quan POS", "shift" to "Điều hành trong ca", "calls" to "Cuộc gọi CSKH", "care" to "Khách theo nhân viên", "repurchase" to "Mua lại & Upsell", "dormant" to "Khách lâu chưa mua", "marketing" to "Tổng quan MKT", "compare" to "So sánh nhân viên", "batches" to "Data được cấp", "pipeline" to "Vận hành đơn", "customers" to "Hồ sơ khách hàng", "monthly" to "Báo cáo cuối tháng", "custom" to "Báo cáo tùy chỉnh", "raw-orders" to "Đơn nguồn Pancake POS")

@Composable fun UsersDialog(dismiss: () -> Unit) {
    var edit by remember { mutableStateOf<J?>(null) }; var create by remember { mutableStateOf(false) }
    val users = load(Unit) { Api.get("/api/users") }
    FullDialog("Người dùng · ${users.data?.size ?: 0}", dismiss, "+ Thêm", onSave = { create = true }) {
        ErrorLine(users.error)
        users.data?.list?.forEach { u ->
            Panel(12.dp, onClick = { edit = u }) { Row(verticalAlignment = Alignment.CenterVertically) { Avatar(u["name"].s, 34.dp, if (u["disabled"].b) C.gray else C.brand); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { T(u["name"].s, 13.sp, FontWeight.SemiBold); T("${u["email"].s} · ${when (u["role"].s) { "owner" -> "Chủ hệ thống"; "director" -> "Giám đốc"; "lead" -> "Trưởng nhóm"; else -> "Nhân viên" }}${if (u["team"].s == "sale") " · Sale" else if (u["team"].s == "cskh") " · CSKH" else ""}", 10.sp, color = C.inkSoft, maxLines = 1) }; if (u["disabled"].b) Tag("Đã khoá", Tone.Red) else T(u["lastLoginAt"].sn?.let { "vào ${Fmt.day(it)}" } ?: "chưa đăng nhập", 9.sp, color = C.inkSoft) } }
        }
    }
    if (edit != null || create) UserEditDialog(edit, { edit = null; create = false }) { edit = null; create = false; users.reload() }
}

@Composable fun UserEditDialog(u: J?, dismiss: () -> Unit, done: () -> Unit) {
    val scope = rememberCoroutineScope()
    val isOwnerUser = u?.get("role")?.s == "owner"
    var name by remember { mutableStateOf(u?.get("name")?.s ?: "") }; var email by remember { mutableStateOf("") }; var pw by remember { mutableStateOf("") }; var title by remember { mutableStateOf(u?.get("title")?.s ?: "") }
    var role by remember { mutableStateOf(u?.get("role")?.s?.takeIf { it != "owner" } ?: "staff") }; var team by remember { mutableStateOf(u?.get("team")?.sn ?: "all") }; var disabled by remember { mutableStateOf(u?.get("disabled")?.b ?: false) }
    val views = remember { mutableStateListOf<String>().apply { addAll(u?.get("views")?.strings ?: emptyList()) } }
    val pos = remember { mutableStateListOf<String>().apply { addAll(u?.get("posIds")?.strings ?: emptyList()) } }
    var err by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    FullDialog(if (u == null) "Thêm tài khoản" else "Sửa tài khoản", dismiss, "Lưu", busy, onSave = { scope.launch { busy = true; try {
        val body = mutableMapOf<String, Any?>("name" to name, "title" to title, "views" to views.toList(), "posIds" to pos.toList(), "team" to team)
        if (u != null) { body["id"] = u["id"].s; if (!isOwnerUser) { body["role"] = role; body["disabled"] = disabled }; Api.send("/api/users", "PUT", body) }
        else { body["email"] = email; body["password"] = pw; body["role"] = role; Api.send("/api/users", "POST", body) }
        done()
    } catch (e: Exception) { err = e.message }; busy = false } }) {
        Field(name, "Họ tên") { name = it }
        if (u == null) { Field(email, "Email") { email = it }; Field(pw, "Mật khẩu (từ 8 ký tự)", password = true) { pw = it } } else KV("Email", u["email"].s)
        Field(title, "Chức danh") { title = it }
        if (!isOwnerUser) {
            T("Vai trò", 12.sp, FontWeight.Bold); Segmented(role, listOf("staff" to "Nhân viên", "lead" to "Trưởng nhóm", "director" to "Giám đốc")) { role = it }
            T("Đội", 12.sp, FontWeight.Bold); Segmented(team, listOf("all" to "Tất cả", "sale" to "Sale", "cskh" to "CSKH")) { team = it }
            if (u != null) Row(verticalAlignment = Alignment.CenterVertically) { T("Khoá tài khoản", 13.sp, modifier = Modifier.weight(1f)); Switch(disabled, { disabled = it }, colors = SwitchDefaults.colors(checkedTrackColor = C.bad)) }
            T("Trang được xem (${views.size})", 12.sp, FontWeight.Bold)
            Panel(8.dp) { VIEW_LABELS.forEach { (k, l) -> CheckRow(l, on = k in views) { if (k in views) views.remove(k) else views.add(k) } } }
            T("POS được xem (${if (pos.isEmpty()) "tất cả" else pos.size})", 12.sp, FontWeight.Bold)
            Panel(8.dp) { Pos.order.forEach { id -> CheckRow(Pos.name(id), on = id in pos) { if (id in pos) pos.remove(id) else pos.add(id) } } }
        }
        ErrorLine(err)
    }
}

@Composable fun TeamsDialog(dismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val d = load(Unit) { Api.get("/api/marketing-teams") }
    val teams = remember { mutableStateListOf<Triple<String, String, List<String>>>() }
    LaunchedEffect(d.data) { d.data?.let { teams.clear(); teams.addAll(it["teams"].list.map { t -> Triple(t["id"].s, t["name"].s, t["memberIds"].strings) }) } }
    var newName by remember { mutableStateOf("") }; var err by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    val people = d.data?.get("people")?.list ?: emptyList()
    FullDialog("Team Marketing", dismiss, if (Auth.isOwner) "Lưu" else null, busy, onSave = { scope.launch { busy = true; try { Api.send("/api/marketing-teams", "PUT", mapOf("teams" to teams.map { mapOf("id" to it.first, "name" to it.second, "memberIds" to it.third) })); dismiss() } catch (e: Exception) { err = e.message }; busy = false } }) {
        ErrorLine(err ?: d.error)
        teams.forEachIndexed { i, t ->
            Panel {
                if (Auth.isOwner) Field(t.second, "Tên team") { teams[i] = t.copy(second = it) } else T(t.second, 15.sp, FontWeight.Bold)
                t.third.forEach { m -> Row(verticalAlignment = Alignment.CenterVertically) { T(people.firstOrNull { it["id"].s == m }?.get("name")?.s ?: m, 13.sp, modifier = Modifier.weight(1f)); if (Auth.isOwner) IconButton({ teams[i] = t.copy(third = t.third - m) }) { Icon(Icons.Filled.RemoveCircle, null, tint = C.bad) } } }
                if (Auth.isOwner) {
                    val free = people.filter { it["marketer"].b && teams.none { x -> it["id"].s in x.third } }
                    SelectMenu("+ Thêm marketer", free.map { it["id"].s to it["name"].s }) { teams[i] = t.copy(third = t.third + it) }
                    TextButton({ teams.removeAt(i) }) { T("Xoá team", 12.sp, color = C.bad) }
                }
            }
        }
        if (Auth.isOwner) Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.weight(1f)) { Field(newName, "Tên team mới") { newName = it } }; Spacer(Modifier.width(8.dp)); OutlineButton("Thêm") { if (newName.isNotBlank()) { teams.add(Triple("mkt_" + java.util.UUID.randomUUID().toString(), newName.trim(), emptyList())); newName = "" } } }
        val free = people.filter { it["marketer"].b && teams.none { x -> it["id"].s in x.third } }
        if (free.isNotEmpty()) { T("Marketer chưa có team · ${free.size}", 12.sp, FontWeight.Bold, C.inkSoft); Panel(10.dp) { free.forEach { T(it["name"].s, 12.sp, color = C.inkSoft) } } }
    }
}

@Composable fun TelegramDialog(tg: J?, dismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var chat by remember { mutableStateOf("") }; var msg by remember { mutableStateOf<String?>(null) }
    FullDialog("Telegram", dismiss, null) {
        Panel { KV("Token", if (tg?.get("hasToken")?.b == true) "Đã cấu hình (Cloudflare)" else "Chưa có"); KV("Bot", tg?.get("bot")?.get("username")?.sn?.let { "@$it" } ?: tg?.get("botError")?.sn ?: "—"); tg?.get("pairingCode")?.sn?.let { KV("Mã ghép nối", it); T("Người mới nhắn mã này cho bot để xin quyền nhận thông báo; chủ hệ thống duyệt.", 10.sp, color = C.inkSoft) } }
        T("Chat được phép · ${tg?.get("allowed")?.size ?: 0}", 13.sp, FontWeight.Bold)
        Panel(10.dp) { tg?.get("allowed")?.list?.forEach { c -> Row(verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { T(c["name"].sn ?: c["chat_id"].s, 13.sp); T("${c["chat_id"].s} · ${if (c["role"].s == "admin") "quản trị" else "thành viên"}", 10.sp, color = C.inkSoft) }; if (Auth.isOwner) IconButton({ scope.launch { runCatching { Api.send("/api/telegram", "POST", mapOf("action" to "disallow", "chatId" to c["chat_id"].s)) }; msg = "Đã gỡ ${c["chat_id"].s}." } }) { Icon(Icons.Filled.RemoveCircle, null, tint = C.bad) } } } ?: T("Chưa có chat nào.", 12.sp, color = C.inkSoft) }
        tg?.get("chats")?.list?.takeIf { it.isNotEmpty() }?.let { recent -> T("Chat gần đây với bot", 13.sp, FontWeight.Bold); Panel(10.dp) { recent.forEach { c -> Row(verticalAlignment = Alignment.CenterVertically) { T(c["name"].sn ?: c["id"].s, 13.sp, modifier = Modifier.weight(1f)); if (Auth.isOwner) OutlineButton("Cho phép") { scope.launch { runCatching { Api.send("/api/telegram", "POST", mapOf("action" to "allow", "chatId" to c["id"].s, "name" to c["name"].s)) }; msg = "Đã cho phép ${c["name"].sn ?: c["id"].s}." } } } } } }
        T("Gửi tin thử", 13.sp, FontWeight.Bold)
        Field(chat, "Chat ID (dãy số)") { chat = it }
        PrimaryButton("Gửi tin nhắn kiểm tra", Icons.Filled.Send) { scope.launch { msg = runCatching { Api.send("/api/telegram", "POST", mapOf("action" to "test", "chatId" to chat)) }.fold({ "Đã gửi tin thử tới $chat." }, { it.message }) } }
        msg?.let { T(it, 12.sp, color = C.good) }
    }
}

@Composable fun ShiftsDialog(dismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val staff = load(Unit) { Api.employees() }
    val items = remember { mutableStateMapOf<String, Pair<Int, Int>>() }
    LaunchedEffect(Unit) { runCatching { Api.get("/api/staff-settings") }.onSuccess { r -> r["items"].list.forEach { if (!it["shiftStart"].isNull && !it["shiftEnd"].isNull) items[it["userId"].s] = it["shiftStart"].i to it["shiftEnd"].i } } }
    var err by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    val list = staff.data?.list?.filter { it["active"].isNull || it["active"].b } ?: emptyList()
    FullDialog("Ca làm cá nhân", dismiss, if (Auth.isOwner) "Lưu" else null, busy, onSave = { scope.launch { busy = true; try { Api.send("/api/staff-settings", "PUT", mapOf("items" to list.map { e -> val v = items[e["id"].s]; mapOf("userId" to e["id"].s, "shiftStart" to v?.first, "shiftEnd" to v?.second) })); dismiss() } catch (e: Exception) { err = e.message }; busy = false } }) {
        T("Đặt giờ ca riêng cho từng người; để trống thì dùng ca chung.", 11.sp, color = C.inkSoft)
        ErrorLine(err)
        Panel(8.dp) {
            list.forEach { e ->
                val v = items[e["id"].s]
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { T(e["name"].s, 13.sp); T(e["department"].s, 10.sp, color = C.inkSoft) }
                    SelectMenu(v?.let { "${it.first}:00 – ${it.second}:00" } ?: "Ca chung", listOf<Pair<Pair<Int, Int>?, String>>(null to "Dùng ca chung") + listOf(8 to 12, 8 to 17, 12 to 17, 13 to 22, 17 to 22, 8 to 22).map { it to "${it.first}:00 – ${it.second}:00" }, modifier = Modifier.width(130.dp)) { if (Auth.isOwner) { if (it == null) items.remove(e["id"].s) else items[e["id"].s] = it } }
                }
            }
        }
    }
}
