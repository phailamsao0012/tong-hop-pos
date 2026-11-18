package vn.megatech.tonghoppos

object DebugLog {
    fun authenticationState(code: String, errorCode: Int? = null) {
        if (BuildConfig.DEBUG) android.util.Log.d("MEGATECH", code + (errorCode?.let { " $it" } ?: ""))
    }
    fun authentication(backgrounds: Long) {
        if (BuildConfig.DEBUG) android.util.Log.d("MEGATECH", "hoi-xac-thuc " + backgrounds)
    }
}
