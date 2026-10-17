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
    fun onBackground() { backgrounds++ }
    fun beginAuthentication() = backgrounds
    fun acceptsAuthentication(ticket: Long, success: Boolean) = success && ticket == backgrounds
}
