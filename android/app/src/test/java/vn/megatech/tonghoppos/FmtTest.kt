package vn.megatech.tonghoppos

import org.junit.Assert.*
import org.junit.Test

class FmtTest {
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
