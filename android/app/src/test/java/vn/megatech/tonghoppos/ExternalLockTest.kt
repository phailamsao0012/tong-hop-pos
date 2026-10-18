package vn.megatech.tonghoppos

import org.junit.Assert.*
import org.junit.Test

class ExternalLockTest {
    @Test fun externalTimeoutInvalidatesTicketOnReturn() {
        val policy = LockPolicy()
        val ticket = policy.beginAuthentication()
        policy.expectExternal(12L)
        assertFalse(policy.onStop(30L))
        assertTrue(policy.onStart(120_031L))
        assertFalse(policy.expectingExternal)
        policy.onBackground()
        assertFalse(policy.acceptsAuthentication(ticket, true))
        assertTrue(policy.onStop(120_032L))
    }
    @Test fun rotationPreservesAuthenticationTicketAndExternalRequest() {
        val policy = LockPolicy()
        val ticket = policy.beginAuthentication()
        policy.expectExternal(12L)
        assertFalse(policy.onStop(30L, changingConfigurations = true))
        assertFalse(policy.onStart(60L))
        assertTrue(policy.expectingExternal)
        assertTrue(policy.acceptsAuthentication(ticket, true))
        policy.finishExternal()
        assertTrue(policy.onStop(90L))
    }
    @Test fun pinAndQrKeepTicketWhileExternalScreenIsOpen() {
        repeat(2) {
            val policy = LockPolicy()
            val ticket = policy.beginAuthentication()
            policy.expectExternal(12L)
            assertFalse(policy.onStop(30L))
            assertFalse(policy.onStart(120_030L))
            policy.finishExternal()
            assertFalse(policy.expectingExternal)
            assertTrue(policy.acceptsAuthentication(ticket, true))
            assertTrue(policy.onStop(120_031L))
            policy.onBackground()
            assertFalse(policy.acceptsAuthentication(ticket, true))
        }
    }
    @Test fun externalTimeoutLocksEvenIfCallbackClearedFlagFirst() {
        val policy = LockPolicy()
        val ticket = policy.beginAuthentication()
        policy.expectExternal(12L)
        assertFalse(policy.onStop(30L))
        policy.finishExternal()
        assertTrue(policy.onStart(120_031L))
        policy.onBackground()
        assertFalse(policy.acceptsAuthentication(ticket, true))
    }
    @Test fun ordinaryBackgroundLocksAndRotationDoesNot() {
        val policy = LockPolicy()
        assertFalse(policy.onStop(12L, changingConfigurations = true))
        assertFalse(policy.onStart(30L))
        assertTrue(policy.onStop(30L))
    }
    @Test fun qrCompletionCancellationAndFailureAllRestoreBackgroundLock() {
        repeat(3) {
            val policy = LockPolicy()
            policy.expectExternal(12L)
            assertFalse(policy.onStop(30L))
            policy.finishExternal()
            assertFalse(policy.onStart(60L))
            assertTrue(policy.onStop(90L))
        }
    }
    @Test fun staleExternalFlagCannotExemptLaterBackground() {
        val policy = LockPolicy()
        policy.expectExternal(12L)
        assertTrue(policy.onStop(120_030L))
        assertFalse(policy.expectingExternal)
    }
}
