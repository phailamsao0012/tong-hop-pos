package vn.megatech.tonghoppos

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ModelsTest {
    private val row = """{
        "sellerId":"nv-a","name":"NV A","department":null,
        "created":30,"createdClosed":12,"closed":13,"closedNet":300,
        "closeRate":40,"aov":null,"packed":10,"packedRate":null,
        "confirmedNotPacked":2,"cancelledBeforePack":0,"waiting":1,
        "closedFromCreated":11,"closedFromEarlier":2,"createdOpen":18
    }"""
    private val cell = """{"closed":12,"closedNet":300,"created":30,"createdClosed":12,"closeRate":40}"""
    private val chart = """{"len":3,"current":[{"closed":12,"closedNet":300,"closeRate":null,"cumClosed":24,"cumClosedNet":600},null],"previous":[null]}"""
    private val series = """{"current":[[12,300,30,12],[],[0]],"previous":[[10,200,20,10]]}"""
    private val rates = """{"current":[40,null,0],"previous":[50]}"""

    @Test fun tableReadsPackedAndServerTotalsWithoutSubstitution() {
        val json = JSONObject("""{
            "period":{"start":"2026-10-01","end":"2026-10-18"},"team":"sale",
            "staff":[$row],"staffTotal":$row,"definitions":{"packed":"Định nghĩa mẫu","closed":"Đơn chốt","rate":"Tỷ lệ"},"orders":null
        }""")
        json.getJSONObject("staffTotal").put("people", 1).put("packedRate", 75)
        val table = StaffTable.fromJson(json)
        val staff = table.staff.single()
        assertEquals("NV A", staff.name)
        assertNull(staff.department)
        assertEquals(10.0, staff.packed!!, 0.0)
        assertEquals(2.0, staff.confirmedNotPacked!!, 0.0)
        assertEquals(0.0, staff.cancelledBeforePack!!, 0.0)
        assertEquals(1.0, staff.waiting!!, 0.0)
        assertNull(staff.packedRate)
        assertEquals(11.0, staff.closedFromCreated!!, 0.0)
        assertEquals(2.0, staff.closedFromEarlier!!, 0.0)
        assertEquals(18.0, staff.createdOpen!!, 0.0)
        assertEquals("Định nghĩa mẫu", table.definitions?.packed)
        val total = table.staffTotal!!
        assertEquals(1.0, total.people!!, 0.0)
        assertEquals(10.0, total.packed!!, 0.0)
        assertEquals(75.0, total.packedRate!!, 0.0)
        assertEquals(2.0, total.confirmedNotPacked!!, 0.0)
        assertEquals(0.0, total.cancelledBeforePack!!, 0.0)
        assertEquals(1.0, total.waiting!!, 0.0)
        assertNull(table.orders)
        assertEquals("2026-10-01", table.period?.start)
    }

    @Test fun olderTableAndAbsentNumbersRemainNull() {
        val json = JSONObject(row)
        listOf("packed", "packedRate", "confirmedNotPacked", "cancelledBeforePack",
            "closedFromCreated", "closedFromEarlier", "createdOpen").forEach { json.remove(it) }
        val table = StaffTable.fromJson(JSONObject().put("staff", org.json.JSONArray().put(json)))
        val staff = table.staff.single()
        assertNull(staff.packed)
        assertNull(staff.packedRate)
        assertNull(staff.confirmedNotPacked)
        assertNull(staff.cancelledBeforePack)
        assertNull(staff.closedFromCreated)
        assertNull(staff.closedFromEarlier)
        assertNull(staff.createdOpen)
        assertNull(table.staffTotal)
        val total = StaffSum.fromJson(json)
        assertNull(total.packed)
        assertNull(total.packedRate)
        assertNull(total.confirmedNotPacked)
        assertNull(total.cancelledBeforePack)
        assertNull(StaffRow.fromJson(JSONObject()).closed)
        assertNull(CmpCell.fromJson(JSONObject("""{"closed":null}""")).closed)
        assertNull(StaffRow.fromJson(JSONObject("""{"packed":"bad"}""")).packed)
        val explicitNulls = JSONObject("""{"packed":null,"packedRate":null,"confirmedNotPacked":null,"cancelledBeforePack":null}""")
        val nullRow = StaffRow.fromJson(explicitNulls)
        assertNull(nullRow.packed)
        assertNull(nullRow.packedRate)
        assertNull(nullRow.confirmedNotPacked)
        assertNull(nullRow.cancelledBeforePack)
        val nullSum = StaffSum.fromJson(explicitNulls)
        assertNull(nullSum.packed)
        assertNull(nullSum.packedRate)
        assertNull(nullSum.confirmedNotPacked)
        assertNull(nullSum.cancelledBeforePack)
    }

    @Test fun ordersReadClosingTimeAndIgnoreUnneededFields() {
        val table = StaffTable.fromJson(JSONObject("""{"orders":[{
            "id":"order-a","source_order_id":"12","pos_id":"pos-a","posName":"POS A",
            "created_at":null,"first_confirmed_at":"2026-10-02T01:00:00Z",
            "confirmed_at":"2026-10-03T02:00:00Z","net":300,"products":["Mẫu A"],
            "status_code":8,"unused":"ignored"
        }]}"""))
        val order = table.orders!!.single()
        assertEquals("2026-10-02T01:00:00Z", order.closedAt)
        assertEquals("12", order.orderCode)
        assertEquals("pos-a", order.posId)
        assertEquals("POS A", order.posName)
        assertEquals("order-a", order.id)
        assertNull(order.createdAt)
        assertEquals(300.0, order.net!!, 0.0)
        assertEquals(listOf("Mẫu A"), order.products)
        assertTrue(StaffTable.fromJson(JSONObject("""{"orders":[]}""")).orders!!.isEmpty())
    }

    private fun comparison(): JSONObject = JSONObject("""{
        "mode":"previous","step":1,"bucket":"hour","group":1,
        "period":{"start":"2026-10-18","end":"2026-10-18"},
        "compare":{"start":"2026-10-17","end":"2026-10-17","cutoff":"12:30"},
        "current":{"total":$cell},"previous":{"total":$cell},
        "staff":[{"sellerId":"nv-a","current":$cell,"previous":$cell,
            "series":$series,"seriesRate":$rates,"chart":$chart}],
        "rowsTotal":{"current":$cell,"previous":$cell,"series":$series,"seriesRate":$rates},
        "chart":$chart
    }""")

    @Test fun comparisonPreservesServerSeriesRatesChartsAndNullPositions() {
        val result = StaffCompare.fromJson(comparison())
        assertEquals("12:30", result.compare?.cutoff)
        assertEquals(12.0, result.current!!.total!!.closed!!, 0.0)
        assertEquals(300.0, result.previous!!.total!!.closedNet!!, 0.0)
        val staff = result.staff.single()
        assertEquals("nv-a", staff.sellerId)
        assertEquals(listOf(12.0, 300.0, 30.0, 12.0), staff.series!!.current[0])
        assertTrue(staff.series.current[1].isEmpty())
        assertEquals(listOf(0.0), staff.series.current[2])
        assertEquals(listOf(40.0, null, 0.0), staff.seriesRate!!.current)
        assertEquals(listOf(50.0), result.rowsTotal!!.seriesRate!!.previous)
        listOf(result.chart!!, staff.chart!!).forEach {
            assertEquals(3, it.len)
            assertEquals(2, it.current.size)
            assertNull(it.current[1])
            assertNull(it.previous[0])
            val point = it.current[0]!!
            assertEquals(12.0, point.closed!!, 0.0)
            assertEquals(300.0, point.closedNet!!, 0.0)
            assertNull(point.closeRate)
            assertEquals(24.0, point.cumClosed!!, 0.0)
            assertEquals(600.0, point.cumClosedNet!!, 0.0)
        }
    }

    @Test fun comparisonWithoutW2W5StillDecodes() {
        val json = comparison()
        json.remove("chart")
        json.remove("rowsTotal")
        json.getJSONObject("compare").put("cutoff", JSONObject.NULL)
        val staff = json.getJSONArray("staff").getJSONObject(0)
        staff.remove("seriesRate")
        staff.remove("chart")
        val result = StaffCompare.fromJson(json)
        assertNull(result.chart)
        assertNull(result.rowsTotal)
        assertNull(result.staff.single().chart)
        assertNull(result.staff.single().seriesRate)
        assertNull(result.compare?.cutoff)
    }

    @Test fun teamsAllowNullOfficeAndMentor() {
        val team = HrTeamItem.fromJson(JSONObject("""{"id":"team-a","name":"Team A","office":null,"dept":"sale","people":12,"mentor":null}"""))
        assertEquals("team-a", team.id)
        assertEquals("Team A", team.name)
        assertEquals("sale", team.dept)
        assertEquals(12, team.people)
        assertNull(team.office)
        assertNull(team.mentor)
    }

    @Test fun tableAndOrderPathsMatchContractExactly() {
        val base = "/api/reports/product-groups?start=2026-10-01&end=2026-10-18&posIds="
        for (pos in listOf(emptyList(), listOf("pos-a"), listOf("pos-a", "pos-b"))) {
            for (hr in listOf(null, "", "team-a")) {
                val suffix = if (hr.isNullOrEmpty()) "" else "&hrTeam=team-a"
                val expected = base + pos.joinToString(",") + "&team=sale&dim=tag&basis=both&by=seller" + suffix
                assertEquals(expected, Api.staffTablePath("2026-10-01", "2026-10-18", pos, "sale", "seller", hr))
                val q = StaffOrderQuery("sale", "seller", "2026-10-01", "2026-10-18", pos, "nv-a", hrTeam = hr)
                assertEquals(expected + "&staffId=nv-a", Api.staffOrdersPath(q))
                val packed = Api.staffOrdersPath(q.copy(packed = true))
                assertEquals(expected + "&staffId=nv-a&packed=1", packed)
                assertFalse(packed.contains("&wh=1"))
            }
        }
        assertEquals(base + "&team=cskh&dim=tag&basis=both&by=care",
            Api.staffTablePath("2026-10-01", "2026-10-18", emptyList(), "cskh", "care"))
        val encoded = StaffOrderQuery("sale", "seller", "2026-10-01", "2026-10-18",
            listOf("pos a", "pos/b"), "nv&=+ Việt", true, "team &")
        assertEquals(base + "pos%20a,pos%2Fb&team=sale&dim=tag&basis=both&by=seller&hrTeam=team%20%26&staffId=nv%26%3D%2B%20Vi%E1%BB%87t&packed=1",
            Api.staffOrdersPath(encoded))
    }

    @Test fun comparePathsMatchContractAndValidateRememberedStep() {
        val modes = mapOf("previous" to listOf(1, 2, 3, 4), "weekday" to listOf(1, 2, 3, 4, 8),
            "monthday" to listOf(1, 2, 3, 6, 12), "year" to listOf(1, 2))
        for (pos in listOf(emptyList(), listOf("pos-a"), listOf("pos-a", "pos-b"))) {
            for (hr in listOf(null, "team-a")) {
                val prefix = "/api/reports/staff-compare?start=2026-10-01&end=2026-10-18&posIds=" +
                    pos.joinToString(",") + "&team=cskh&by=care&mode="
                val suffix = if (hr == null) "" else "&hrTeam=team-a"
                for ((mode, levels) in modes) {
                    for (step in levels + 99) {
                        assertEquals(prefix + mode + "&step=" + (if (step in levels) step else 1) + suffix,
                            Api.staffComparePath("2026-10-01", "2026-10-18", pos, "cskh", "care", mode, step, hrTeam = hr))
                    }
                }
                assertEquals(prefix + "custom&cstart=2026-09-01&cend=2026-09-12" + suffix,
                    Api.staffComparePath("2026-10-01", "2026-10-18", pos, "cskh", "care",
                        "custom", 8, "2026-09-01", "2026-09-12", hr))
                assertEquals(prefix + "custom&cstart=&cend=" + suffix,
                    Api.staffComparePath("2026-10-01", "2026-10-18", pos, "cskh", "care",
                        "custom", 8, hrTeam = hr))
            }
        }
    }

    @Test fun loaderErrorsMatchIosAndKeepCancellationSilent() {
        assertEquals("Phiên đã hết, đăng nhập lại", loadErrorText(ApiError("Mẫu", 401)))
        assertEquals("Tài khoản chưa được xem phần này", loadErrorText(ApiError("Mẫu", 403)))
        assertEquals("Thao tác quá nhanh, thử lại sau ít giây", loadErrorText(ApiError("Mẫu", 429)))
        assertEquals("Máy chủ chậm, thử lại sau ít giây", loadErrorText(ApiError("Mẫu", 503)))
        assertEquals("Không tải được", loadErrorText(ApiError("Mẫu", 400)))
        assertEquals("Mất mạng, kiểm tra kết nối", loadErrorText(java.net.UnknownHostException()))
        assertEquals("Máy chủ chậm, thử lại sau ít giây", loadErrorText(java.net.SocketTimeoutException()))
        assertNull(loadErrorText(kotlinx.coroutines.CancellationException()))
    }
}
