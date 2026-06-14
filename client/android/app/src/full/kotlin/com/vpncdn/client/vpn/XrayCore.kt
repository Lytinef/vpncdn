package com.vpncdn.client.vpn

import android.util.Log
import libv2ray.CoreCallbackHandler
import libv2ray.CoreController
import libv2ray.Libv2ray

/**
 * (flavor full) Обёртка над Xray-core (gomobile-биндинг AndroidLibXrayLite, см. xray/MOBILE.md).
 *
 * Запускает Xray с SOCKS-инбаундом и VLESS+WS+TLS аутбаундом.
 * Защита сокетов ядра от петли через туннель обеспечивается на уровне VpnService:
 * наше приложение исключено из VPN (addDisallowedApplication), поэтому исходящие
 * соединения Xray (он работает в нашем процессе) идут мимо туннеля.
 */
class XrayCore(
    private val onStatus: (String) -> Unit,
) {
    private var controller: CoreController? = null

    val isRunning: Boolean get() = controller?.isRunning ?: false

    fun start(configJson: String) {
        val handler = object : CoreCallbackHandler {
            override fun startup(): Long = 0
            override fun shutdown(): Long = 0
            override fun onEmitStatus(code: Long, message: String?): Long {
                onStatus(message ?: "")
                return 0
            }
        }
        val c = Libv2ray.newCoreController(handler)
        // tunFd=0 — TUN обрабатывает tun2socks, ядру TUN не передаём.
        c.startLoop(configJson, 0)
        controller = c
        Log.i(TAG, "Xray запущен")
    }

    fun stop() {
        try {
            controller?.stopLoop()
        } catch (e: Exception) {
            Log.w(TAG, "stopLoop: ${e.message}")
        }
        controller = null
    }

    /** Накопленный трафик аутбаунда proxy (uplink/downlink) в байтах. */
    fun queryTraffic(): Pair<Long, Long> {
        val c = controller ?: return 0L to 0L
        return try {
            c.queryStats("proxy", "uplink") to c.queryStats("proxy", "downlink")
        } catch (_: Exception) {
            0L to 0L
        }
    }

    companion object {
        private const val TAG = "XrayCore"
    }
}
