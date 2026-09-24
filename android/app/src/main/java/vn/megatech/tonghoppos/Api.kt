package vn.megatech.tonghoppos

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.util.concurrent.TimeUnit

/** Lỗi trả về từ máy chủ (thông điệp tiếng Việt lấy từ trường "error"). */
class ApiError(message: String, val code: Int = 0) : Exception(message)

/**
 * Gọi API của web tonghopposmegatech.io.vn. Phiên đăng nhập là cookie `thp_session`, lưu trong SharedPreferences
 * nên mở lại app vẫn còn đăng nhập. Bản debug nhận base / session qua intent (máy thử) để khỏi gõ đăng nhập.
 */
object Api {
    var base = "https://tonghopposmegatech.io.vn"
    private lateinit var prefs: SharedPreferences
    private const val COOKIE = "thp_session"

    fun init(ctx: Context) { prefs = ctx.getSharedPreferences("megatech", Context.MODE_PRIVATE) }
    var session: String?
        get() = prefs.getString(COOKIE, null)
        set(v) { prefs.edit().apply { if (v == null) remove(COOKIE) else putString(COOKIE, v) }.apply() }

    private val jar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            cookies.firstOrNull { it.name == COOKIE }?.let { c -> session = if (c.expiresAt < System.currentTimeMillis() || c.value.isEmpty()) null else c.value }
        }
        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val s = session ?: return emptyList()
            return listOf(Cookie.Builder().name(COOKIE).value(s).domain(url.host).path("/").build())
        }
    }
    val http: OkHttpClient = OkHttpClient.Builder().cookieJar(jar).connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()

    suspend fun get(path: String): J = call(path, "GET", null)
    suspend fun send(path: String, method: String, body: Map<String, Any?>): J = call(path, method, toJson(body))

    private suspend fun call(path: String, method: String, body: Any?): J = withContext(Dispatchers.IO) {
        val rb = body?.toString()?.toRequestBody("application/json".toMediaType())
        val req = Request.Builder().url(base + path).header("Accept", "application/json").header("User-Agent", "MEGATECH-Android/0.1")
            .method(method, if (method == "GET") null else (rb ?: "{}".toRequestBody("application/json".toMediaType()))).build()
        http.newCall(req).execute().use { res ->
            val text = res.body.string()
            val parsed = runCatching { JSONTokener(text).nextValue() }.getOrNull()
            if (!res.isSuccessful) {
                val msg = (parsed as? JSONObject)?.optString("error")?.takeIf { it.isNotEmpty() }
                if (res.code == 401) throw ApiError(msg ?: "Phiên đăng nhập đã hết, đăng nhập lại.", 401)
                throw ApiError(msg ?: "Máy chủ trả lỗi ${res.code}.", res.code)
            }
            J(parsed)
        }
    }

    fun toJson(v: Any?): Any? = when (v) {
        null -> JSONObject.NULL
        is Map<*, *> -> JSONObject().apply { v.forEach { (k, x) -> put(k.toString(), toJson(x)) } }
        is List<*> -> JSONArray().apply { v.forEach { put(toJson(it)) } }
        is Set<*> -> JSONArray().apply { v.forEach { put(toJson(it)) } }
        else -> v
    }

    fun enc(s: String): String = java.net.URLEncoder.encode(s, "UTF-8")

    // ---------- Các lời gọi thường dùng ----------
    suspend fun me() = get("/api/auth/me")
    suspend fun logout() { runCatching { send("/api/auth/logout", "POST", emptyMap()) }; session = null }
    suspend fun overview(start: String, end: String, posIds: List<String> = emptyList(), groupBy: String = "day", team: String = "all", compare: String = "previous", employeeIds: List<String> = emptyList(), product: String = "all") =
        get("/api/reports/overview?posIds=${posIds.joinToString(",")}&start=$start&end=$end&compare=$compare&groupBy=$groupBy&team=$team&employeeIds=${employeeIds.joinToString(",")}&productSegment=$product")
    suspend fun shift(date: String, shift: String, posIds: List<String> = emptyList(), team: String = "all") = get("/api/reports/shift?posIds=${posIds.joinToString(",")}&date=$date&shift=$shift&team=$team")
    suspend fun pipeline(start: String, end: String, basis: String, posIds: List<String> = emptyList(), team: String = "all", product: String = "all") =
        get("/api/reports/pipeline?posIds=${posIds.joinToString(",")}&start=$start&end=$end&basis=$basis&team=$team&productSegment=$product")
    suspend fun orders(q: OrderQuery, page: Int) = get("/api/raw/orders?" + q.queryString + "&page=$page&size=50")
    suspend fun order(id: String) = get("/api/raw/orders/detail?id=${enc(id)}")
    suspend fun customer(posId: String, phone: String) = get("/api/reports/customers/detail?posId=$posId&phone=${enc(phone)}")
    suspend fun syncStatus() = get("/api/sync/pos")
    suspend fun cskhBadge() = get("/api/reports/cskh-badge")
    suspend fun employees(team: String = "") = get("/api/employees" + if (team.isEmpty()) "" else "?team=$team")
    suspend fun targets(month: String) = get("/api/targets?month=$month")
    suspend fun customers(segment: String, sort: String, q: String, page: Int, size: Int = 50) = get("/api/reports/customers?posIds=&segment=$segment&sort=$sort&q=${enc(q)}&page=$page&size=$size")
    suspend fun repurchase(start: String, end: String, sellerId: String = "", posIds: List<String> = emptyList(), team: String = "all", product: String = "all") =
        get("/api/reports/repurchase?posIds=${posIds.joinToString(",")}&start=$start&end=$end&sellerId=$sellerId&team=$team&productSegment=$product")
    suspend fun batches(start: String, end: String, posIds: List<String> = emptyList(), team: String = "all") = get("/api/reports/batches?posIds=${posIds.joinToString(",")}&start=$start&end=$end&team=$team")
    suspend fun calls(start: String, end: String, team: String = "cskh") = get("/api/reports/calls?posIds=&start=$start&end=$end&team=$team")
    suspend fun care(assigned: String, sort: String, minDays: Int, q: String, page: Int) = get("/api/reports/care?posIds=&assigned=${assigned.ifEmpty { "all" }}&sort=$sort&minDays=$minDays&q=${enc(q)}&page=$page&size=50")
    suspend fun marketing(start: String, end: String) = get("/api/reports/marketing?posIds=&start=$start&end=$end&basis=created&stage=all")
    suspend fun recruit() = get("/api/recruit/candidates")
    suspend fun candidate(id: String) = get("/api/recruit/candidates?id=${enc(id)}")
    suspend fun security() = get("/api/auth/security")
    suspend fun audit(q: String, page: Int, group: String, from: String, to: String) = get("/api/audit?size=60&page=$page&group=$group&from=$from&to=$to&q=${enc(q)}")
    suspend fun syncNow(posId: String) = send("/api/sync/pos", "POST", mapOf("posId" to posId, "action" to "recent"))
}

/** Bọc JSON động: j["a"]["b"].d, j.list, j.s … trả giá trị mặc định khi thiếu, không bao giờ ném lỗi giải mã. */
class J(val v: Any?) {
    operator fun get(key: String): J = J((v as? JSONObject)?.opt(key).takeIf { it != JSONObject.NULL })
    operator fun get(i: Int): J = J((v as? JSONArray)?.opt(i).takeIf { it != JSONObject.NULL })
    val isNull get() = v == null || v == JSONObject.NULL
    val d: Double get() = when (v) { is Number -> v.toDouble(); is String -> v.toDoubleOrNull() ?: 0.0; is Boolean -> if (v) 1.0 else 0.0; else -> 0.0 }
    val dn: Double? get() = when (v) { is Number -> v.toDouble(); is String -> v.toDoubleOrNull(); else -> null }
    val i: Int get() = d.toInt()
    val s: String get() = when (v) { null -> ""; is String -> v; else -> v.toString() }
    val sn: String? get() = (v as? String)?.takeIf { it.isNotEmpty() } ?: (v as? Number)?.toString()
    val b: Boolean get() = v == true || (v as? Number)?.toInt() == 1
    val list: List<J> get() = (v as? JSONArray)?.let { a -> List(a.length()) { J(a.opt(it).takeIf { x -> x != JSONObject.NULL }) } } ?: emptyList()
    val keys: List<String> get() = (v as? JSONObject)?.keys()?.asSequence()?.toList() ?: emptyList()
    val strings: List<String> get() = list.map { it.s }
    val size: Int get() = (v as? JSONArray)?.length() ?: 0
}
