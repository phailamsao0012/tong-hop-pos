package vn.megatech.tonghoppos

object DebugLog {
    fun authenticationState(code: String, errorCode: Int? = null) {
        if (BuildConfig.DEBUG) android.util.Log.d("MEGATECH", code + (errorCode?.let { " $it" } ?: ""))
    }
    /** Mốc lượt chụp giao diện: CI chờ dòng "[UI] moc=<tên>" rồi chụp. */
    fun ui(moc: String) {
        if (BuildConfig.DEBUG) android.util.Log.d("MEGATECH", "[UI] moc=" + moc)
    }
    fun authentication(backgrounds: Long) {
        if (BuildConfig.DEBUG) android.util.Log.d("MEGATECH", "hoi-xac-thuc " + backgrounds)
    }
}
