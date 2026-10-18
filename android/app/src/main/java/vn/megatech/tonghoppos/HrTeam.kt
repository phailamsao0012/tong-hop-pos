package vn.megatech.tonghoppos

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.text.Collator
import java.util.Locale

data class HrUnit(val id: String, val name: String, val dept: String) {
    val shortName get() = name.substringAfterLast(" · ")
    companion object {
        fun applies(unit: HrUnit?, dept: String) = unit?.takeIf { dept == "all" || it.dept == dept }
        fun notice(pageId: String) = pageId !in listOf("compare", "cskh-overview", "config", "audit", "security", "metrics", "app-settings")
        fun serverMessage(error: Throwable, applied: HrUnit?) =
            (error as? ApiError)?.takeIf { it.code == 400 && applied != null }?.message
    }
}

// Chỉ trong bộ nhớ của phiên đăng nhập.
object TeamState {
    var unit by mutableStateOf<HrUnit?>(null)
    fun clear() { unit = null }
}

@Composable fun HrTeamErrorView(message: String) {
    Column { T(message, color = C.bad); TextButton({ TeamState.clear() }) { T("Bỏ chọn team") } }
}

@Composable fun HrTeamNotice(applies: Boolean, deptLabel: String) {
    val unit = TeamState.unit ?: return
    Column {
        T(if (applies)
            "Đang xem riêng team ${unit.name} — số trên trang chỉ tính người đang thuộc team này bên web nhân sự (theo team hiện tại: người chuyển team thì số các kỳ trước đi theo team mới; người đã nghỉ không tính)."
        else "Trang này chưa lọc được theo team — đang hiện số cả nhóm $deptLabel, không riêng team ${unit.name}. Xem theo team ở Tổng quan, Sale › Nhân viên, CSKH › Tổng quan và Vận đơn.")
        TextButton({ TeamState.clear() }) { T("Bỏ chọn team") }
    }
    if (BuildConfig.DEBUG) LaunchedEffect(DebugTour.tick) {
        if (DebugTour.target == "team-bo") TeamState.clear()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun HrTeamChip() {
    if (!listOf("sale-teams", "cskh-teams", "van-don").any { Auth.canView(it) }) return
    var open by remember { mutableStateOf(false) }
    Chip(TeamState.unit?.shortName ?: "Team", TeamState.unit != null) { open = true }
    if (BuildConfig.DEBUG) LaunchedEffect(DebugTour.tick) {
        if (DebugTour.target == "team-mo") open = true
    }
    if (open) SafeSheet({ open = false }) {
        val data = load(Unit) { Api.hrTeams() }
        val collator = remember { Collator.getInstance(Locale.forLanguageTag("vi")) }
        val ordered = data.data.orEmpty().filter { it.dept in listOf("sale", "cskh") }
            .sortedWith(compareBy<HrTeamItem> { if (it.dept == "sale") 0 else 1 }
                .thenComparator { a, b -> collator.compare(a.office?.ifEmpty { "Khác" } ?: "Khác", b.office?.ifEmpty { "Khác" } ?: "Khác") }
                .thenComparator { a, b -> collator.compare(a.name.orEmpty(), b.name.orEmpty()) })
        fun pick(item: HrTeamItem?) {
            TeamState.unit = item?.let { HrUnit(it.id.orEmpty(), it.name.orEmpty(), it.dept.orEmpty()) }
            open = false
        }
        LaunchedEffect(data.data) {
            val result = data.data ?: return@LaunchedEffect
            result.firstOrNull { it.id == TeamState.unit?.id }?.let {
                TeamState.unit = HrUnit(it.id.orEmpty(), it.name.orEmpty(), it.dept.orEmpty())
            }
            if (BuildConfig.DEBUG && DebugTour.tour == "team") {
                DebugTour.log("[TEAM] ds team=${Fmt.int(ordered.size)} nguoi=${ordered.joinToString(",") { it.people?.let { n -> Fmt.int(n) } ?: "—" }}")
                DebugTour.teamListReady = true
                DebugTour.teamHasCskh = ordered.any { it.dept == "cskh" }
            }
        }
        if (BuildConfig.DEBUG) LaunchedEffect(DebugTour.tick) {
            if (DebugTour.target in listOf("team-chon", "team-chon-cskh")) {
                val dept = if (DebugTour.target == "team-chon") "sale" else "cskh"
                ordered.firstOrNull { it.dept == dept }?.let { pick(it) }
            }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
            T("Team")
            TextButton({ pick(null) }) { T("Mọi team") }
            if (data.loading) Thinking()
            ErrorLine(data.error)
            if (data.error != null) TextButton({ data.reload() }) { T("Thử lại") }
            ordered.groupBy { "${if (it.dept == "sale") "Sale" else "CSKH"} · ${it.office?.ifEmpty { "Khác" } ?: "Khác"}" }.forEach { (label, items) ->
                T(label)
                items.forEach { item ->
                    TextButton({ pick(item) }) {
                        Column {
                            T(item.name.orEmpty())
                            T("${item.people?.let { Fmt.int(it) } ?: "—"} người${item.mentor?.let { " · Mentor $it" }.orEmpty()}")
                        }
                    }
                }
            }
        }
    }
}
