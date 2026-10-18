package vn.megatech.tonghoppos

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import java.util.Locale
import java.util.TimeZone

class FmtTest {
    @Test fun chartDifferencesMatchIOS() {
        data class Case(val a: Double?, val b: Double?, val metric: String, val text: String?, val up: Boolean?)
        listOf(
            Case(30.0, 12.0, "closed", "+18", true), Case(12.0, 30.0, "closed", "−18", false),
            Case(12.0, 12.0, "closed", "+0", true),
            Case(30_000_000.0, 12_000_000.0, "closedNet", "+18,0 tr ₫", true),
            Case(12_000_000.0, 30_000_000.0, "closedNet", "−18,0 tr ₫", false),
            Case(37.5, 40.0, "closeRate", "−2,5 điểm", false), Case(40.0, 37.5, "closeRate", "+2,5 điểm", true),
            Case(0.0, 0.0, "closeRate", "+0,0 điểm", true), Case(0.0, 0.0, "closedNet", "+0 ₫", true),
            Case(12.0, null, "closed", null, null), Case(null, 12.0, "closed", null, null), Case(null, null, "closed", null, null)
        ).forEach { c ->
            val actual = Fmt.chartDiff(c.a, c.b, c.metric)
            assertEquals(c.text, actual?.first); assertEquals(c.up, actual?.second)
        }
    }

    @Test fun chartLabelsMatchIOS() {
        assertEquals("38%", Fmt.chartAxis(37.5, "closeRate"))
        assertEquals("18,0 tr", Fmt.chartAxis(18_000_000.0, "closedNet"))
        assertEquals("1.234", Fmt.chartAxis(1234.0, "closed"))
        assertEquals("18,0 tr ₫", Fmt.chartPointValue(18_000_000.0, "closedNet"))
        assertEquals("—", Fmt.chartPointValue(null, "closedNet"))
        assertEquals("3h", Fmt.chartX(3, "hour", false, "", 12))
        assertEquals("24h", Fmt.chartX(23, "hour", true, "", 12))
        assertEquals("07/10", Fmt.chartX(2, "day", false, "2026-10-01", 3))
        assertEquals("3:00–4:00", Fmt.chartTime(3, "hour", false, "", "", 12))
        assertEquals("tới 24:00", Fmt.chartTime(23, "hour", true, "", "", 12))
        assertEquals("T5 01/10", Fmt.chartTime(0, "day", false, "2026-10-01", "2026-10-31", 1))
        assertEquals("tới T5 01/10", Fmt.chartTime(0, "day", true, "2026-10-01", "2026-10-31", 1))
        assertEquals("28/10–30/10", Fmt.chartTime(9, "day", false, "2026-10-01", "2026-10-30", 3))
        assertEquals("tới 28/10–30/10", Fmt.chartTime(9, "day", true, "2026-10-01", "2026-10-30", 3))
        assertEquals("—", Fmt.chartTime(0, "day", false, "bad", "", 1))
    }

    @Test fun comparePercentMatchesIOS() {
        val cases = listOf(
            Triple(12.0, 0.0, "mới"), Triple(0.0, 0.0, "0,0%"), Triple(10.0, 10.0, "0,0%"),
            Triple(null, 5.0, "—"), Triple(5.0, null, "—"), Triple(null, null, "—"),
            Triple(9.0, 8.0, "+12,5%"), Triple(97.0, 100.0, "−3,0%"), Triple(0.0, 12.0, "−100,0%"),
            Triple(1_350_000_000.0, 1_200_000_000.0, "+12,5%"),
            Triple(2_910_000.0, 3_000_000.0, "−3,0%"), Triple(10.004, 10.0, "+0,0%"),
            Triple(9.996, 10.0, "−0,0%"), Triple(-8.0, -10.0, "−20,0%"), Triple(-1.0, 0.0, "—"),
        )
        cases.forEach { (now, prev, expected) -> assertEquals(expected, Fmt.changePct(now, prev)) }
    }

    @Test fun comparePointsMatchesIOS() {
        listOf(
            Triple(2.2, 1.0, "+1,2 điểm"), Triple(1.0, 1.4, "−0,4 điểm"),
            Triple(12.0, 12.0, "+0,0 điểm"), Triple(0.0, 0.0, "+0,0 điểm"),
            Triple(null, 5.0, "—"), Triple(5.0, null, "—"), Triple(null, null, "—"),
            Triple(1.004, 1.0, "+0,0 điểm"), Triple(1.0, 1.004, "−0,0 điểm"),
        ).forEach { (now, prev, expected) -> assertEquals(expected, Fmt.changePoints(now, prev)) }
    }

    @Test fun compareToneMatchesIOS() {
        val percent = listOf(
            Triple(12.0, 0.0, 1), Triple(0.0, 0.0, 0), Triple(12.0, 12.0, 0),
            Triple(9.0, 8.0, 1), Triple(8.0, 9.0, -1), Triple(null, 5.0, 0), Triple(5.0, null, 0),
            Triple(-8.0, -10.0, -1), Triple(10.004, 10.0, 1),
        )
        percent.forEach { (now, prev, expected) -> assertEquals(expected, Fmt.changeTone(now, prev, points = false)) }
        val points = listOf(
            Triple(2.2, 1.0, 1), Triple(1.0, 1.4, -1), Triple(12.0, 12.0, 0),
            Triple(null, 5.0, 0), Triple(5.0, null, 0), Triple(12.0, 0.0, 1),
            Triple(0.0, 12.0, -1), Triple(-8.0, -10.0, 1),
        )
        points.forEach { (now, prev, expected) -> assertEquals(expected, Fmt.changeTone(now, prev, points = true)) }
    }

    @Test fun compareValuesAndDatesMatchIOS() {
        assertEquals("1.234", Fmt.cmpShort(1234.0, "closed"))
        assertEquals("12,5 tr", Fmt.cmpShort(12_500_000.0, "closedNet"))
        assertEquals("1,30 tỷ", Fmt.cmpShort(1_300_000_000.0, "closedNet"))
        assertEquals("40,0%", Fmt.cmpShort(40.0, "closeRate"))
        for (metric in listOf("closed", "closedNet", "closeRate")) {
            assertEquals("—", Fmt.cmpShort(null, metric))
            assertEquals(if (metric == "closeRate") "0,0%" else "0", Fmt.cmpShort(0.0, metric))
        }
        assertEquals("—", Fmt.cmpShort(12.0, "unknown"))
        listOf("CN", "T2", "T3", "T4", "T5", "T6", "T7").forEachIndexed { i, expected ->
            assertEquals(expected, Fmt.weekdayShort("2026-10-${11 + i}"))
        }
        assertEquals("—", Fmt.weekdayShort("garbage"))
        assertEquals("T5", Fmt.weekdayShort("2024-02-29"))
        assertEquals("T2 12/10", Fmt.cmpSpan("2026-10-12", "2026-10-12"))
        assertEquals("01/10–12/10", Fmt.cmpSpan("2026-10-01", "2026-10-12"))
        assertEquals("31/12–01/01", Fmt.cmpSpan("2025-12-31", "2026-01-01"))
    }

    @Test fun movedFormattersKeepLegacyText() {
        assertEquals("12,5 tr ₫", Fmt.shortMoney(12_500_000.0))
        assertEquals("1,23 tỷ ₫", Fmt.shortMoney(1_230_000_000.0))
        assertEquals("12.000 ₫", Fmt.shortMoney(12000.0))
        assertEquals("0 ₫", Fmt.shortMoney(0.0))
        assertEquals("-12,5 tr ₫", Fmt.shortMoney(-12_500_000.0))
        assertEquals("1,25", Fmt.dec2(1.25))
        assertEquals("0,00", Fmt.dec2(0.0))
        assertEquals("-1,25", Fmt.dec2(-1.25))
        assertEquals("00", Fmt.hour2(0))
        assertEquals("08", Fmt.hour2(8))
        assertEquals("24", Fmt.hour2(24))
        assertEquals("Tháng 01/2026", Fmt.monthTitle(LocalDate.of(2026, 1, 1)))
        assertEquals("Tháng 12/2025", Fmt.monthTitle(LocalDate.of(2025, 12, 1)))
    }

    @Test fun comparisonIgnoresDeviceLocaleAndTimeZone() {
        val locale = Locale.getDefault()
        val zone = TimeZone.getDefault()
        try {
            for (language in listOf(Locale.US, Locale.forLanguageTag("vi-VN"))) {
                Locale.setDefault(language)
                for (id in listOf("America/Los_Angeles", "Asia/Bangkok")) {
                    TimeZone.setDefault(TimeZone.getTimeZone(id))
                    assertEquals("−3,0%", Fmt.changePct(97.0, 100.0))
                    assertEquals("+1,2 điểm", Fmt.changePoints(2.2, 1.0))
                    assertEquals("T2 12/10", Fmt.cmpSpan("2026-10-12", "2026-10-12"))
                    assertEquals("01:30 16/10", Fmt.time("2026-10-15T18:30:00Z"))
                }
            }
        } finally {
            Locale.setDefault(locale)
            TimeZone.setDefault(zone)
        }
    }

    @Test fun numbers() {
        assertEquals("12.346", Fmt.int(12345.6))
        assertEquals("-1.234", Fmt.int(-1234))
        assertEquals("12.000 ₫", Fmt.money(12000.0))
        assertEquals("12.000đ", Fmt.vnd(12000.0))
        assertEquals("1,23 tỷ", Fmt.short(1230000000.0))
        assertEquals("12,5 tr", Fmt.short(12500000.0))
        assertEquals("12.000", Fmt.short(12000.0))
        assertEquals("—", Fmt.pct(null))
        assertEquals("—", Fmt.pct(Double.NaN))
        assertEquals("12,5%", Fmt.pct(12.5))
        assertEquals("12%", Fmt.pct0(12.0))
        assertEquals("+20%", Fmt.delta(12.0, 10.0))
        assertEquals("-20%", Fmt.delta(8.0, 10.0))
        assertNull(Fmt.delta(12.0, 0.0))
        assertNull(Fmt.delta(12.0, null))
        assertEquals("+1,5 điểm", Fmt.points(1.5))
        assertEquals("-1,5 điểm", Fmt.points(-1.5))
    }

    @Test fun datesUseVietnamTime() {
        assertEquals("15/10/2026", Fmt.day("2026-10-15"))
        assertEquals("—", Fmt.day(null))
        assertEquals("01:30 16/10", Fmt.time("2026-10-15T18:30:00Z"))
        assertEquals("01:30 16/10/2026", Fmt.dateTime("2026-10-15 18:30:00"))
        assertEquals("", Fmt.time("invalid"))
        assertEquals("—", Fmt.dateTime(null))
        assertNull(Fmt.parse("invalid"))
        assertEquals(Fmt.parse("2026-10-15T18:30:00Z"), Fmt.parse("2026-10-15T18:30:00"))
    }
}
