package vn.megatech.tonghoppos

import org.json.JSONArray
import org.json.JSONObject

// Thiếu hoặc null giữ nguyên null; không thay bằng số 0 hay tự tính số nghiệp vụ.
private fun JSONObject.number(key: String): Double? =
    (opt(key) as? Number)?.toDouble()?.takeIf { it.isFinite() }
private fun JSONObject.string(key: String): String? = when (val value = opt(key)) {
    is String -> value
    is Number -> value.toString()
    else -> null
}
private fun <T> JSONArray.items(read: (Any?) -> T): List<T> =
    List(length()) { read(opt(it)) }
private fun JSONObject.numbers(key: String): List<Double?> =
    optJSONArray(key)?.items { (it as? Number)?.toDouble()?.takeIf { n -> n.isFinite() } } ?: emptyList()
private fun JSONObject.series(key: String): List<List<Double?>> =
    optJSONArray(key)?.items { row ->
        (row as? JSONArray)?.items { (it as? Number)?.toDouble()?.takeIf { n -> n.isFinite() } } ?: emptyList()
    } ?: emptyList()

data class StaffPeriod(
    val start: String?,
    val end: String?
) {
    companion object {
        fun fromJson(json: JSONObject): StaffPeriod = StaffPeriod(
            start = json.string("start"),
            end = json.string("end")
        )
    }
}

data class StaffDefinitions(
    val packed: String?,
    val closed: String?,
    val rate: String?
) {
    companion object {
        fun fromJson(json: JSONObject): StaffDefinitions = StaffDefinitions(
            packed = json.string("packed"),
            closed = json.string("closed"),
            rate = json.string("rate")
        )
    }
}

data class StaffRow(
    val sellerId: String?,
    val name: String?,
    val department: String?,
    val created: Double?,
    val createdClosed: Double?,
    val closed: Double?,
    val closedNet: Double?,
    val closeRate: Double?,
    val aov: Double?,
    val packed: Double?,
    val packedRate: Double?,
    val confirmedNotPacked: Double?,
    val cancelledBeforePack: Double?,
    val waiting: Double?,
    val closedFromCreated: Double?,
    val closedFromEarlier: Double?,
    val createdOpen: Double?
) {
    companion object {
        fun fromJson(json: JSONObject): StaffRow = StaffRow(
            sellerId = json.string("sellerId"),
            name = json.string("name"),
            department = json.string("department"),
            created = json.number("created"),
            createdClosed = json.number("createdClosed"),
            closed = json.number("closed"),
            closedNet = json.number("closedNet"),
            closeRate = json.number("closeRate"),
            aov = json.number("aov"),
            packed = json.number("packed"),
            packedRate = json.number("packedRate"),
            confirmedNotPacked = json.number("confirmedNotPacked"),
            cancelledBeforePack = json.number("cancelledBeforePack"),
            waiting = json.number("waiting"),
            closedFromCreated = json.number("closedFromCreated"),
            closedFromEarlier = json.number("closedFromEarlier"),
            createdOpen = json.number("createdOpen")
        )
    }
}

data class StaffSum(
    val people: Double?,
    val created: Double?,
    val createdClosed: Double?,
    val closed: Double?,
    val closedNet: Double?,
    val closeRate: Double?,
    val aov: Double?,
    val packed: Double?,
    val packedRate: Double?,
    val confirmedNotPacked: Double?,
    val cancelledBeforePack: Double?,
    val waiting: Double?,
    val closedFromCreated: Double?,
    val closedFromEarlier: Double?,
    val createdOpen: Double?
) {
    companion object {
        fun fromJson(json: JSONObject): StaffSum = StaffSum(
            people = json.number("people"),
            created = json.number("created"),
            createdClosed = json.number("createdClosed"),
            closed = json.number("closed"),
            closedNet = json.number("closedNet"),
            closeRate = json.number("closeRate"),
            aov = json.number("aov"),
            packed = json.number("packed"),
            packedRate = json.number("packedRate"),
            confirmedNotPacked = json.number("confirmedNotPacked"),
            cancelledBeforePack = json.number("cancelledBeforePack"),
            waiting = json.number("waiting"),
            closedFromCreated = json.number("closedFromCreated"),
            closedFromEarlier = json.number("closedFromEarlier"),
            createdOpen = json.number("createdOpen")
        )
    }
}

data class PGOrder(
    val id: String?,
    val orderCode: String?,
    val posId: String?,
    val posName: String?,
    val createdAt: String?,
    val closedAt: String?,
    val net: Double?,
    val products: List<String>
) {
    companion object {
        fun fromJson(json: JSONObject): PGOrder = PGOrder(
            id = json.string("id"),
            orderCode = json.string("source_order_id"),
            posId = json.string("pos_id"),
            posName = json.string("posName"),
            createdAt = json.string("created_at"),
            closedAt = json.string("first_confirmed_at"),
            net = json.number("net"),
            products = json.optJSONArray("products")?.items { it as? String }?.filterNotNull() ?: emptyList()
        )
    }
}

data class StaffTable(
    val period: StaffPeriod?,
    val team: String?,
    val staff: List<StaffRow>,
    val definitions: StaffDefinitions?,
    val orders: List<PGOrder>?,
    val staffTotal: StaffSum?
) {
    companion object {
        fun fromJson(json: JSONObject): StaffTable = StaffTable(
            period = json.optJSONObject("period")?.let { StaffPeriod.fromJson(it) },
            team = json.string("team"),
            staff = json.optJSONArray("staff")?.items { (it as? JSONObject)?.let { StaffRow.fromJson(it) } }?.filterNotNull() ?: emptyList(),
            definitions = json.optJSONObject("definitions")?.let { StaffDefinitions.fromJson(it) },
            orders = json.optJSONArray("orders")?.items { (it as? JSONObject)?.let { PGOrder.fromJson(it) } }?.filterNotNull(),
            staffTotal = json.optJSONObject("staffTotal")?.let { StaffSum.fromJson(it) }
        )
    }
}

data class CmpPeriod(
    val start: String?,
    val end: String?,
    val cutoff: String?
) {
    companion object {
        fun fromJson(json: JSONObject): CmpPeriod = CmpPeriod(
            start = json.string("start"),
            end = json.string("end"),
            cutoff = json.string("cutoff")
        )
    }
}

data class CmpCell(
    val closed: Double?,
    val closedNet: Double?,
    val created: Double?,
    val createdClosed: Double?,
    val closeRate: Double?
) {
    companion object {
        fun fromJson(json: JSONObject): CmpCell = CmpCell(
            closed = json.number("closed"),
            closedNet = json.number("closedNet"),
            created = json.number("created"),
            createdClosed = json.number("createdClosed"),
            closeRate = json.number("closeRate")
        )
    }
}

data class CmpSide(
    val total: CmpCell?
) {
    companion object {
        fun fromJson(json: JSONObject): CmpSide = CmpSide(
            total = json.optJSONObject("total")?.let { CmpCell.fromJson(it) }
        )
    }
}

data class CmpSeries(
    val current: List<List<Double?>>,
    val previous: List<List<Double?>>
) {
    companion object {
        fun fromJson(json: JSONObject): CmpSeries = CmpSeries(
            current = json.series("current"),
            previous = json.series("previous")
        )
    }
}

data class CmpSeriesRate(
    val current: List<Double?>,
    val previous: List<Double?>
) {
    companion object {
        fun fromJson(json: JSONObject): CmpSeriesRate = CmpSeriesRate(
            current = json.numbers("current"),
            previous = json.numbers("previous")
        )
    }
}

data class ChartPoint(
    val closed: Double?,
    val closedNet: Double?,
    val closeRate: Double?,
    val cumClosed: Double?,
    val cumClosedNet: Double?
) {
    companion object {
        fun fromJson(json: JSONObject): ChartPoint = ChartPoint(
            closed = json.number("closed"),
            closedNet = json.number("closedNet"),
            closeRate = json.number("closeRate"),
            cumClosed = json.number("cumClosed"),
            cumClosedNet = json.number("cumClosedNet")
        )
    }
}

data class CmpChart(
    val len: Int?,
    val current: List<ChartPoint?>,
    val previous: List<ChartPoint?>
) {
    companion object {
        fun fromJson(json: JSONObject): CmpChart = CmpChart(
            len = json.number("len")?.toInt(),
            current = json.optJSONArray("current")?.items { (it as? JSONObject)?.let { ChartPoint.fromJson(it) } } ?: emptyList(),
            previous = json.optJSONArray("previous")?.items { (it as? JSONObject)?.let { ChartPoint.fromJson(it) } } ?: emptyList()
        )
    }
}

data class CmpStaff(
    val sellerId: String?,
    val current: CmpCell?,
    val previous: CmpCell?,
    val series: CmpSeries?,
    val seriesRate: CmpSeriesRate?,
    val chart: CmpChart?
) {
    companion object {
        fun fromJson(json: JSONObject): CmpStaff = CmpStaff(
            sellerId = json.string("sellerId"),
            current = json.optJSONObject("current")?.let { CmpCell.fromJson(it) },
            previous = json.optJSONObject("previous")?.let { CmpCell.fromJson(it) },
            series = json.optJSONObject("series")?.let { CmpSeries.fromJson(it) },
            seriesRate = json.optJSONObject("seriesRate")?.let { CmpSeriesRate.fromJson(it) },
            chart = json.optJSONObject("chart")?.let { CmpChart.fromJson(it) }
        )
    }
}

data class CmpTotals(
    val current: CmpCell?,
    val previous: CmpCell?,
    val series: CmpSeries?,
    val seriesRate: CmpSeriesRate?
) {
    companion object {
        fun fromJson(json: JSONObject): CmpTotals = CmpTotals(
            current = json.optJSONObject("current")?.let { CmpCell.fromJson(it) },
            previous = json.optJSONObject("previous")?.let { CmpCell.fromJson(it) },
            series = json.optJSONObject("series")?.let { CmpSeries.fromJson(it) },
            seriesRate = json.optJSONObject("seriesRate")?.let { CmpSeriesRate.fromJson(it) }
        )
    }
}

data class StaffCompare(
    val mode: String?,
    val step: Int?,
    val bucket: String?,
    val group: Int?,
    val period: StaffPeriod?,
    val compare: CmpPeriod?,
    val current: CmpSide?,
    val previous: CmpSide?,
    val staff: List<CmpStaff>,
    val rowsTotal: CmpTotals?,
    val chart: CmpChart?
) {
    companion object {
        fun fromJson(json: JSONObject): StaffCompare = StaffCompare(
            mode = json.string("mode"),
            step = json.number("step")?.toInt(),
            bucket = json.string("bucket"),
            group = json.number("group")?.toInt(),
            period = json.optJSONObject("period")?.let { StaffPeriod.fromJson(it) },
            compare = json.optJSONObject("compare")?.let { CmpPeriod.fromJson(it) },
            current = json.optJSONObject("current")?.let { CmpSide.fromJson(it) },
            previous = json.optJSONObject("previous")?.let { CmpSide.fromJson(it) },
            staff = json.optJSONArray("staff")?.items { (it as? JSONObject)?.let { CmpStaff.fromJson(it) } }?.filterNotNull() ?: emptyList(),
            rowsTotal = json.optJSONObject("rowsTotal")?.let { CmpTotals.fromJson(it) },
            chart = json.optJSONObject("chart")?.let { CmpChart.fromJson(it) }
        )
    }
}

data class HrTeamItem(
    val id: String?,
    val name: String?,
    val office: String?,
    val dept: String?,
    val people: Int?,
    val mentor: String?
) {
    companion object {
        fun fromJson(json: JSONObject): HrTeamItem = HrTeamItem(
            id = json.string("id"),
            name = json.string("name"),
            office = json.string("office"),
            dept = json.string("dept"),
            people = json.number("people")?.toInt(),
            mentor = json.string("mentor")
        )
    }
}

data class StaffOrderQuery(
    val team: String, val by: String, val start: String, val end: String,
    val posIds: List<String>, val staffId: String, val packed: Boolean = false,
    val hrTeam: String? = null, val title: String = ""
)

