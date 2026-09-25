package vn.megatech.tonghoppos

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Thông báo ngắn nổi ở đầu màn hình. */
object Notice {
    var text by mutableStateOf<String?>(null)
    var bad by mutableStateOf(false)
    fun show(msg: String?, error: Boolean = false) { text = msg; bad = error }
}

@Composable fun NoticeBanner() {
    val msg = Notice.text
    LaunchedEffect(msg) { if (msg != null) { delay(4000); if (Notice.text == msg) Notice.text = null } }
    AnimatedVisibility(msg != null, enter = slideInVertically { -it } + fadeIn(), exit = slideOutVertically { -it } + fadeOut()) {
        Box(Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp)) {
            Row(Modifier.fillMaxWidth().shadow(10.dp, RoundedCornerShape(14.dp)).clip(RoundedCornerShape(14.dp)).background(if (Notice.bad) C.bad else C.brand).clickable { Notice.text = null }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (Notice.bad) Icons.Filled.GppBad else Icons.Filled.VerifiedUser, null, tint = if (Notice.bad) Color.White else C.lime, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(10.dp))
                T(msg ?: "", 13.sp, FontWeight.SemiBold, Color.White)
            }
        }
    }
}

/**
 * Duyệt đăng nhập máy tính: yêu cầu 'approve' (bước hai sau mật khẩu) app tự hỏi mỗi 5 giây khi đang mở,
 * và yêu cầu 'qr' khi quét mã trên máy tính. Id đã xử lý / đã đóng được nhớ để không hiện lại.
 */
object Approvals {
    var current by mutableStateOf<J?>(null)
    /** Bản debug: id nhận qua intent, mở khi đã đăng nhập. */
    var pendingOpen by mutableStateOf<String?>(null)
    private val seen = mutableSetOf<String>()
    private val qrId = Regex("/qr/([A-Za-z0-9_-]+)")

    fun parse(raw: String): String? = qrId.find(raw)?.groupValues?.get(1)
    fun close() { current?.let { seen += it["id"].s }; current = null }
    suspend fun poll() {
        if (current != null) return
        val items = runCatching { Api.get("/api/auth/approvals")["items"].list }.getOrNull() ?: return
        items.firstOrNull { it["id"].s !in seen }?.let { if (current == null) current = it }
    }
    /** Mở một yêu cầu theo id (sau khi quét QR). */
    suspend fun open(id: String) {
        try { val item = Api.get("/api/auth/approvals?id=" + Api.enc(id))["item"]; if (item.isNull) Notice.show("Mã đã hết hạn hoặc đã dùng.", true) else { seen -= id; current = item } }
        catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) { Notice.show(e.message ?: "Không kết nối được máy chủ.", true) }
    }
    /** Quét QR trên máy tính bằng máy quét của Google Play services (không cần quyền camera). */
    fun scan(act: FragmentActivity, scope: CoroutineScope) {
        val opts = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(act, opts).startScan()
            .addOnSuccessListener { b -> val id = parse(b.rawValue ?: ""); if (id == null) Notice.show("Đây không phải mã đăng nhập MEGATECH", true) else scope.launch { open(id) } }
            .addOnFailureListener { e -> Notice.show("Không mở được máy quét: ${e.message ?: "lỗi không rõ"}", true) }
    }
    suspend fun decide(id: String, number: Int?, approve: Boolean) {
        val msg = try {
            val r = Api.send("/api/auth/approvals", "POST", mapOf("id" to id, "number" to number, "decision" to if (approve) "approve" else "deny"))
            when (r["status"].s) {
                "approved" -> "Đã cho máy tính đăng nhập" to false
                "wrong-number" -> "Sai số — đã chặn yêu cầu. Nếu bạn không đăng nhập, hãy đổi mật khẩu." to true
                else -> "Đã chặn" to true
            }
        } catch (e: ApiError) { (e.message ?: "Yêu cầu đã hết hạn.") to true } catch (e: Exception) { "Không kết nối được máy chủ." to true }
        Notice.show(msg.first, msg.second)
        close()
    }
}

/** Sheet "Đăng nhập trên máy tính?": máy nào, ở đâu, chọn đúng số rồi xác nhận bằng vân tay / khuôn mặt. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ApprovalSheet(act: FragmentActivity, item: J) {
    val scope = rememberCoroutineScope()
    val id = item["id"].s
    var pick by remember(id) { mutableStateOf<Int?>(null) }
    var busy by remember(id) { mutableStateOf(false) }
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet({ Approvals.close() }, sheetState = state, containerColor = C.card) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val phone = Regex("iPhone|iPad|Android|app MEGATECH", RegexOption.IGNORE_CASE).containsMatchIn(item["device"].s)
            T(if (phone) "Đăng nhập trên điện thoại khác?" else "Đăng nhập trên máy tính?", 18.sp, FontWeight.Bold, modifier = Modifier.fillMaxWidth(), align = TextAlign.Center)
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xFFF5F8F3)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (phone) Icons.Filled.PhoneIphone else Icons.Filled.Computer, null, tint = C.brand, modifier = Modifier.size(32.dp)); Spacer(Modifier.width(12.dp))
                Column {
                    T(item["device"].sn ?: "Máy không rõ", 14.sp, FontWeight.Bold)
                    T(listOfNotNull(item["place"].sn, item["ip"].sn, Fmt.ago(item["createdAt"].sn)).joinToString(" · "), 12.sp, color = C.inkSoft)
                    T(if (item["kind"].s == "qr") "Quét mã QR trên máy tính" else "Vừa nhập đúng mật khẩu tài khoản của bạn", 11.sp, color = C.inkSoft)
                }
            }
            T(if (phone) "Chọn số đang hiện trên điện thoại kia" else "Chọn số đang hiện trên máy tính", 13.sp, color = C.inkSoft, modifier = Modifier.fillMaxWidth(), align = TextAlign.Center)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally)) {
                item["choices"].list.forEach { c ->
                    val n = c.i; val on = pick == n
                    Box(Modifier.size(68.dp).clip(RoundedCornerShape(14.dp)).background(if (on) C.brand else C.card).border(1.dp, if (on) C.brand else Color(0xFFD5DFD6), RoundedCornerShape(14.dp)).clickable(enabled = !busy) { pick = n }, contentAlignment = Alignment.Center) {
                        T(n.toString().padStart(2, '0'), 28.sp, FontWeight.ExtraBold, if (on) Color.White else C.ink)
                    }
                }
            }
            val ready = pick != null && !busy
            Row(Modifier.fillMaxWidth().height(50.dp).thinkingBorder(busy, RoundedCornerShape(14.dp)).clip(RoundedCornerShape(14.dp)).background(if (ready || busy) C.brand else C.brand.copy(alpha = .35f)).clickable(enabled = ready) {
                val go = { scope.launch { busy = true; Approvals.decide(id, pick, true); busy = false } }
                // Máy không cài khoá màn hình thì không có gì để hỏi thêm: duyệt luôn.
                if (AppLock.available(act)) AppLock.authenticate(act, "Cho máy tính đăng nhập", "Xác thực để duyệt đăng nhập MEGATECH") { ok -> if (ok) go() } else go()
            }, horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                run { Icon(Icons.Filled.Fingerprint, null, tint = Color.White, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)); T("Xác nhận bằng vân tay / khuôn mặt", 14.sp, FontWeight.Bold, Color.White) }
            }
            Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(14.dp)).background(C.card).border(1.dp, Color(0xFFD5DFD6), RoundedCornerShape(14.dp)).clickable(enabled = !busy) { scope.launch { busy = true; Approvals.decide(id, null, false); busy = false } }, contentAlignment = Alignment.Center) {
                T("Không phải tôi · chặn", 14.sp, FontWeight.Bold, C.bad)
            }
        }
    }
}

/** Dòng "Quét đăng nhập máy tính" (tab Thêm, màn Bảo mật). */
@Composable fun ScanQrRow(act: FragmentActivity) {
    val scope = rememberCoroutineScope()
    Row(Modifier.fillMaxWidth().clickable { Approvals.scan(act, scope) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        IconBox(Icons.Filled.QrCodeScanner, C.brand); Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) { T("Quét đăng nhập máy tính", 14.sp, FontWeight.SemiBold); T("Quét mã QR trên trang đăng nhập web để vào không cần mật khẩu", 10.sp, color = C.inkSoft, maxLines = 2) }
        Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft)
    }
}

private fun clientIcon(client: String): ImageVector = when (client) { "ios" -> Icons.Filled.PhoneIphone; "android" -> Icons.Filled.PhoneAndroid; else -> Icons.Filled.Computer }

/** "Thiết bị đang đăng nhập": phiên của mình (chủ hệ thống: mọi tài khoản), đăng xuất từng máy / mọi máy khác. */
@Composable fun SessionsSection() {
    val scope = rememberCoroutineScope()
    var all by remember { mutableStateOf(false) }
    var confirmOthers by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf(setOf<String>()) }
    val d = load(all) { Api.get("/api/auth/sessions" + if (all) "?scope=all" else "")["sessions"].list }
    val list = d.data ?: emptyList()
    Row(verticalAlignment = Alignment.CenterVertically) {
        T("Thiết bị đang đăng nhập", 13.sp, FontWeight.Bold, modifier = Modifier.weight(1f))
        if (Auth.isOwner) { T("Mọi tài khoản", 11.sp, color = C.inkSoft); Spacer(Modifier.width(6.dp)); Switch(all, { all = it }, colors = SwitchDefaults.colors(checkedTrackColor = C.good)) }
        else T("${list.size} thiết bị", 11.sp, color = C.inkSoft)
    }
    ErrorLine(d.error)
    if (d.data == null && d.error == null) { Thinking(listOf("Đang tải thiết bị đang đăng nhập…", "Sắp xong…")); return }
    val groups = if (all) list.groupBy { it["userId"].s }.values.sortedByDescending { g -> g.any { it["current"].b } } else listOf(list)
    groups.forEach { g ->
        if (all) Row(verticalAlignment = Alignment.CenterVertically) { Avatar(g.first()["name"].s, 24.dp); Spacer(Modifier.width(8.dp)); T(g.first()["name"].sn ?: g.first()["email"].s, 12.sp, FontWeight.Bold); T("  ${g.first()["email"].s} · ${g.size} máy", 10.sp, color = C.inkSoft, maxLines = 1) }
        Panel(0.dp) {
            g.forEachIndexed { i, s ->
                val cur = s["current"].b; val sid = s["id"].s
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconBox(clientIcon(s["client"].s), if (cur) C.good else C.ink); Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            T(s["device"].sn ?: "Không rõ", 13.sp, FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f, false))
                            if (cur) { Spacer(Modifier.width(6.dp)); Tag("Máy này", Tone.Green) }
                        }
                        s["methodLabel"].sn?.let { Tag(it, Tone.Gray) }
                        T(listOfNotNull(s["place"].sn, s["ip"].sn, "lần cuối " + Fmt.ago(s["lastSeenAt"].sn)).joinToString(" · "), 10.sp, color = C.inkSoft, maxLines = 2)
                    }
                    if (!cur) TextButton({ scope.launch { removing = removing + sid; try { Api.delete("/api/auth/sessions?id=" + Api.enc(sid)); Notice.show("Đã đăng xuất ${s["device"].s}.") } catch (e: Exception) { Notice.show(e.message, true) }; removing = removing - sid; d.reload() } }, enabled = sid !in removing) {
                        T(if (sid in removing) "…" else "Đăng xuất", 12.sp, FontWeight.Bold, C.bad)
                    }
                }
                if (i < g.lastIndex) Divider0(56.dp)
            }
        }
    }
    val mine = list.firstOrNull { it["current"].b }?.get("userId")?.s
    val others = list.count { !it["current"].b && (mine == null || it["userId"].s == mine) }
    Panel(0.dp) {
        Row(Modifier.fillMaxWidth().clickable(enabled = others > 0) { confirmOthers = true }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.AutoMirrored.Filled.Logout, null, tint = if (others > 0) C.bad else C.gray); Spacer(Modifier.width(12.dp))
            T("Đăng xuất mọi máy khác", 13.sp, FontWeight.SemiBold, if (others > 0) C.ink else C.inkSoft, modifier = Modifier.weight(1f)); Icon(Icons.Filled.ChevronRight, null, tint = C.inkSoft)
        }
    }
    if (confirmOthers) AlertDialog({ confirmOthers = false }, title = { T("Đăng xuất mọi máy khác?", 15.sp, FontWeight.Bold) }, text = { T("Mọi máy khác đang vào tài khoản của bạn sẽ phải đăng nhập lại. Máy này vẫn giữ đăng nhập.", 13.sp) },
        confirmButton = { TextButton({ confirmOthers = false; scope.launch { try { val r = Api.delete("/api/auth/sessions?others=1"); Notice.show("Đã đăng xuất ${r["removed"].i} máy khác.") } catch (e: Exception) { Notice.show(e.message, true) }; d.reload() } }) { T("Đăng xuất", 14.sp, FontWeight.Bold, C.bad) } },
        dismissButton = { TextButton({ confirmOthers = false }) { T("Hủy", 14.sp) } }, containerColor = C.card)
}
