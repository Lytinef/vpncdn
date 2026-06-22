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
                    VpnBus.setStage("connecting")
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

            // TUN поднимаем один раз; при реконнекте переиспользуем (без повторного
            // запроса разрешения VPN).
            tun = buildTun(cfg, MTU, DNS) ?: run {
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

            VpnBus.setStage("connected")
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
            wsPath = conn.getString("wsPath"),
            wsHost = conn.getString("wsHost"),
            bypassEnabled = cfg.optBoolean("bypassEnabled", true),
            bypassDomains = cfg.optJSONArray("bypassDomains").toStringList(),
        )
        xray = XrayCore(onStatus = { Log.i(TAG, "xray: $it") }).also { it.start(xrayConfig) }
        tun2socks = Tun2socks().also { it.start(filesDir, tun!!.fd, SOCKS_PORT, MTU, DNS) }
    }

    /**
     * Бесшовный реконнект: перезапускаем ядро поверх существующего TUN — без сброса
     * VpnService и без повторного запроса разрешения. Вызывается при смене сети и
     * при падении Xray.
     */
    private fun reconnect(reason: String) {
        val cfgJson = savedConfig ?: return
        if (tun == null || reconnecting) return
        reconnecting = true
        scope.launch {
            try {
                Log.i(TAG, "Реконнект ($reason)")
                VpnBus.setStage("connecting")
                tun2socks?.stop(); tun2socks = null
                xray?.stop(); xray = null
                startCore(JSONObject(cfgJson))
                if (ProxyProbe.reachable(SOCKS_PORT, 6000)) {
                    VpnBus.setStage("connected")
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
                    if (tun != null) VpnBus.setStage("connecting")
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
                if (tun == null) break
                val core = xray
                if (core != null && !core.isRunning && !reconnecting) {
                    reconnect("xray не запущен")
                }
            }
        }
    }

    private fun buildTun(cfg: JSONObject, mtu: Int, dns: String): ParcelFileDescriptor? {
        val builder = Builder()
            .setSession("Unway")
            .setMtu(mtu)
            .addAddress("10.10.0.2", 32)
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

    private fun disconnect() {
        VpnBus.setStage("disconnecting")
        watchdog?.cancel(); watchdog = null
        unregisterNetworkCallback()
        savedConfig = null
        tun2socks?.stop(); tun2socks = null
        xray?.stop(); xray = null
        try { tun?.close() } catch (_: Exception) {}
        tun = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        VpnBus.setStage("disconnected")
        stopSelf()
        Log.i(TAG, "VPN отключён")
    }

    private fun fail(message: String) {
        VpnBus.setStage("error", message)
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
        private const val NOTIF_ID = 1001
        private const val SOCKS_PORT = 10808
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
