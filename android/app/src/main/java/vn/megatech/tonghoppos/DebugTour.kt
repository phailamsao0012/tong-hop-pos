package vn.megatech.tonghoppos

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

object DebugTour {
    var tour by mutableStateOf("")
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
