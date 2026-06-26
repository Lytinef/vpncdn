package com.vpncdn.client.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import com.vpncdn.client.MainActivity
import com.vpncdn.client.VpnBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Основной VPN-сервис.
 *  - поднимает TUN-интерфейс с учётом раздельного туннелирования и обхода приложений;
 *  - запускает Xray (VLESS+WS+TLS на CDN) и tun2socks (TUN → SOCKS Xray);
 *  - kill switch: при разрыве туннель не сносится, трафик блокируется;
 *  - публикует статус и метрики через VpnBus.
 */
class VpnConnectionService : VpnService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var tun: ParcelFileDescriptor? = null
    private var xray: XrayCore? = null
    private var tun2socks: Tun2socks? = null
    // Прямой режим AmneziaWG: handle активного туннеля libwg-go (или null).
    private var awgHandle: Int? = null
    private var killSwitch = false
    private var savedConfig: String? = null
    private var watchdog: Job? = null
    private var connectivityManager: ConnectivityManager? = null
    private var netCallback: ConnectivityManager.NetworkCallback? = null
    @Volatile private var activeNetwork: Network? = null
    @Volatile private var netPrimed = false
    @Volatile private var reconnecting = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> {
                val cfg = intent.getStringExtra(EXTRA_CONFIG)
                if (cfg != null) {
                    // Сохраняем для автозапуска при загрузке.
                    getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
                        .edit().putString(KEY_LAST_CONFIG, cfg).apply()
                    startForegroundNotification()
                    publishStage("connecting")
                    // Тяжёлая инициализация + проверка доступности — вне главного потока.
                    scope.launch { connect(cfg) }
                }
            }
            ACTION_DISCONNECT -> disconnect()
        }
        return START_STICKY
    }

    private fun connect(configJson: String) {
        try {
            val cfg = JSONObject(configJson)
            savedConfig = configJson
            killSwitch = cfg.optBoolean("killSwitch", false)

            // Прямой режим AmneziaWG — отдельный путь (libwg-go поверх TUN, без xray).
            if (cfg.has("awg")) {
                if (!startAwg(cfg)) return
            } else {
                // TUN поднимаем один раз; при реконнекте переиспользуем (без повторного
                // запроса разрешения VPN).
                tun = buildTun(cfg, "10.10.0.2", MTU, DNS) ?: run {
                    fail("Не удалось создать TUN")
                    return
                }
                startCore(cfg)

                // Подтверждаем, что туннель реально достаёт до сервера (а не просто
                // поднялся TUN): пробный HTTP-запрос через SOCKS Xray.
                if (!ProxyProbe.reachable(SOCKS_PORT, 6000)) {
                    fail("Не удалось подключиться к серверу")
                    return
                }
            }

            publishStage("connected")
            registerDefaultNetworkCallback()
            startWatchdog()
            Log.i(TAG, "VPN подключён")
        } catch (e: Exception) {
            Log.e(TAG, "Ошибка подключения", e)
            fail(e.message ?: "Ошибка подключения")
        }
    }

    /** Поднимает ядро Xray + tun2socks поверх уже существующего TUN. */
    private fun startCore(cfg: JSONObject) {
        val conn = cfg.getJSONObject("connection")
        val xrayConfig = XrayConfigBuilder.build(
            socksPort = SOCKS_PORT,
            uuid = conn.getString("uuid"),
            address = conn.getString("address"),
            port = conn.getInt("port"),
            sni = conn.getString("sni"),
            wsPath = conn.optString("wsPath", ""),
            wsHost = conn.optString("wsHost", ""),
            bypassEnabled = cfg.optBoolean("bypassEnabled", true),
            bypassDomains = cfg.optJSONArray("bypassDomains").toStringList(),
            security = conn.optString("security", "tls"),
            network = conn.optString("network", "xhttp"),
            flow = conn.optString("flow", ""),
            publicKey = conn.optString("publicKey", ""),
            shortId = conn.optString("shortId", ""),
            fingerprint = conn.optString("fingerprint", "chrome"),
        )
        xray = XrayCore(onStatus = { Log.i(TAG, "xray: $it") }).also { it.start(xrayConfig) }
        tun2socks = Tun2socks().also { it.start(filesDir, tun!!.fd, SOCKS_PORT, MTU, DNS) }
    }

    /**
     * Прямой режим AmneziaWG: строит TUN (адрес/MTU из awg-конфига), отдаёт его fd
     * в libwg-go и protect-ит UDP-сокет туннеля (мимо самого туннеля). Возвращает
     * false и переводит в ошибку, если запуск/рукопожатие не удались.
     */
    private fun startAwg(cfg: JSONObject): Boolean {
        if (!AwgCore.available) {
            fail("Прямой режим недоступен в этой сборке")
            return false
        }
        val awg = cfg.getJSONObject("awg")
        val mtu = awg.optInt("mtu", 1376)
        val pfd = buildTun(cfg, awg.getString("address"), mtu, DNS) ?: run {
            fail("Не удалось создать TUN")
            return false
        }
        // Передаём fd в Go (он становится владельцем и сам закроет на wgTurnOff).
        val fd = pfd.detachFd()
        val handle = AwgCore.wgTurnOn(AWG_IFACE, fd, buildAwgUapi(awg))
        if (handle < 0) {
            fail("Не удалось запустить AmneziaWG")
            return false
        }
        awgHandle = handle
        // UDP-сокет туннеля должен идти мимо самого туннеля.
        AwgCore.wgGetSocketV4(handle).let { if (it > 0) protect(it) }
        AwgCore.wgGetSocketV6(handle).let { if (it > 0) protect(it) }
        try { setUnderlyingNetworks(activeNetwork?.let { arrayOf(it) }) } catch (_: Exception) {}
        if (!awgHandshake(handle, 8000)) {
            fail("Сервер не отвечает (нет рукопожатия)")
            return false
        }
        return true
    }

    /** Ждёт первого рукопожатия awg (last_handshake_time_sec > 0). */
    private fun awgHandshake(handle: Int, timeoutMs: Int): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val cfg = AwgCore.wgGetConfig(handle) ?: ""
            val m = Regex("last_handshake_time_sec=(\\d+)").find(cfg)
            if (m != null && (m.groupValues[1].toLongOrNull() ?: 0) > 0) return true
            Thread.sleep(250)
        }
        return false
    }

    /** UAPI-строка set для libwg-go: ключи в hex, awg-параметры, peer с endpoint. */
    private fun buildAwgUapi(awg: JSONObject): String {
        val p = awg.optJSONObject("params") ?: JSONObject()
        val sb = StringBuilder()
        sb.append("private_key=").append(b64ToHex(awg.getString("privateKey"))).append('\n')
        // awg-параметры обфускации (device-level, до peer).
        for (k in listOf("jc", "jmin", "jmax", "s1", "s2", "s3", "s4", "h1", "h2", "h3", "h4", "i1", "i2", "i3", "i4", "i5")) {
            if (p.has(k)) {
                val v = p.get(k).toString()
                if (v.isNotEmpty()) sb.append(k).append('=').append(v).append('\n')
            }
        }
        sb.append("public_key=").append(b64ToHex(awg.getString("serverPublicKey"))).append('\n')
        sb.append("endpoint=").append(awg.getString("endpoint")).append('\n')
        sb.append("persistent_keepalive_interval=25\n")
        sb.append("replace_allowed_ips=true\n")
        sb.append("allowed_ip=0.0.0.0/0\n")
        sb.append("allowed_ip=::/0\n")
        return sb.toString()
    }

    /** base64 (WG-ключ) → hex для UAPI. */
    private fun b64ToHex(b64: String): String {
        val bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) sb.append(String.format("%02x", b.toInt() and 0xff))
        return sb.toString()
    }

    /**
     * Бесшовный реконнект: перезапускаем ядро поверх существующего TUN — без сброса
     * VpnService и без повторного запроса разрешения. Вызывается при смене сети и
     * при падении Xray.
     */
    private fun reconnect(reason: String) {
        val cfgJson = savedConfig ?: return
        if (reconnecting) return
        // awg умеет роуминг сам: при смене сети НЕ рестартуем туннель (это давало
        // ~20с простоя на новое рукопожатие), а лишь заново protect-им UDP-сокет на
        // новую сеть — WireGuard продолжает работать поверх неё.
        if (awgHandle != null) {
            awgRebind(reason)
            return
        }
        if (tun == null) return
        reconnecting = true
        scope.launch {
            try {
                Log.i(TAG, "Реконнект ($reason)")
                publishStage("connecting")
                tun2socks?.stop(); tun2socks = null
                xray?.stop(); xray = null
                startCore(JSONObject(cfgJson))
                if (ProxyProbe.reachable(SOCKS_PORT, 6000)) {
                    publishStage("connected")
                    Log.i(TAG, "Реконнект успешен")
                } else {
                    // Сети пока нет — остаёмся в "connecting", восстановимся по
                    // событию доступности сети.
                    Log.w(TAG, "Реконнект: сервер недоступен, ждём сеть")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Реконнект-ошибка", e)
            } finally {
                reconnecting = false
            }
        }
    }

    /**
     * awg-роуминг при смене сети: заново protect-им UDP-сокет туннеля (он был
     * привязан к старой, уже мёртвой сети) и сообщаем системе подлежащую сеть.
     * Без рестарта и нового рукопожатия — WG продолжает работать поверх новой сети.
     */
    private fun awgRebind(reason: String) {
        val h = awgHandle ?: return
        try {
            AwgCore.wgGetSocketV4(h).let { if (it > 0) protect(it) }
            AwgCore.wgGetSocketV6(h).let { if (it > 0) protect(it) }
            setUnderlyingNetworks(activeNetwork?.let { arrayOf(it) })
            publishStage("connected")
            Log.i(TAG, "awg rebind на новую сеть ($reason)")
        } catch (e: Exception) {
            Log.w(TAG, "awg rebind: ${e.message}")
        }
    }

    /** Следим за сменой сети (Wi-Fi↔моб.): перезапускаем ядро под новый интерфейс. */
    private fun registerDefaultNetworkCallback() {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        connectivityManager = cm
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                activeNetwork = network
                // Первое событие — текущая сеть сразу после connect (реконнект не нужен);
                // все последующие (смена/возврат сети) — реконнект.
                if (netPrimed) reconnect("сеть появилась/сменилась") else netPrimed = true
            }

            override fun onLost(network: Network) {
                if (network == activeNetwork) {
                    activeNetwork = null
                    if (tun != null || awgHandle != null) publishStage("connecting")
                }
            }
        }
        netCallback = cb
        try {
            cm.registerDefaultNetworkCallback(cb)
        } catch (_: Exception) {}
    }

    private fun unregisterNetworkCallback() {
        try {
            netCallback?.let { connectivityManager?.unregisterNetworkCallback(it) }
        } catch (_: Exception) {}
        netCallback = null
        activeNetwork = null
        netPrimed = false
    }

    /** Сторож: если ядро Xray упало — поднимаем заново (дёшево, без сети). */
    private fun startWatchdog() {
        watchdog?.cancel()
        watchdog = scope.launch {
            while (isActive) {
                delay(20_000)
                // awg: ядро в Go, рукопожатие держит сам WG — сторож не нужен.
                if (awgHandle != null) continue
                if (tun == null) break
                val core = xray
                if (core != null && !core.isRunning && !reconnecting) {
                    reconnect("xray не запущен")
                }
            }
        }
    }

    private fun buildTun(cfg: JSONObject, address: String, mtu: Int, dns: String): ParcelFileDescriptor? {
        val builder = Builder()
            .setSession("Unway")
            .setMtu(mtu)
            .addAddress(address, 32)
            .addDnsServer(dns)
            .addRoute("0.0.0.0", 0)
            .addRoute("::", 0)

        val splitEnabled = cfg.optBoolean("splitEnabled", false)
        val splitMode = cfg.optString("splitMode", "exclude")
        val splitApps = cfg.optJSONArray("splitApps").toStringList()
        val bypassEnabled = cfg.optBoolean("bypassEnabled", true)
        val bypassApps = if (bypassEnabled) cfg.optJSONArray("bypassApps").toStringList() else emptyList()

        // Логика per-app:
        //  include: туннелируем только выбранные (за вычетом обходимых);
        //  exclude: туннелируем всё, кроме выбранных и обходимых;
        //  без split: всё, кроме обходимых.
        when {
            splitEnabled && splitMode == "include" -> {
                val allow = splitApps.toSet() - bypassApps.toSet()
                allow.forEach { addAllowedSafe(builder, it) }
                // себя не туннелируем
                if (allow.isEmpty()) addAllowedSafe(builder, "__none__")
            }
            splitEnabled && splitMode == "exclude" -> {
                (splitApps.toSet() + bypassApps.toSet()).forEach { addDisallowedSafe(builder, it) }
                addDisallowedSafe(builder, packageName)
            }
            else -> {
                bypassApps.forEach { addDisallowedSafe(builder, it) }
                addDisallowedSafe(builder, packageName)
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false)
        }
        return builder.establish()
    }

    private fun addAllowedSafe(b: Builder, pkg: String) {
        if (pkg == "__none__") return
        try { b.addAllowedApplication(pkg) } catch (_: Exception) {}
    }

    private fun addDisallowedSafe(b: Builder, pkg: String) {
        try { b.addDisallowedApplication(pkg) } catch (_: Exception) {}
    }

    /**
     * Публикует статус в UI-процесс через broadcast: сервис живёт в отдельном
     * процессе :vpn (чтобы Go-рантаймы xray и awg не сталкивались), поэтому
     * EventChannel-sink в основном процессе напрямую недоступен.
     */
    private fun publishStage(stage: String, message: String? = null) {
        val i = Intent(ACTION_STATUS).apply {
            setPackage(packageName)
            putExtra("stage", stage)
            if (message != null) putExtra("message", message)
        }
        sendBroadcast(i)
    }

    private fun disconnect() {
        publishStage("disconnecting")
        watchdog?.cancel(); watchdog = null
        unregisterNetworkCallback()
        savedConfig = null
        tun2socks?.stop(); tun2socks = null
        xray?.stop(); xray = null
        awgHandle?.let { try { AwgCore.wgTurnOff(it) } catch (_: Exception) {} }; awgHandle = null
        try { tun?.close() } catch (_: Exception) {}
        tun = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        publishStage("disconnected")
        stopSelf()
        Log.i(TAG, "VPN отключён")
        // Убиваем процесс :vpn, чтобы СЛЕДУЮЩИЙ коннект стартовал с чистым Go-рантаймом.
        // xray (libgojni) и awg (libwg-go) держат каждый свой Go-рантайм — два в одном
        // процессе несовместимы (SIGSEGV при переключении режимов). Задержка — чтобы
        // broadcast "disconnected" успел дойти до UI-процесса.
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            android.os.Process.killProcess(android.os.Process.myPid())
        }, 600)
    }

    private fun fail(message: String) {
        publishStage("error", message)
        if (killSwitch && tun != null) {
            // Kill switch: оставляем TUN поднятым — трафик блокируется (нет рабочего ядра).
            Log.w(TAG, "Kill switch активен: трафик заблокирован")
        } else {
            disconnect()
        }
    }

    override fun onRevoke() {
        // Пользователь отозвал разрешение VPN в системе.
        disconnect()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun startForegroundNotification() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "VPN", NotificationManager.IMPORTANCE_LOW),
            )
        }
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = Notification.Builder(this, CHANNEL)
            .setContentTitle("Unway")
            .setContentText("VPN активен")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pi)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    companion object {
        private const val TAG = "VpnConnectionService"
        private const val CHANNEL = "vpncdn_vpn"
        const val ACTION_STATUS = "com.vpncdn.client.VPN_STATUS"
        private const val NOTIF_ID = 1001
        private const val SOCKS_PORT = 10808
        private const val AWG_IFACE = "unway-direct"
        // 1280: VLESS+XHTTP+TLS поверх CDN добавляют большую обёртку; 1500 на TUN
        // приводил к фрагментации/потерям → низкая скорость, рывки, скачки пинга.
        private const val MTU = 1280
        private const val DNS = "1.1.1.1"
        const val ACTION_CONNECT = "com.vpncdn.client.CONNECT"
        const val ACTION_DISCONNECT = "com.vpncdn.client.DISCONNECT"
        const val EXTRA_CONFIG = "config"
        const val KEY_LAST_CONFIG = "last_vpn_config"
    }
}

/** JSONArray → List<String> (null-safe). */
private fun org.json.JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    val out = ArrayList<String>(length())
    for (i in 0 until length()) out.add(getString(i))
    return out
}
