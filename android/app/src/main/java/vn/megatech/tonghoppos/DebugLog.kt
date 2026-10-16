package vn.megatech.tonghoppos

object DebugLog {
    fun authentication(backgrounds: Long) {
        if (BuildConfig.DEBUG) android.util.Log.d("MEGATECH", "hoi-xac-thuc " + backgrounds)
    }
}
