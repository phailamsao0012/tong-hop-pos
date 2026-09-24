package vn.megatech.tonghoppos

import android.os.Bundle
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
        // Bản debug: máy thử truyền máy chủ và phiên qua intent (adb shell am start -e base … -e session …).
        if (BuildConfig.DEBUG) {
            intent.getStringExtra("base")?.let { Api.base = it }
            intent.getStringExtra("session")?.let { Api.session = it }
        }
        AppLock.init(this)
        setContent { MaterialTheme(colorScheme = lightColorScheme(primary = C.brand, secondary = C.brandDeep, surface = C.card, background = C.cream)) { Root(this) } }
    }
}

// ---------- Đăng nhập ----------
object Auth {
    enum class State { Checking, SignedOut, SignedIn }
    var state by mutableStateOf(State.Checking)
    var me by mutableStateOf<J?>(null)
    suspend fun restore() { state = try { me = Api.me(); State.SignedIn } catch (e: ApiError) { if (e.code == 401) Api.session = null; State.SignedOut } catch (e: Exception) { if (Api.session != null) State.SignedIn.also { me = me } else State.SignedOut } }
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

/** Khoá app bằng vân tay / khuôn mặt, khoá lại sau khi rời app quá số giây đã chọn. */
object AppLock {
    private lateinit var prefs: android.content.SharedPreferences
    var enabled by mutableStateOf(false)
    var graceSeconds by mutableIntStateOf(30)
    var locked by mutableStateOf(false)
    private var leftAt = 0L
    fun init(ctx: android.content.Context) {
        prefs = ctx.getSharedPreferences("megatech", 0); enabled = prefs.getBoolean("lock", false); graceSeconds = prefs.getInt("lock_grace", 30); locked = enabled
    }
    fun set(on: Boolean) { enabled = on; prefs.edit().putBoolean("lock", on).apply() }
    fun setGrace(s: Int) { graceSeconds = s; prefs.edit().putInt("lock_grace", s).apply() }
    fun onStop() { leftAt = System.currentTimeMillis() }
    fun onStart() { if (enabled && leftAt > 0 && System.currentTimeMillis() - leftAt >= graceSeconds * 1000L) locked = true }
    fun available(act: FragmentActivity) = BiometricManager.from(act).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS
    fun unlock(act: FragmentActivity, done: (Boolean) -> Unit) {
        val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { locked = false; done(true) }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { done(false) }
        })
        prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle("Mở khoá MEGATECH").setSubtitle("Xác thực để xem số liệu")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL).build())
    }
}

@Composable fun Root(act: FragmentActivity) {
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) AppLock.onStop(); if (e == Lifecycle.Event.ON_START) AppLock.onStart() }
        owner.lifecycle.addObserver(obs); onDispose { owner.lifecycle.removeObserver(obs) }
    }
    LaunchedEffect(Unit) { Auth.restore() }
    Box(Modifier.fillMaxSize().background(C.cream)) {
        when (Auth.state) {
            Auth.State.Checking -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.brand) }
            Auth.State.SignedOut -> LoginScreen()
            Auth.State.SignedIn -> RootTabs()
        }
        if (AppLock.locked && Auth.state == Auth.State.SignedIn) LockScreen(act)
    }
}

@Composable fun LockScreen(act: FragmentActivity) {
    val scope = rememberCoroutineScope()
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { AppLock.unlock(act) { failed = !it } }
    Column(Modifier.fillMaxSize().background(C.cream).pointerInput(Unit) { detectTapGestures { } }.padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Filled.Shield, null, tint = C.brand, modifier = Modifier.size(60.dp)); Spacer(Modifier.height(16.dp))
        T("MEGATECH đang khoá", 20.sp, FontWeight.Bold); T("Xác thực bằng vân tay hoặc khuôn mặt để xem số liệu.", 13.sp, color = C.inkSoft)
        Spacer(Modifier.height(20.dp))
        Box(Modifier.width(220.dp)) { PrimaryButton("Mở khoá", Icons.Filled.Fingerprint) { AppLock.unlock(act) { failed = !it } } }
        if (failed) T("Chưa xác thực được, thử lại.", 12.sp, color = C.bad)
        Spacer(Modifier.height(12.dp)); TextButton({ scope.launch { Auth.signOut(); AppLock.locked = false } }) { T("Đăng xuất", 12.sp, color = C.bad) }
    }
}

@Composable fun LoginScreen() {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var challenge by remember { mutableStateOf<J?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun submit() = scope.launch {
        busy = true; error = null
        try {
            val step = challenge?.let { Api.send("/api/auth/verify", "POST", mapOf("challengeId" to it["challengeId"].s, "code" to code, "kind" to if (it["step"].s == "totp") "totp" else "otp")) }
                ?: Api.send("/api/auth/login", "POST", mapOf("email" to email.trim(), "password" to password))
            if (step["step"].s == "done") Auth.restore() else { challenge = step; code = "" }
        } catch (e: Exception) { error = e.message ?: "Không kết nối được máy chủ." } finally { busy = false }
    }
    Column(Modifier.fillMaxSize().background(C.cream).statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Row(Modifier.padding(top = 40.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(60.dp).clip(RoundedCornerShape(16.dp)).background(C.brandDeep), contentAlignment = Alignment.Center) { T("M", 34.sp, FontWeight.Black, C.lime) }
            Spacer(Modifier.width(14.dp)); Column { T("MEGATECH", 22.sp, FontWeight.Bold); T("Tổng hợp POS · CSKH & Sale", 13.sp, color = C.inkSoft) }
        }
        val fieldColors = OutlinedTextFieldDefaults.colors(focusedBorderColor = C.brand, unfocusedContainerColor = C.card, focusedContainerColor = C.card)
        if (challenge != null) {
            T(if (challenge!!["step"].s == "totp") "Nhập mã 6 số trong ứng dụng xác thực." else "Nhập mã 6 số đã gửi tới ${challenge!!["to"].sn ?: "email"}.", 13.sp, color = C.inkSoft)
            OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) }, Modifier.fillMaxWidth(), label = { Text("Mã xác minh") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), colors = fieldColors, shape = RoundedCornerShape(12.dp))
        } else {
            OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Email") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), colors = fieldColors, shape = RoundedCornerShape(12.dp))
            OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Mật khẩu") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), colors = fieldColors, shape = RoundedCornerShape(12.dp))
        }
        ErrorLine(error)
        val ok = !busy && (if (challenge == null) email.isNotBlank() && password.isNotEmpty() else code.length == 6)
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (ok) C.brand else C.gray).clickable(enabled = ok) { submit() }.padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp) else T(if (challenge == null) "Đăng nhập" else "Xác minh", 15.sp, FontWeight.Bold, Color.White)
        }
        if (challenge != null) TextButton({ challenge = null; code = "" }) { T("Đăng nhập lại", 13.sp, color = C.brand) }
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
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
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
            Column(Modifier.fillMaxSize().then(if (scroll) Modifier.verticalScroll(rememberScrollState()) else Modifier).padding(16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
        }
    }
}
