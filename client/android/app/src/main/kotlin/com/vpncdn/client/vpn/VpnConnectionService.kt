package com.vpncdn.client.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
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
            val conn = cfg.getJSONObject("connection")
            killSwitch = cfg.optBoolean("killSwitch", false)

            val socksPort = 10808
            val mtu = 1500
            val dns = "1.1.1.1"

            // 1) TUN-интерфейс с правилами per-app.
            tun = buildTun(cfg, mtu, dns) ?: run {
                fail("Не удалось создать TUN")
                return
            }

            // 2) Xray-core.
            val xrayConfig = XrayConfigBuilder.build(
                socksPort = socksPort,
                uuid = conn.getString("uuid"),
                address = conn.getString("address"),
                port = conn.getInt("port"),
                sni = conn.getString("sni"),
                wsPath = conn.getString("wsPath"),
                wsHost = conn.getString("wsHost"),
                bypassEnabled = cfg.optBoolean("bypassEnabled", true),
                bypassDomains = cfg.optJSONArray("bypassDomains").toStringList(),
            )
            xray = XrayCore(
                onStatus = { Log.i(TAG, "xray: $it") },
            ).also {
                it.start(xrayConfig)
            }

            // 3) tun2socks: TUN → SOCKS Xray.
            tun2socks = Tun2socks().also {
                it.start(filesDir, tun!!.fd, socksPort, mtu, dns)
            }

            // 4) Подтверждаем, что туннель реально достаёт до сервера (а не просто
            // поднялся TUN): пробное соединение через SOCKS Xray. Иначе «Подключено»
            // показывалось бы даже без интернета.
            if (!ProxyProbe.reachable(socksPort, 6000)) {
                fail("Не удалось подключиться к серверу")
                return
            }

            VpnBus.setStage("connected")
            Log.i(TAG, "VPN подключён")
        } catch (e: Exception) {
            Log.e(TAG, "Ошибка подключения", e)
            fail(e.message ?: "Ошибка подключения")
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
