package vn.megatech.tonghoppos

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

object DebugTour {
    var tour by mutableStateOf("")
    var target by mutableStateOf("")
    var tick by mutableIntStateOf(0)
    var period by mutableStateOf<Period>(Period.Last)
    var tableReady = false
    var ordersReady = false
    var compareReady = false
    var chartReady = false
    fun log(message: String) {
        if (BuildConfig.DEBUG && Api.base == "https://demo.tonghopposmegatech.io.vn") DebugLog.authenticationState(message)
    }
    private fun tap(value: String) { if (BuildConfig.DEBUG) { target = value; tick++ } }

    @Composable fun Warehouse() {
        if (!BuildConfig.DEBUG || tour != "xnkho" || Api.base != "https://demo.tonghopposmegatech.io.vn") return
        val nav = LocalNav.current
        val compareCase = (androidx.compose.ui.platform.LocalContext.current as? android.app.Activity)?.intent?.getStringExtra("compareCase")
        var team by remember { mutableStateOf("sale") }
        var largeText by remember { mutableStateOf(false) }
        var generation by remember { mutableIntStateOf(0) }
        LaunchedEffect(Unit) {
            while (AppLock.locked) delay(250)
            nav.stack.clear()
            period = Period.Last
            suspend fun waitFor(ready: () -> Boolean): Boolean {
                repeat(240) { if (ready()) return true; delay(250) }
                log("[XNK] moc=loi-tai"); return false
            }
            suspend fun stage(action: String, mark: String) {
                if (action == "xnk-ds" || action == "xnk-chot") ordersReady = false
                tap(action)
                if ((action == "xnk-ds" || action == "xnk-chot") && !waitFor { ordersReady }) return
                delay(2000); log("[XNK] moc=$mark"); delay(2000)
            }
            if (compareCase != null) {
                if (!waitFor { tableReady && compareReady }) return@LaunchedEffect
                suspend fun compareStage(action: String, mark: String) {
                    compareReady = false
                    tap(action)
                    delay(500)
                    if (!waitFor { compareReady }) throw kotlinx.coroutines.CancellationException("So cùng kỳ chưa sẵn sàng")
                    tap("xnk-controls"); delay(1500)
                    log("[XNK] moc=$mark"); delay(1500)
                    if (compareCase == "full") {
                        for (point in listOf("first", "middle", "last")) {
                            chartReady = false
                            tap("xnk-chart-$point"); delay(750)
                            if (!waitFor { chartReady }) return
                        }
                        log("[XNK] moc=$mark-chart"); delay(1000)
                        tap("xnk-chart-clear")
                    }
                    tap("xnk-mini"); delay(1500)
                    log("[XNK] moc=$mark-mini"); delay(1000)
                }
                when (compareCase) {
                    "focus" -> {
                        suspend fun focusStage(action: String, mark: String, chart: Boolean = false) {
                            compareReady = false
                            tap(action); delay(500)
                            if (!waitFor { compareReady }) throw kotlinx.coroutines.CancellationException("So cùng kỳ chưa sẵn sàng")
                            delay(1500); log("[XNK] moc=$mark"); delay(1500)
                            if (chart) {
                                for (point in listOf("first", "middle", "last")) {
                                    chartReady = false
                                    tap("xnk-chart-$point"); delay(750)
                                    if (!waitFor { chartReady }) throw kotlinx.coroutines.CancellationException("Biểu đồ chưa sẵn sàng")
                                }
                                log("[XNK] moc=$mark-chart"); delay(1500)
                                tap("xnk-chart-clear")
                            }
                        }
                        focusStage("xnk-cmp-default", "rieng-before")
                        focusStage("xnk-rieng", "rieng", true)
                        focusStage("xnk-diff", "rieng-diff", true)
                        focusStage("xnk-cum", "rieng-cum", true)
                        focusStage("xnk-net", "rieng-net")
                        focusStage("xnk-rate", "rieng-rate")
                        focusStage("xnk-weekday", "rieng-mode")
                        focusStage("xnk-cmp-default", "rieng-reset")
                        focusStage("xnk-ca-doi", "rieng-ca-doi")
                        focusStage("xnk-rieng", "rieng-toggle-in")
                        focusStage("xnk-rieng", "rieng-toggle-out")
                        tap("xnk-expand"); delay(500)
                        tap("xnk-last-before"); delay(1500)
                        log("[XNK] moc=rieng-last-before"); delay(1500)
                        focusStage("xnk-rieng-last", "rieng-last")
                        focusStage("xnk-ca-doi", "rieng-end")
                    }
                    "remember-read", "custom-read" -> compareStage("xnk-cmp-log", compareCase)
                    "remember-set" -> { compareStage("xnk-weekday", "remember-mode"); compareStage("xnk-diff", "remember-set") }
                    "custom-set" -> compareStage("xnk-custom-empty", "custom-set")
                    "timezone" -> compareStage("xnk-custom", "timezone")
                    else -> {
                        compareStage("xnk-cmp-default", "wave")
                        compareStage("xnk-diff", "diff")
                        compareStage("xnk-cum", "cum")
                        compareStage("xnk-weekday", "weekday")
                        compareStage("xnk-diff", "weekday-diff")
                        compareStage("xnk-chart-wave", "rate-wave")
                        compareStage("xnk-rate", "rate")
                        compareStage("xnk-cum", "rate-cum")
                        compareStage("xnk-net", "net")
                        compareStage("xnk-monthday", "monthday")
                        compareStage("xnk-year", "year")
                        compareStage("xnk-custom", "custom")
                        tableReady = false; compareReady = false; team = "cskh"; generation++
                        if (!waitFor { tableReady && compareReady }) return@LaunchedEffect
                        compareStage("xnk-cmp-default", "cskh-so")
                        tableReady = false; compareReady = false; period = Period.Month
                        if (!waitFor { tableReady && compareReady }) return@LaunchedEffect
                        compareStage("xnk-cmp-log", "through-today")
                        tableReady = false; compareReady = false; period = Period.Today
                        if (!waitFor { tableReady && compareReady }) return@LaunchedEffect
                        compareStage("xnk-cmp-log", "today")
                    }
                }
                log("[XNK] moc=so-xong")
                return@LaunchedEffect
            }
            if (!waitFor { tableReady }) return@LaunchedEffect
            stage("xnk-cot", "cot")
            stage("xnk-o", "giai-thich")
            tap("xnk-dong"); delay(1000)
            stage("xnk-ds", "ds")
            nav.stack.clear(); delay(1000)
            stage("xnk-chot", "chot")
            nav.stack.clear(); target = ""; tableReady = false; team = "cskh"; generation++
            if (!waitFor { tableReady }) return@LaunchedEffect
            stage("xnk-cot", "cskh")
            team = "sale"; period = Period.Month; target = ""; tableReady = false; generation++
            if (!waitFor { tableReady }) return@LaunchedEffect
            stage("xnk-cot", "dh-thang-nay")
            stage("xnk-o", "dh-thang-nay-giai-thich")
            tap("xnk-dong"); delay(1000)
            stage("xnk-ds", "dh-thang-nay-ds")
            nav.stack.clear(); target = ""; largeText = true
            stage("xnk-cot", "chu-lon")
            largeText = false; target = ""; log("[XNK] moc=xong")
        }
        val density = LocalDensity.current
        CompositionLocalProvider(LocalDensity provides Density(density.density, if (largeText) 2f else density.fontScale)) {
            SubPage("Từng nhân viên") { key(generation) { CompareContent(team) } }
        }
    }
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable fun Content() {
        if (!BuildConfig.DEBUG || tour !in listOf("khoa", "1-khoa", "2-che")) return
        var hostOk by remember { mutableStateOf(false) }
        LaunchedEffect(tour) {
            while (true) {
                hostOk = Api.base == "https://demo.tonghopposmegatech.io.vn"
                delay(250)
            }
        }
        var open by remember(tour) { mutableStateOf(true) }
        if (Auth.state == Auth.State.SignedIn && open) {
            SafeSheet({ open = false }) {
                T("Bảng thử bản debug", modifier = Modifier.padding(24.dp))
                if (hostOk) T("Máy chủ demo", modifier = Modifier.padding(24.dp))
            }
        }
    }
}
