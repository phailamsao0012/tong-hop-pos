package vn.megatech.tonghoppos

import org.junit.Assert.*
import org.junit.Test

class AppLockTest {
    @Test fun legacyDisabledSettingsCannotBypassWelcome() {
        val result = LockPolicy().start(true, true, mapOf("lock" to false, "secure" to false, "lock_grace" to 1800))
        assertEquals(LockPolicy.Screen.Welcome, result.screen)
        assertEquals(setOf("lock", "lock_grace", "secure"), result.removeKeys)
    }
    @Test fun sessionWithoutDeviceSecurityRequiresPassword() {
        val result = LockPolicy().start(true, false, emptyMap())
        assertEquals(LockPolicy.Screen.Password, result.screen)
        assertEquals(setOf("lock", "lock_grace", "secure"), result.removeKeys)
    }
    @Test fun missingSessionAlwaysRequiresLogin() {
        for (deviceAuth in listOf(true, false)) {
            val result = LockPolicy().start(false, deviceAuth, mapOf("lock" to true))
            assertEquals(LockPolicy.Screen.Login, result.screen)
            assertEquals(setOf("lock", "lock_grace", "secure"), result.removeKeys)
        }
    }
    @Test fun backgroundInvalidatesAuthentication() {
        val policy = LockPolicy()
        val stale = policy.beginAuthentication()
        assertTrue(policy.acceptsAuthentication(stale, true))
        assertFalse(policy.acceptsAuthentication(stale, false))
        policy.onBackground()
        assertEquals(1L, policy.backgrounds)
        assertFalse(policy.acceptsAuthentication(stale, true))
        val fresh = policy.beginAuthentication()
        assertTrue(policy.acceptsAuthentication(fresh, true))
        policy.onBackground()
        assertFalse(policy.acceptsAuthentication(fresh, true))
    }
}
