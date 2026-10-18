package vn.megatech.tonghoppos

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
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
 * Kho bí mật trên máy: mã hoá AES-GCM bằng khoá nằm trong Android Keystore (không rời khỏi phần cứng), bản mã lưu ở
 * SharedPreferences. Dùng cho cookie phiên (thp_session) và cookie nhớ máy (thp_device).
 */
object Vault {
    private const val ALIAS = "megatech_vault"
    private lateinit var prefs: SharedPreferences
    fun init(p: SharedPreferences) { prefs = p }
    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        return g.generateKey()
    }
    fun put(name: String, value: String?) {
        if (value == null) { prefs.edit().remove("v_$name").apply(); return }
        runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            val ct = c.doFinal(value.toByteArray())
            prefs.edit().putString("v_$name", Base64.encodeToString(c.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)).apply()
        }
    }
    fun get(name: String): String? {
        val raw = prefs.getString("v_$name", null) ?: return null
        return runCatching {
            val (iv, ct) = raw.split(":").let { Base64.decode(it[0], Base64.NO_WRAP) to Base64.decode(it[1], Base64.NO_WRAP) }
            val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
            String(c.doFinal(ct))
        }.getOrNull()
    }
}

/** Danh sách cố định, không phụ thuộc Api.base. */
object HostList {
    private val localHosts = setOf("10.0.2.2", "localhost")
    fun allows(url: HttpUrl, debug: Boolean): Boolean =
        url.username.isEmpty() && url.password.isEmpty() &&
            ((url.scheme == "https" && (url.host == "tonghopposmegatech.io.vn" ||
                (debug && (url.host == "demo.tonghopposmegatech.io.vn" || url.host in localHosts)))) ||
                (debug && url.scheme == "http" && url.host in localHosts))

    fun debugBase(value: String, debug: Boolean): String? {
        if (!debug) return null
        val url = value.toHttpUrlOrNull() ?: return null
        if (!allows(url, debug) || url.encodedPath != "/" || url.query != null || url.fragment != null) return null
        return url.toString().removeSuffix("/")
    }
}

/**
 * Gọi API của web tonghopposmegatech.io.vn. Phiên đăng nhập là cookie `thp_session`; cùng cookie nhớ máy `thp_device`
 * được mã hoá bằng Keystore (Vault) nên mở lại app vẫn còn đăng nhập. Tắt "Nhớ máy này" thì phiên chỉ giữ trong bộ nhớ.
 * Mọi request gửi X-Megatech-Client / X-Megatech-Device để máy chủ ghi đúng thiết bị.
 * Bản debug nhận base / session qua intent (máy thử) để khỏi gõ đăng nhập.
 */
object Api {
    var base = "https://tonghopposmegatech.io.vn"
    private lateinit var prefs: SharedPreferences
    private const val COOKIE = "thp_session"
    private const val DEVICE = "thp_device"
    private val mem = HashMap<String, String>()

    fun init(ctx: Context) {
        prefs = ctx.getSharedPreferences("megatech", Context.MODE_PRIVATE)
        Vault.init(prefs)
        prefs.getString("last_email", null)?.let { Vault.put("last_email", it) }
        prefs.edit().remove("last_email").apply()
        // Chuyển phiên cũ (lưu chữ thường) sang kho mã hoá.
        prefs.getString(COOKIE, null)?.let { Vault.put(COOKIE, it); prefs.edit().remove(COOKIE).apply() }
        remember = prefs.getBoolean("remember", true)
        Vault.get(COOKIE)?.let { mem[COOKIE] = it }
        Vault.get(DEVICE)?.let { mem[DEVICE] = it }
    }
    /** Lưu phiên xuống máy (Nhớ máy này). */
    var remember = true
        set(v) { field = v; if (::prefs.isInitialized) { prefs.edit().putBoolean("remember", v).apply(); if (!v) Vault.put(COOKIE, null) else mem[COOKIE]?.let { Vault.put(COOKIE, it) } } }
    var session: String?
        get() = mem[COOKIE]
        set(v) { if (v == null) mem.remove(COOKIE) else mem[COOKIE] = v; Vault.put(COOKIE, if (remember) v else null) }
    /** Có phiên đã lưu trên máy (để hiện nút đăng nhập bằng vân tay / khuôn mặt). */
    val hasSavedSession get() = session != null && remember
    /** Email lần đăng nhập gần nhất (hiện "Chào mừng trở lại"). */
    var lastEmail: String?
        get() = Vault.get("last_email")
        set(v) { Vault.put("last_email", v) }

    /** Tên máy gửi lên máy chủ, ví dụ "Samsung SM-N986B" (chỉ ký tự ASCII hiển thị được). */
    val deviceName: String by lazy {
        val maker = Build.MANUFACTURER.replaceFirstChar { it.titlecase() }
        val model = Build.MODEL ?: ""
        (if (model.startsWith(maker, true)) model else "$maker $model").filter { it in ' '..'~' }.trim().take(60).ifEmpty { "Android" }
    }

    private val jar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            if (!HostList.allows(url, BuildConfig.DEBUG)) return
            cookies.firstOrNull { it.name == COOKIE }?.let { c -> session = if (c.expiresAt < System.currentTimeMillis() || c.value.isEmpty()) null else c.value }
            cookies.firstOrNull { it.name == DEVICE }?.let { c ->
                val v = if (c.expiresAt < System.currentTimeMillis() || c.value.isEmpty()) null else c.value
                if (v == null) mem.remove(DEVICE) else mem[DEVICE] = v; Vault.put(DEVICE, v)
            }
        }
        override fun loadForRequest(url: HttpUrl): List<Cookie> =
            if (!HostList.allows(url, BuildConfig.DEBUG)) emptyList() else listOf(COOKIE, DEVICE).mapNotNull { n -> mem[n]?.let { Cookie.Builder().name(n).value(it).hostOnlyDomain(url.host).path("/").build() } }
    }
    val http: OkHttpClient = OkHttpClient.Builder().cookieJar(jar).connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()

    suspend fun get(path: String): J = call(path, "GET", null)
    suspend fun delete(path: String): J = call(path, "DELETE", null)
    suspend fun send(path: String, method: String, body: Map<String, Any?>): J = call(path, method, toJson(body))

    private suspend fun call(path: String, method: String, body: Any?): J = withContext(Dispatchers.IO) {
        val rb = body?.toString()?.toRequestBody("application/json".toMediaType())
        // Mọi báo cáo tính theo "Cách tính" của tài khoản (như web).
        val url = base + path + if (path.startsWith("/api/reports/")) (if ('?' in path) "&" else "?") + MetricPrefs.query else ""
        val req = Request.Builder().url(url).header("Accept", "application/json").header("User-Agent", "MEGATECH-Android/${BuildConfig.VERSION_NAME}")
            .header("X-Megatech-Client", "android").header("X-Megatech-Device", deviceName)
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

    // Giá trị mã hóa riêng; dấu phẩy giữa các POS giữ nguyên theo hợp đồng app.
    private fun staffValue(value: String): String =
        enc(value).replace("+", "%20").replace("%7E", "~").replace("*", "%2A")
    private fun staffTeamSuffix(hrTeam: String?): String =
        hrTeam?.takeIf { it.isNotEmpty() }?.let { "&hrTeam=${staffValue(it)}" } ?: ""

    fun staffTablePath(start: String, end: String, posIds: List<String>, team: String, by: String, hrTeam: String? = null): String =
        "/api/reports/product-groups?start=${staffValue(start)}&end=${staffValue(end)}&posIds=${posIds.joinToString(",") { staffValue(it) }}&team=${staffValue(team)}&dim=tag&basis=both&by=${staffValue(by)}" + staffTeamSuffix(hrTeam)

    suspend fun staffTable(start: String, end: String, posIds: List<String>, team: String, by: String, hrTeam: String? = null): StaffTable =
        StaffTable.fromJson(get(staffTablePath(start, end, posIds, team, by, hrTeam)).v as JSONObject)

    fun staffOrdersPath(q: StaffOrderQuery): String =
        staffTablePath(q.start, q.end, q.posIds, q.team, q.by, q.hrTeam) +
            "&staffId=${staffValue(q.staffId)}" + if (q.packed) "&packed=1" else ""

    suspend fun staffOrders(q: StaffOrderQuery): StaffTable =
        StaffTable.fromJson(get(staffOrdersPath(q)).v as JSONObject)

    fun staffComparePath(
        start: String, end: String, posIds: List<String>, team: String, by: String,
        mode: String, step: Int, cstart: String? = null, cend: String? = null, hrTeam: String? = null
    ): String {
        val prefix = "/api/reports/staff-compare?start=${staffValue(start)}&end=${staffValue(end)}&posIds=${posIds.joinToString(",") { staffValue(it) }}&team=${staffValue(team)}&by=${staffValue(by)}&mode=${staffValue(mode)}"
        val range = if (mode == "custom") {
            // Thiếu ngày để máy chủ báo lỗi; app không tự tính ngày kỳ so.
            "&cstart=${staffValue(cstart ?: "")}&cend=${staffValue(cend ?: "")}"
        } else {
            val levels = when (mode) {
                "previous" -> listOf(1, 2, 3, 4)
                "weekday" -> listOf(1, 2, 3, 4, 8)
                "monthday" -> listOf(1, 2, 3, 6, 12)
                "year" -> listOf(1, 2)
                else -> emptyList()
            }
            "&step=${if (step in levels) step else 1}"
        }
        return prefix + range + staffTeamSuffix(hrTeam)
    }

    suspend fun staffCompare(
        start: String, end: String, posIds: List<String>, team: String, by: String,
        mode: String, step: Int, cstart: String? = null, cend: String? = null, hrTeam: String? = null
    ): StaffCompare = StaffCompare.fromJson(
        get(staffComparePath(start, end, posIds, team, by, mode, step, cstart, cend, hrTeam)).v as JSONObject
    )

    // Client không có Cache: mỗi lần gọi đều tải danh sách team mới từ máy chủ.
    suspend fun hrTeams(): List<HrTeamItem> =
        (get("/api/teams?list=1").v as JSONObject).optJSONArray("teams")?.let { teams ->
            List(teams.length()) { HrTeamItem.fromJson(teams.getJSONObject(it)) }
        } ?: emptyList()

    // ---------- Các lời gọi thường dùng ----------
    suspend fun reauth(password: String) { send("/api/auth/reauth", "POST", mapOf("password" to password)) }
    suspend fun me() = get("/api/auth/me")
    suspend fun logout() { runCatching { send("/api/auth/logout", "POST", emptyMap()) }; session = null }
    suspend fun overview(start: String, end: String, posIds: List<String> = emptyList(), groupBy: String = "day", team: String = "all", compare: String = "previous", employeeIds: List<String> = emptyList(), product: String = "all") =
        get("/api/reports/overview?posIds=${posIds.joinToString(",")}&start=$start&end=$end&compare=$compare&groupBy=$groupBy&team=$team&employeeIds=${employeeIds.joinToString(",")}&productSegment=$product")
    suspend fun pancakeRef(start: String, end: String, posIds: List<String> = emptyList()) = get("/api/reports/pancake-ref?start=$start&end=$end&posIds=${posIds.joinToString(",")}")
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
