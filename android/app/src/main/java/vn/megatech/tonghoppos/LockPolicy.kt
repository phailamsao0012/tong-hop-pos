package vn.megatech.tonghoppos

class LockPolicy {
    fun canStartAuthentication(resumed: Boolean, stateSaved: Boolean) = resumed && !stateSaved
    enum class Screen { Login, Welcome, Password }
    data class Start(val screen: Screen, val removeKeys: Set<String>)
    var backgrounds = 0L
        private set
    @Suppress("UNUSED_PARAMETER")
    fun start(hasSession: Boolean, canUseDeviceAuth: Boolean, legacy: Map<String, Any?>) = Start(
        when { !hasSession -> Screen.Login; canUseDeviceAuth -> Screen.Welcome; else -> Screen.Password },
        setOf("lock", "lock_grace", "secure")
    )
    var expectingExternal = false
        private set
    private var externalStarted = 0L
    private var externalStopped: Long? = null
    fun expectExternal(now: Long) {
        expectingExternal = true
        externalStarted = now
        externalStopped = null
    }
    // Callback có thể đến trước ON_START; giữ mốc dừng để vẫn kiểm giới hạn khi về.
    fun finishExternal() { expectingExternal = false }
    /** True means a real background transition must invalidate the active ticket. */
    fun onStop(now: Long, changingConfigurations: Boolean = false): Boolean {
        if (changingConfigurations) return false
        if (expectingExternal && now - externalStarted <= 120_000L) {
            if (externalStopped == null) externalStopped = now
            return false
        }
        finishExternal(); externalStopped = null
        return true
    }
    fun onStart(now: Long): Boolean {
        val stopped = externalStopped ?: return false
        externalStopped = null
        if (now - stopped <= 120_000L) return false
        finishExternal()
        return true
    }
    fun onBackground() { backgrounds++ }
    fun beginAuthentication() = backgrounds
    fun acceptsAuthentication(ticket: Long, success: Boolean) = success && ticket == backgrounds
}
