package vn.megatech.tonghoppos

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
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
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), navigationBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT))
        Api.init(this)
        AppLock.init(this)
        Privacy.init(this)
        debugExtras(intent)
        setContent { MaterialTheme(colorScheme = lightColorScheme(primary = C.brand, secondary = C.brandDeep, surface = C.card, background = C.cream)) { Root(this) } }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); debugExtras(intent) }
    override fun onResume() { super.onResume(); Privacy.apply(this) }
    /** Bản debug: máy thử truyền máy chủ, phiên và mã duyệt qua intent (adb shell am start -e base … -e session … -e approve <id>). */
    private fun debugExtras(i: Intent?) {
        if (!BuildConfig.DEBUG || i == null) return
        i.getStringExtra("base")?.let { Api.base = it }
        i.getStringExtra("session")?.let { Api.session = it }
        i.getStringExtra("secure")?.let { Privacy.set(this, it != "0") }
        i.getStringExtra("approve")?.let { Approvals.pendingOpen = it }
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
    /** Lúc mở app: có phiên lưu và khoá bằng sinh trắc học đang bật → màn "Chào mừng trở lại"; không thì kiểm tra phiên luôn. */
    suspend fun start() {
        state = when {
            Api.session == null -> State.SignedOut
            AppLock.enabled && AppLock.canUse -> State.Welcome
            else -> { restore(); return }
        }
    }
    suspend fun restore() {
        state = try { me = Api.me(); expired = false; State.SignedIn }
        catch (e: ApiError) { if (e.code == 401) { Api.session = null; expired = true }; State.SignedOut }
        catch (e: Exception) { if (Api.session != null) State.SignedIn.also { me = me } else State.SignedOut }
    }
    suspend fun signOut() { Api.logout(); me = null; state = State.SignedOut }
    val role get() = me?.get("role")?.s ?: ""
    val isOwner get() = role == "owner"
    /** Cùng quy tắc với web. */
    fun canView(v: String): Boolean {
        if (v == "security") return true
        if (isOwner) return true
        if (v == "recruit") return role == "director"
        if (v in listOf("config", "audit", "cskh-kpi")) return false
        return me?.get("views")?.strings?.contains(v) == true
    }
}

/** Khoá app bằng vân tay / khuôn mặt / mã máy, khoá lại sau khi rời app quá số giây đã chọn (mặc định 2 phút). */
object AppLock {
    private lateinit var prefs: android.content.SharedPreferences
    private const val AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
    var enabled by mutableStateOf(false)
    var graceSeconds by mutableIntStateOf(120)
    var locked by mutableStateOf(false)
    /** Máy có vân tay / khuôn mặt / mã khoá màn hình để xác thực. */
    var canUse = false; private set
    private var leftAt = 0L
    fun init(ctx: android.content.Context) {
        canUse = BiometricManager.from(ctx).canAuthenticate(AUTH) == BiometricManager.BIOMETRIC_SUCCESS
        prefs = ctx.getSharedPreferences("megatech", 0); enabled = prefs.getBoolean("lock", canUse); graceSeconds = prefs.getInt("lock_grace", 120); locked = false
    }
    fun set(on: Boolean) { enabled = on; prefs.edit().putBoolean("lock", on).apply() }
    fun setGrace(s: Int) { graceSeconds = s; prefs.edit().putInt("lock_grace", s).apply() }
    fun onStop() { leftAt = System.currentTimeMillis() }
    fun onStart() { if (enabled && canUse && Auth.state == Auth.State.SignedIn && leftAt > 0 && System.currentTimeMillis() - leftAt >= graceSeconds * 1000L) locked = true }
    fun available(act: FragmentActivity) = BiometricManager.from(act).canAuthenticate(AUTH) == BiometricManager.BIOMETRIC_SUCCESS
    /** Hỏi vân tay / khuôn mặt / mã máy. */
    /** Đang hiện hộp xác thực (nút mở khoá vẽ viền chạy). */
    var authing by mutableStateOf(false)
    fun authenticate(act: FragmentActivity, title: String, subtitle: String, done: (Boolean) -> Unit) {
        authing = true
        val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { authing = false; done(true) }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { authing = false; done(false) }
        })
        prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(subtitle).setAllowedAuthenticators(AUTH).build())
    }
    fun unlock(act: FragmentActivity, done: (Boolean) -> Unit) = authenticate(act, "Mở khoá MEGATECH", "Xác thực để xem số liệu") { ok -> if (ok) locked = false; done(ok) }
}

/** Chặn chụp màn hình và che nội dung trong màn đa nhiệm (FLAG_SECURE), mặc định bật. */
object Privacy {
    var secure by mutableStateOf(true)
    fun init(act: FragmentActivity) { secure = act.getSharedPreferences("megatech", 0).getBoolean("secure", true); apply(act) }
    fun set(act: FragmentActivity, on: Boolean) { secure = on; act.getSharedPreferences("megatech", 0).edit().putBoolean("secure", on).apply(); apply(act) }
    fun apply(act: FragmentActivity) { if (secure) act.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) else act.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
}

@Composable fun Root(act: FragmentActivity) {
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) AppLock.onStop(); if (e == Lifecycle.Event.ON_START) AppLock.onStart() }
        owner.lifecycle.addObserver(obs); onDispose { owner.lifecycle.removeObserver(obs) }
    }
    // Chỉ lần mở app đầu tiên (đổi giao diện sáng/tối, xoay máy tạo lại Activity nhưng giữ trạng thái đăng nhập).
    LaunchedEffect(Unit) { if (Auth.state == Auth.State.Checking) Auth.start() }
    val signedIn = Auth.state == Auth.State.SignedIn
    // Duyệt đăng nhập máy tính: hỏi mỗi 5 giây khi app đang mở, đã đăng nhập và không khoá.
    LaunchedEffect(signedIn) {
        if (!signedIn) return@LaunchedEffect
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) { if (!AppLock.locked) Approvals.poll(); delay(5000) }
        }
    }
    val pendingId = Approvals.pendingOpen
    LaunchedEffect(signedIn, pendingId) { if (signedIn && pendingId != null) { Approvals.open(pendingId); Approvals.pendingOpen = null } }
    val locked = AppLock.locked && signedIn
    Box(Modifier.fillMaxSize().background(C.cream)) {
        Box(Modifier.fillMaxSize().then(if (locked && Build.VERSION.SDK_INT >= 31) Modifier.blur(22.dp) else Modifier)) {
            when (Auth.state) {
                Auth.State.Checking -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Thinking(listOf("Đang kiểm tra phiên đăng nhập…", "Đang kết nối máy chủ…", "Sắp xong…")) }
                Auth.State.SignedOut, Auth.State.Welcome -> LoginScreen(act)
                Auth.State.SignedIn -> RootTabs()
            }
        }
        if (locked) LockScreen(act)
        if (signedIn && !locked) Approvals.current?.let { ApprovalSheet(act, it) }
        NoticeBanner()
    }
}

@Composable fun LockScreen(act: FragmentActivity) {
    val scope = rememberCoroutineScope()
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { AppLock.unlock(act) { failed = !it } }
    val grace = when (AppLock.graceSeconds) { 1 -> "Vừa rời app"; 30 -> "Rời app quá 30 giây"; 120 -> "Rời app quá 2 phút"; 300 -> "Rời app quá 5 phút"; else -> "Rời app quá 30 phút" }
    Box(Modifier.fillMaxSize().background(if (Build.VERSION.SDK_INT >= 31) C.cream.copy(alpha = .55f) else C.cream).pointerInput(Unit) { detectTapGestures { } }.padding(horizontal = 24.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.fillMaxWidth().shadow(18.dp, RoundedCornerShape(22.dp), ambientColor = Color(0x40113C30), spotColor = Color(0x40113C30)).clip(RoundedCornerShape(22.dp)).background(Color.White.copy(alpha = .95f)).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.Fingerprint, null, tint = C.brand, modifier = Modifier.size(44.dp))
            Spacer(Modifier.height(8.dp))
            T("App đang khóa", 18.sp, FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            T("$grace. Số liệu được che cho tới khi mở khóa.", 12.sp, color = C.inkSoft, align = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            Box(Modifier.thinkingBorder(AppLock.authing, RoundedCornerShape(12.dp))) { PrimaryButton("Mở bằng vân tay / khuôn mặt", Icons.Filled.Fingerprint, C.brand) { AppLock.unlock(act) { failed = !it } } }
            if (failed) { Spacer(Modifier.height(6.dp)); T("Chưa xác thực được, thử lại.", 12.sp, color = C.bad) }
            TextButton({ scope.launch { Auth.signOut(); AppLock.locked = false } }) { T("Đăng xuất", 12.sp, color = C.bad) }
        }
    }
}

// ---------- Điều hướng ----------
sealed interface Screen {
    data class Orders(val q: OrderQuery) : Screen
    data class Order(val id: String) : Screen
    data class Customer(val posId: String, val phone: String) : Screen
    data class Overview(val pos: String? = null) : Screen
    data class Page(val id: String) : Screen
    data object Alerts : Screen
    data class Calls(val team: String) : Screen
    data class Compare(val team: String) : Screen
    data class Candidate(val id: String) : Screen
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
        is Screen.Orders -> OrderListScreen(s.q)
        is Screen.Order -> OrderDetailScreen(s.id)
        is Screen.Customer -> CustomerScreen(s.posId, s.phone)
        is Screen.Overview -> OverviewScreen(s.pos)
        is Screen.Page -> PageScreen(s.id)
        Screen.Alerts -> AlertsScreen()
        is Screen.Calls -> SubPage(if (s.team == "sale") "Cuộc gọi & đơn chốt Sale" else "Cuộc gọi CSKH") { CallsContent(s.team) }
        is Screen.Compare -> SubPage("So sánh nhân viên") { CompareContent(s.team) }
        is Screen.Candidate -> CandidateScreen(s.id)
    }
}

data class Tab(val title: String, val icon: ImageVector)
private val TABS = listOf(Tab("Trang chủ", Icons.Filled.Home), Tab("CSKH", Icons.Filled.SupportAgent), Tab("Sale", Icons.Filled.ShoppingCart), Tab("MKT", Icons.Filled.Campaign), Tab("Thêm", Icons.Filled.MoreHoriz))

@Composable fun RootTabs() {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val visited = remember { mutableStateListOf(0) }
    Scaffold(containerColor = C.cream, contentWindowInsets = WindowInsets(0), bottomBar = {
        NavigationBar(containerColor = C.card, tonalElevation = 0.dp, modifier = Modifier.clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))) {
            TABS.forEachIndexed { i, t ->
                NavigationBarItem(selected = tab == i, onClick = { tab = i; if (i !in visited) visited.add(i) }, icon = { Icon(t.icon, null) }, label = { T(t.title, 11.sp, FontWeight.SemiBold, if (tab == i) C.brand else C.ink) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = C.brand, indicatorColor = C.brandSoft, unselectedIconColor = C.ink))
            }
        }
    }) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            visited.forEach { i ->
                key(i) {
                    Box(Modifier.fillMaxSize().zIndex(if (tab == i) 1f else 0f).then(if (tab == i) Modifier else Modifier.background(C.cream))) {
                        TabStack {
                            when (i) { 0 -> HomeTab(); 1 -> CskhTab(); 2 -> SaleTab(); 3 -> MktTab(); else -> MoreTab() }
                        }
                    }
                }
            }
        }
    }
}

// ---------- Tải dữ liệu ----------
class Loader<V> { var data by mutableStateOf<V?>(null); var error by mutableStateOf<String?>(null); var loading by mutableStateOf(false); var tick by mutableIntStateOf(0); fun reload() { tick++ } }

@Composable fun <V> load(vararg keys: Any?, block: suspend () -> V): Loader<V> {
    val l = remember { Loader<V>() }
    LaunchedEffect(*keys, l.tick) {
        l.loading = true
        try { l.data = block(); l.error = null }
        catch (e: ApiError) { l.error = e.message; if (e.code == 401) Auth.state = Auth.State.SignedOut }
        catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) { l.error = "Không kết nối được máy chủ." }
        finally { l.loading = false }
    }
    return l
}

/** Trang gốc của tab: thanh đầu xanh + nội dung cuộn trên nền kem, kéo xuống để làm mới. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun TabPage(tagline: String = "Bán hàng tốt hơn mỗi ngày", refreshing: Boolean = false, onRefresh: () -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().background(C.cream)) {
        AppHeader(tagline)
        PullToRefreshBox(refreshing, onRefresh, Modifier.fillMaxSize()) {
            CompositionLocalProvider(LocalRefreshing provides refreshing) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
            }
        }
    }
}

/** Trang con: thanh xanh đậm có nút quay lại. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun SubPage(title: String, refreshing: Boolean = false, onRefresh: () -> Unit = {}, actions: (@Composable RowScope.() -> Unit)? = null, scroll: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    val nav = LocalNav.current
    Column(Modifier.fillMaxSize().background(C.cream)) {
        Row(Modifier.fillMaxWidth().background(C.brandDeep).statusBarsPadding().padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton({ nav.pop() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = Color.White) }
            T(title, 17.sp, FontWeight.Bold, Color.White, 1, Modifier.weight(1f))
            if (actions != null) Row(verticalAlignment = Alignment.CenterVertically, content = actions)
        }
        PullToRefreshBox(refreshing, onRefresh, Modifier.fillMaxSize()) {
            CompositionLocalProvider(LocalRefreshing provides refreshing) {
                Column(Modifier.fillMaxSize().then(if (scroll) Modifier.verticalScroll(rememberScrollState()) else Modifier).padding(16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
            }
        }
    }
}
