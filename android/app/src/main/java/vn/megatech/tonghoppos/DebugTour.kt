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
    fun log(message: String) {
        if (BuildConfig.DEBUG && Api.base == "https://demo.tonghopposmegatech.io.vn") DebugLog.authenticationState(message)
    }
    private fun tap(value: String) { if (BuildConfig.DEBUG) { target = value; tick++ } }

    @Composable fun Warehouse() {
        if (!BuildConfig.DEBUG || tour != "xnkho" || Api.base != "https://demo.tonghopposmegatech.io.vn") return
        val nav = LocalNav.current
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
