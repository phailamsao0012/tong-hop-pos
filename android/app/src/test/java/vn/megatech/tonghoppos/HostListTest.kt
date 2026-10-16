package vn.megatech.tonghoppos

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.*
import org.junit.Test

class HostListTest {
    @Test fun releaseOnlyAllowsProductionHttps() {
        assertTrue(HostList.allows("https://tonghopposmegatech.io.vn/api".toHttpUrl(), false))
        listOf(
            "http://tonghopposmegatech.io.vn",
            "https://demo.tonghopposmegatech.io.vn",
            "http://localhost",
            "https://example.invalid",
            "https://tonghopposmegatech.io.vn.example.invalid"
        ).forEach { assertFalse(it, HostList.allows(it.toHttpUrl(), false)) }
    }

    @Test fun debugAllowsOnlyFixedHostsAndLocalCleartext() {
        listOf(
            "https://tonghopposmegatech.io.vn",
            "https://demo.tonghopposmegatech.io.vn",
            "http://10.0.2.2:3000",
            "http://localhost:3000",
            "https://localhost"
        ).forEach { assertTrue(it, HostList.allows(it.toHttpUrl(), true)) }
        listOf(
            "https://example.invalid",
            "http://demo.tonghopposmegatech.io.vn",
            "https://sub.demo.tonghopposmegatech.io.vn",
            "https://localhost.example.invalid",
            "https://user:pass@localhost"
        ).forEach {
            assertFalse(it, HostList.allows(it.toHttpUrl(), true))
            assertNull(HostList.debugBase(it, true))
        }
    }

    @Test fun intentBaseMustBeAnOriginAndDebugOnly() {
        assertEquals("http://localhost:3000", HostList.debugBase("http://localhost:3000/", true))
        assertEquals("https://demo.tonghopposmegatech.io.vn",
            HostList.debugBase("https://demo.tonghopposmegatech.io.vn", true))
        listOf(
            "invalid", "https://example.invalid", "https://localhost/api",
            "https://localhost?next=value", "https://localhost#fragment",
            "https://user:pass@localhost"
        ).forEach { assertNull(it, HostList.debugBase(it, true)) }
        assertNull(HostList.debugBase("https://tonghopposmegatech.io.vn", false))
    }
}
