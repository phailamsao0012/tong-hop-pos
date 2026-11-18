package vn.megatech.tonghoppos

import android.content.Intent
import android.os.SystemClock
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.isTraversalGroup
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.withResumed
import kotlinx.coroutines.delay
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.zIndex
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    var lockSheetGeneration by mutableIntStateOf(0)
        private set
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT), navigationBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT))
        Api.init(this)
        AppLock.init(this)
        Privacy.init(this)
        debugExtras(intent)
        setContent {
            // Android 1.0: nền sáng/tối theo máy, bộ màu Gemini (C đọc Theme.dark).
            Theme.dark = androidx.compose.foundation.isSystemInDarkTheme()
            val scheme = if (Theme.dark) darkColorScheme(primary = C.brand, secondary = C.brandDeep, surface = C.card, background = C.cream, onSurface = C.ink, onBackground = C.ink)
                else lightColorScheme(primary = C.brand, secondary = C.brandDeep, surface = C.card, background = C.cream, onSurface = C.ink, onBackground = C.ink)
            MaterialTheme(colorScheme = scheme) { Root(this) }
        }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); debugExtras(intent) }
    override fun onResume() { super.onResume(); Privacy.apply(this) }
    /** Bản debug: máy thử truyền máy chủ, phiên và mã duyệt qua intent (adb shell am start -e base … -e session … -e approve <id>). */
    private fun debugExtras(i: Intent?) {
        if (!BuildConfig.DEBUG || i == null) return
        i.getStringExtra("base")?.let { HostList.debugBase(it, BuildConfig.DEBUG) }?.let { Api.base = it }
        i.getStringExtra("session")?.let { Api.session = it }
        i.getStringExtra("secure")?.let { Privacy.set(this, it != "0") }
        i.getStringExtra("approve")?.let { Approvals.pendingOpen = it }
        i.getStringExtra("tour")?.let { DebugTour.tour = it }
        // CI mở lại hộp thử sau PIN; không đổi trạng thái khóa hay xác thực.
        if (DebugTour.tour == "1-khoa" && i.getStringExtra("lockSheet") == "open") lockSheetGeneration++
    }
}

// ---------- Đăng nhập ----------
object Auth {
    /** Welcome = đã có phiên lưu trên máy, chờ mở bằng vân tay / khuôn mặt. */
    enum class State { Checking, SignedOut, Welcome, SignedIn }
    var state by mutableStateOf(State.Checking)
    var me by mutableStateOf<J?>(null)
    /** Phiên đã lưu hết hạn → form mật khẩu kèm dòng nhắc. */
    var expired by mutableStateOf(false)
    /** Phiên đã lưu luôn cần xác thực trước khi khôi phục. */
    suspend fun start() {
        val result = AppLock.policy.start(Api.session != null, AppLock.canUse, emptyMap())
        AppLock.prefs.edit().also { edit -> result.removeKeys.forEach { edit.remove(it) } }.commit()
        state = if (result.screen == LockPolicy.Screen.Login) State.SignedOut else State.Welcome
    }
    suspend fun restore() {
        state = try { me = Api.me(); expired = false; State.SignedIn }
        catch (e: ApiError) { if (e.code == 401) { Api.session = null; expired = true }; State.SignedOut }
        catch (e: Exception) { if (Api.session != null) State.SignedIn.also { me = me } else State.SignedOut }
    }
    suspend fun signOut() { Api.logout(); me = null; MetricPrefs.clear(); TeamState.clear(); state = State.SignedOut }
    val role get() = me?.get("role")?.s ?: ""
    val isOwner get() = role == "owner"
    /** Cùng quy tắc với web. */
    fun canView(v: String): Boolean {
        if (v == "security" || v == "metrics") return true
        if (isOwner) return true
        if (v == "recruit") return role == "director"
        if (v in listOf("config", "audit", "cskh-kpi")) return false
        return me?.get("views")?.strings?.contains(v) == true
    }
}

/** Khóa ngay khi vào nền, từ chối kết quả xác thực của lượt cũ. */
object AppLock {
    val policy = LockPolicy()
    lateinit var prefs: android.content.SharedPreferences
        private set
    private val authenticators get() = (if (Build.VERSION.SDK_INT >= 30) BiometricManager.Authenticators.BIOMETRIC_STRONG else BiometricManager.Authenticators.BIOMETRIC_WEAK) or BiometricManager.Authenticators.DEVICE_CREDENTIAL
    var locked by mutableStateOf(false)
    var canUse = false; private set
    var authing by mutableStateOf(false)
    class PasswordRequest(val title: String, val ticket: Long, val done: (Boolean) -> Unit)
    var passwordRequest by mutableStateOf<PasswordRequest?>(null)
        private set
    private var prompt: BiometricPrompt? = null
    private var attempt = 0L
    private var waiting: kotlinx.coroutines.Job? = null
    fun init(ctx: android.content.Context) {
        prefs = ctx.getSharedPreferences("megatech", 0)
        canUse = BiometricManager.from(ctx).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS
    }
    fun expectExternal() { policy.expectExternal(SystemClock.elapsedRealtime()) }
    fun finishExternal() { onStart(); policy.finishExternal() }
    fun onStart() { if (policy.onStart(SystemClock.elapsedRealtime())) lockForBackground() }
    fun onStop(changingConfigurations: Boolean = false) {
        if (policy.onStop(SystemClock.elapsedRealtime(), changingConfigurations)) lockForBackground()
    }
    private fun lockForBackground() {
        policy.onBackground()
        if (Api.session != null) locked = true
        attempt++
        waiting?.cancel(); waiting = null
        prompt?.cancelAuthentication(); prompt = null
        passwordRequest = null; authing = false
    }
    fun available(act: FragmentActivity): Boolean {
        canUse = BiometricManager.from(act).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS
        return canUse
    }
    fun authenticate(act: FragmentActivity, title: String, subtitle: String, done: (Boolean) -> Unit) {
        if (authing) return
        if (!policy.canStartAuthentication(act.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED), act.supportFragmentManager.isStateSaved)) {
            if (waiting?.isActive == true) return
            DebugLog.authenticationState("xac-thuc-cho")
            waiting = act.lifecycleScope.launch {
                while (act.supportFragmentManager.isStateSaved) delay(100)
                act.lifecycle.withResumed {
                    waiting = null
                    authenticate(act, title, subtitle, done)
                }
            }
            return
        }
        authing = true
        val ticket = policy.beginAuthentication()
        val current = ++attempt
        DebugLog.authentication(ticket)
        if (!available(act)) { passwordRequest = PasswordRequest(title, ticket, done); return }
        val next = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
            private fun finish(success: Boolean) {
                if (current != attempt) return
                finishExternal()
                if (current != attempt) return
                authing = false; prompt = null
                done(policy.acceptsAuthentication(ticket, success))
            }
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { DebugLog.authenticationState("xac-thuc-dung"); finish(true) }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { DebugLog.authenticationState("xac-thuc-loi", errorCode); finish(false) }
        })
        prompt = next
        DebugLog.authenticationState("xac-thuc-mo")
        if (Build.VERSION.SDK_INT < 30) expectExternal()
        try { next.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(subtitle).setAllowedAuthenticators(authenticators).build()) }
        catch (e: RuntimeException) {
            if (current == attempt) {
                finishExternal()
                if (current == attempt) { authing = false; prompt = null; done(false) }
            }
        }
    }
    fun approve(act: FragmentActivity, id: String, number: Int?) { act.lifecycleScope.launch { Approvals.decide(id, number, true) } }
    fun finishPassword(request: PasswordRequest, success: Boolean) {
        if (passwordRequest !== request) return
        passwordRequest = null; authing = false
        request.done(policy.acceptsAuthentication(request.ticket, success))
    }
    fun unlock(act: FragmentActivity, done: (Boolean) -> Unit) = authenticate(act, "Mở khoá MEGATECH", "Xác thực để xem số liệu") { ok -> if (ok) locked = false; done(ok) }
}

/** Cho chụp màn hình (anh Vũ 06/11/2026: app chỉ cho sếp, cần chụp gửi đi). Màn chuyển app vẫn che số liệu.
 *  Bản debug: máy thử vẫn bật được chặn chụp qua intent "secure". */
object Privacy {
    private var secure = false
    fun init(act: FragmentActivity) { apply(act) }
    fun set(act: FragmentActivity, on: Boolean) { if (BuildConfig.DEBUG) secure = on; apply(act) }
    fun apply(act: FragmentActivity) {
        if (secure) act.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) else act.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        if (Build.VERSION.SDK_INT >= 33) act.setRecentsScreenshotEnabled(false)
    }
}
@Composable fun Root(act: MainActivity) {
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> when (e) {
            Lifecycle.Event.ON_STOP -> AppLock.onStop(act.isChangingConfigurations)
            Lifecycle.Event.ON_START -> AppLock.onStart()
            else -> Unit
        } }
        owner.lifecycle.addObserver(obs); onDispose { owner.lifecycle.removeObserver(obs) }
    }
    // Chỉ lần mở app đầu tiên (đổi giao diện sáng/tối, xoay máy tạo lại Activity nhưng giữ trạng thái đăng nhập).
    LaunchedEffect(Unit) { if (Auth.state == Auth.State.Checking) Auth.start() }
    LaunchedEffect(Auth.state) { if (Auth.state != Auth.State.SignedIn) TeamState.clear() }
    val signedIn = Auth.state == Auth.State.SignedIn
    // Duyệt đăng nhập máy tính: hỏi mỗi 5 giây khi app đang mở, đã đăng nhập và không khoá.
    LaunchedEffect(signedIn) {
        if (!signedIn) return@LaunchedEffect
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) { if (!AppLock.locked) Approvals.poll(); delay(5000) }
        }
    }
    // Cách tính chỉ số (dùng chung với web) — tải khi đăng nhập xong / mở app.
    LaunchedEffect(signedIn) { if (signedIn) MetricPrefs.load() }
    val pendingId = Approvals.pendingOpen
    LaunchedEffect(signedIn, pendingId) { if (signedIn && pendingId != null) { Approvals.open(pendingId); Approvals.pendingOpen = null } }
    val locked = AppLock.locked && signedIn
    Box(Modifier.fillMaxSize().background(C.cream)) {
        Box(Modifier.fillMaxSize().then(if (locked) Modifier.clearAndSetSemantics { } else Modifier)) {
            when (Auth.state) {
                Auth.State.Checking -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Thinking(listOf("Đang kiểm tra phiên đăng nhập…", "Đang kết nối máy chủ…", "Sắp xong…")) }
                Auth.State.SignedOut, Auth.State.Welcome -> LoginScreen(act)
                Auth.State.SignedIn -> RootTabs()
            }
            if (BuildConfig.DEBUG) {
                key(if (DebugTour.tour == "1-khoa") act.lockSheetGeneration else 0) { DebugTour.Content() }
            }
            if (BuildConfig.DEBUG && DebugTour.tour == "1-khoa" && signedIn) {
                LockPopupChecks()
            }
        }
        if (locked) LockScreen(act)
        if (signedIn && !locked && AppLock.passwordRequest == null) Approvals.current?.let { ApprovalSheet(act, it) }
        if (!locked && AppLock.passwordRequest == null) NoticeBanner()
        AppLock.passwordRequest?.let { PasswordAuthentication(it) }
    }
}

/** Chỉ lượt CI khóa: dùng đúng menu kỳ và hộp đổi mật khẩu của app. */
@Composable private fun LockPopupChecks() {
    var password by remember { mutableStateOf(false) }
    Column(Modifier.statusBarsPadding().padding(16.dp)) {
        PeriodMenu(Period.Today, prefix = "Kiểm kỳ: ") { }
        TextButton({ password = true }) { T("Kiểm đổi mật khẩu") }
    }
    if (password) PasswordDialog({ password = false }, { password = false })
}

@Composable fun LockScreen(act: FragmentActivity) {
    val scope = rememberCoroutineScope()
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { AppLock.unlock(act) { failed = !it } }
    Box(Modifier.fillMaxSize().semantics { isTraversalGroup = true }.background(C.cream).pointerInput(Unit) { detectTapGestures { } }.padding(horizontal = 24.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 440.dp).fillMaxWidth().shadow(18.dp, RoundedCornerShape(22.dp), ambientColor = Color(0x40113C30), spotColor = Color(0x40113C30)).clip(RoundedCornerShape(22.dp)).background(Color.White.copy(alpha = .95f)).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.Fingerprint, null, tint = C.brand, modifier = Modifier.size(44.dp))
            Spacer(Modifier.height(8.dp))
            T("App đang khóa", 18.sp, FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            T("Số liệu được che cho tới khi mở khóa.", 12.sp, color = C.inkSoft, align = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            Box(Modifier.thinkingBorder(AppLock.authing, RoundedCornerShape(12.dp))) { PrimaryButton(if (AppLock.canUse) "Mở bằng vân tay / khuôn mặt" else "Nhập mật khẩu MEGATECH", Icons.Filled.Fingerprint, C.brand) { AppLock.unlock(act) { failed = !it } } }
            if (failed) { Spacer(Modifier.height(6.dp)); T("Chưa xác thực được, thử lại.", 12.sp, color = C.bad) }
            TextButton({ scope.launch { Auth.signOut(); AppLock.locked = false } }) { T("Đăng xuất", 12.sp, color = C.bad) }
        }
    }
}

// ---------- Điều hướng ----------
sealed interface Screen {
    data class StaffOrders(val q: StaffOrderQuery) : Screen
    data class Orders(val q: OrderQuery) : Screen
    data class Order(val id: String) : Screen
    data class Customer(val posId: String, val phone: String) : Screen
    data class Overview(val pos: String? = null) : Screen
    data class Page(val id: String) : Screen
    data object Alerts : Screen
    data class Calls(val team: String) : Screen
    data class Compare(val team: String) : Screen
    data class Candidate(val id: String) : Screen
    /** Trang phòng ban mở từ tab Phòng ban: "sale", "cskh", "mkt". */
    data class Dept(val id: String, val page: String? = null) : Screen
}
class Navigator { val stack = mutableStateListOf<Screen>(); fun push(s: Screen) { stack.add(s) }; fun pop() { if (stack.isNotEmpty()) stack.removeAt(stack.lastIndex) } }
val LocalNav = staticCompositionLocalOf { Navigator() }

/** Lớp phủ đục chặn chạm xuống lớp dưới. */
private val Blocker = Modifier.fillMaxSize().background(C.cream).pointerInput(Unit) { detectTapGestures { } }

@Composable fun TabStack(root: @Composable () -> Unit) {
    val nav = remember { Navigator() }
    CompositionLocalProvider(LocalNav provides nav) {
        Box(Modifier.fillMaxSize()) {
            Box(Blocker) { root() }
            nav.stack.forEachIndexed { i, s -> key(i, s) { Box(Blocker.zIndex(i + 1f)) { ScreenView(s) } } }
        }
        BackHandler(nav.stack.isNotEmpty()) { nav.pop() }
    }
}

@Composable fun ScreenView(s: Screen) {
    when (s) {
        is Screen.StaffOrders -> StaffOrdersScreen(s.q)
        is Screen.Orders -> OrderListScreen(s.q)
        is Screen.Order -> OrderDetailScreen(s.id)
        is Screen.Customer -> CustomerScreen(s.posId, s.phone)
        is Screen.Overview -> OverviewScreen(s.pos)
        is Screen.Page -> PageScreen(s.id)
        Screen.Alerts -> AlertsScreen()
        is Screen.Calls -> SubPage(if (s.team == "sale") "Cuộc gọi & đơn chốt Sale" else "Cuộc gọi CSKH") { CallsContent(s.team) }
        is Screen.Compare -> SubPage("So sánh nhân viên") { CompareContent(s.team) }
        is Screen.Candidate -> CandidateScreen(s.id)
        is Screen.Dept -> CompositionLocalProvider(LocalBackTitle provides DEPT_TITLES[s.id]) { when (s.id) { "sale" -> SaleTab(s.page); "cskh" -> CskhTab(s.page); else -> MktTab() } }
    }
}

data class Tab(val title: String, val icon: ImageVector)
// Android 1.0: 5 tab như iPhone 1.0.
private val TABS = listOf(Tab("Trang chủ", Icons.Filled.Home), Tab("Đơn hàng", Icons.Filled.Inventory2), Tab("Tổng quan", Icons.Filled.BarChart), Tab("Phòng ban", Icons.Filled.Apartment), Tab("Thêm", Icons.Filled.MoreHoriz))
val DEPT_TITLES = mapOf("sale" to "Sale", "cskh" to "CSKH", "mkt" to "Marketing")
/** Tiêu đề trang khi một tab cũ (Sale, CSKH, MKT) được mở như trang con: có nút quay lại. */
val LocalBackTitle = staticCompositionLocalOf<String?> { null }
/** Trang con đặt làm gốc của một tab (Đơn hàng, Tổng quan): không có nút quay lại. */
val LocalNoBack = staticCompositionLocalOf { false }

@Composable fun OrdersTab() {
    val today = Period.Today.range
    CompositionLocalProvider(LocalNoBack provides true) { OrderListScreen(OrderQuery(today.first, today.second, title = "Đơn hàng"), filterable = true) }
}


/** Tab Phòng ban (khung 07 Gemini): mỗi phòng một thẻ, nút tới từng trang con. */
@Composable fun DeptsTab() {
    val nav = LocalNav.current
    Column(Modifier.fillMaxSize().background(C.cream)) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp).padding(top = 12.dp, bottom = 4.dp)) { T("Phòng ban", 26.sp, FontWeight.Bold, C.ink) }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DeptCard("Sale", "Sale", { nav.push(Screen.Dept("sale")) }, SALE_TABS.filter { Auth.canView(it.id) }.map { t -> t.title to { nav.push(Screen.Dept("sale", t.id)) } })
            DeptCard("CSKH", "Tổng quan CSKH", { nav.push(Screen.Dept("cskh")) }, CSKH_TABS.filter { Auth.canView(it.id) }.map { t -> t.title to { nav.push(Screen.Dept("cskh", t.id)) } })
            DeptCard("Marketing", "Phân tích", { nav.push(Screen.Dept("mkt")) }, emptyList())
        }
    }
}

@Composable fun DeptCard(title: String, link: String, open: () -> Unit, items: List<Pair<String, () -> Unit>>) {
    Panel {
        Row(Modifier.fillMaxWidth().clickable { open() }, verticalAlignment = Alignment.CenterVertically) {
            T(title, 17.sp, FontWeight.Bold, C.ink, modifier = Modifier.weight(1f))
            T(link, 13.sp, FontWeight.SemiBold, C.brand); Icon(Icons.Filled.ChevronRight, null, Modifier.size(16.dp), tint = C.brand)
        }
        items.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { (label, go) ->
                    Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(C.cell).border(1.dp, C.line, RoundedCornerShape(12.dp)).clickable { go() }.padding(vertical = 12.dp, horizontal = 8.dp),
                        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        T(label, 13.sp, FontWeight.SemiBold, C.ink, 1); Icon(Icons.Filled.ChevronRight, null, Modifier.size(14.dp), tint = C.ink)
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable fun RootTabs() {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val visited = remember { mutableStateListOf(0) }
    fun select(i: Int) { tab = i; if (i !in visited) visited.add(i) }
    // Lượt chụp giao diện (chỉ bản debug, CI web ảo): lần lượt mở từng tab, mỗi tab ghi một mốc để CI chụp ảnh.
    if (BuildConfig.DEBUG && DebugTour.tour == "giaodien") LaunchedEffect(Unit) {
        suspend fun go(target: String, moc: String, wait: Long = 3_000) { DebugTour.target = target; DebugTour.tick++; kotlinx.coroutines.delay(wait); DebugLog.ui(moc); kotlinx.coroutines.delay(4_000) }
        TABS.indices.forEach { i ->
            select(i); kotlinx.coroutines.delay(12_000); DebugLog.ui("tab-$i"); kotlinx.coroutines.delay(4_000)
            // Hôm nay: cuộn tới khối MKT / Cần xử lý, rồi mở trang Thông báo (bước A2).
            if (i == 0) {
                go("cuon:hom-nay-2", "hom-nay-2"); go("cuon:hom-nay-3", "hom-nay-3")
                go("thong-bao", "thong-bao-1", 8_000); go("cuon:thong-bao-2", "thong-bao-2")
                DebugTour.target = "ve"; DebugTour.tick++; kotlinx.coroutines.delay(1_500)
            }
            // Tổng quan: Bốn bộ phận (cuộn), Số liệu & KH, Theo POS, bảng lọc, một POS (bước A3).
            if (i == 2) {
                go("cuon:bo-phan-2", "bo-phan-2")
                go("seg:metrics", "so-lieu-1", 10_000); go("cuon:so-lieu-2", "so-lieu-2")
                go("seg:pos", "theo-pos", 6_000)
                go("loc-mo", "bo-loc")
                DebugTour.target = "loc-dong"; DebugTour.tick++; kotlinx.coroutines.delay(1_500)
                DebugTour.target = "seg:departments"; DebugTour.tick++; kotlinx.coroutines.delay(500)
                go("pos:thuy-san", "mot-pos", 10_000)
                DebugTour.target = "pos:"; DebugTour.tick++; kotlinx.coroutines.delay(1_500)
            }
        }
        DebugLog.ui("xong")
    }
    // Màn trong máy gập / máy rộng: thanh tab dọc bên trái, nhường chiều cao cho số liệu; màn ngoài giữ thanh dưới.
    val wide = isWide()
    // Gập / mở máy không làm mất trang con đang mở ở từng tab.
    val pages = remember { movableContentOf<Modifier> { mod ->
        Box(mod) {
            visited.forEach { i ->
                key(i) {
                    Box(Modifier.fillMaxSize().zIndex(if (tab == i) 1f else 0f).then(if (tab == i) Modifier else Modifier.background(C.cream))) {
                        TabStack {
                            if (BuildConfig.DEBUG && DebugTour.tour == "xnkho") {
                                DebugTour.Warehouse()
                            } else if (BuildConfig.DEBUG && DebugTour.tour == "team") {
                                DebugTour.Team()
                            } else
                            when (i) { 0 -> TodayTab(); 1 -> OrdersTab(); 2 -> OverviewTab(); 3 -> DeptsTab(); else -> MoreTab() }
                        }
                    }
                }
            }
        }
    } }
    if (wide) {
        Row(Modifier.fillMaxSize().background(C.cream)) {
            NavigationRail(containerColor = C.card, header = { Spacer(Modifier.height(8.dp)) }) {
                Spacer(Modifier.weight(1f))
                TABS.forEachIndexed { i, t ->
                    NavigationRailItem(selected = tab == i, onClick = { select(i) }, icon = { Icon(t.icon, null) }, label = { T(t.title, 11.sp, FontWeight.SemiBold, if (tab == i) C.brand else C.inkSoft) },
                        colors = NavigationRailItemDefaults.colors(selectedIconColor = C.brand, indicatorColor = C.brandSoft, unselectedIconColor = C.inkSoft))
                    Spacer(Modifier.height(6.dp))
                }
                Spacer(Modifier.weight(1f))
            }
            pages(Modifier.weight(1f).fillMaxHeight().windowInsetsPadding(WindowInsets.navigationBars.only(WindowInsetsSides.Bottom + WindowInsetsSides.End)))
        }
        return
    }
    Scaffold(containerColor = C.cream, contentWindowInsets = WindowInsets(0), bottomBar = {
        NavigationBar(containerColor = C.card, tonalElevation = 0.dp, modifier = Modifier.drawBehind { drawLine(C.line, androidx.compose.ui.geometry.Offset(0f, 0f), androidx.compose.ui.geometry.Offset(size.width, 0f), 1.dp.toPx()) }) {
            TABS.forEachIndexed { i, t ->
                NavigationBarItem(selected = tab == i, onClick = { select(i) }, icon = { Icon(t.icon, null) }, label = { T(t.title, 11.sp, FontWeight.SemiBold, if (tab == i) C.brand else C.inkSoft) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = C.brand, indicatorColor = Color.Transparent, unselectedIconColor = C.inkSoft))
            }
        }
    }) { pad -> pages(Modifier.fillMaxSize().padding(pad)) }
}

// ---------- Tải dữ liệu ----------
class Loader<V> { var data by mutableStateOf<V?>(null); var error by mutableStateOf<String?>(null); var loading by mutableStateOf(false); var tick by mutableIntStateOf(0); fun reload() { tick++ } }

internal fun loadErrorText(error: Throwable): String? = when (error) {
    is kotlinx.coroutines.CancellationException -> null
    is ApiError -> when (error.code) {
        401 -> "Phiên đã hết, đăng nhập lại"
        403 -> "Tài khoản chưa được xem phần này"
        429 -> "Thao tác quá nhanh, thử lại sau ít giây"
        in 500..599 -> "Máy chủ chậm, thử lại sau ít giây"
        else -> "Không tải được"
    }
    is java.net.SocketTimeoutException -> "Máy chủ chậm, thử lại sau ít giây"
    is java.net.UnknownHostException, is java.net.ConnectException, is java.net.NoRouteToHostException ->
        "Mất mạng, kiểm tra kết nối"
    else -> "Không tải được"
}

@Composable fun <V> load(vararg keys: Any?, block: suspend () -> V): Loader<V> {
    val l = remember { Loader<V>() }
    // Khoá thêm "Cách tính": đổi cách tính là mọi màn báo cáo tải lại.
    LaunchedEffect(*keys, MetricPrefs.query, l.tick) {
        l.loading = true
        try { l.data = block(); l.error = null }
        catch (e: ApiError) { l.error = loadErrorText(e); if (e.code == 401) Auth.state = Auth.State.SignedOut }
        catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) { l.error = loadErrorText(e) }
        finally { l.loading = false }
    }
    return l
}

/** Trang gốc của tab: thanh đầu xanh + nội dung cuộn trên nền kem, kéo xuống để làm mới. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun TabPage(tagline: String = "Bán hàng tốt hơn mỗi ngày", refreshing: Boolean = false, onRefresh: () -> Unit = {}, header: (@Composable () -> Unit)? = null, scrollState: androidx.compose.foundation.ScrollState? = null, content: @Composable ColumnScope.() -> Unit) {
    val back = LocalBackTitle.current
    val st = scrollState ?: rememberScrollState()
    Column(Modifier.fillMaxSize().background(C.cream)) {
        if (back != null) BackBar(back) else if (header != null) header() else AppHeader(tagline)
        PullToRefreshBox(refreshing, onRefresh, Modifier.fillMaxSize()) {
            CompositionLocalProvider(LocalRefreshing provides refreshing) {
                Column(Modifier.fillMaxSize().verticalScroll(st).padding(16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
            }
        }
    }
}

/** Thanh đầu trang con kiểu Gemini: nền trang, nút quay lại, tiêu đề đậm. */
@Composable fun BackBar(title: String, actions: (@Composable RowScope.() -> Unit)? = null) {
    val nav = LocalNav.current
    Row(Modifier.fillMaxWidth().background(C.cream).statusBarsPadding().padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton({ nav.pop() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = C.ink) }
        T(title, 20.sp, FontWeight.Bold, C.ink, 1, Modifier.weight(1f))
        if (actions != null) Row(verticalAlignment = Alignment.CenterVertically, content = actions)
    }
}

/** Trang con: thanh đầu có nút quay lại. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun SubPage(title: String, refreshing: Boolean = false, onRefresh: () -> Unit = {}, actions: (@Composable RowScope.() -> Unit)? = null, scroll: Boolean = true, scrollState: androidx.compose.foundation.ScrollState? = null, content: @Composable ColumnScope.() -> Unit) {
    val nav = LocalNav.current
    val st = scrollState ?: rememberScrollState()
    Column(Modifier.fillMaxSize().background(C.cream)) {
        if (LocalNoBack.current) Row(Modifier.fillMaxWidth().background(C.cream).statusBarsPadding().padding(horizontal = 16.dp).padding(top = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            T(title, 26.sp, FontWeight.Bold, C.ink, 1, Modifier.weight(1f))
            if (actions != null) Row(verticalAlignment = Alignment.CenterVertically, content = actions)
        } else BackBar(title, actions)
        PullToRefreshBox(refreshing, onRefresh, Modifier.fillMaxSize()) {
            CompositionLocalProvider(LocalRefreshing provides refreshing) {
                Column(Modifier.fillMaxSize().then(if (scroll) Modifier.verticalScroll(st) else Modifier).padding(16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
            }
        }
    }
}
