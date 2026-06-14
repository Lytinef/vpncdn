package com.vpncdn.client.vpn

import android.util.Log
import libv2ray.Libv2ray
import libv2ray.V2RayPoint
import libv2ray.V2RayVPNServiceSupportsSet

/**
 * (flavor full) Обёртка над Xray-core (gomobile-биндинг libv2ray, см. xray/MOBILE.md).
 *
 * Запускает Xray с SOCKS-инбаундом и VLESS+WS+TLS аутбаундом.
 * protect() защищает сокеты ядра от попадания обратно в туннель — это
 * обязательно для outbound «direct» (домены обхода) и для самого VLESS.
 */
class XrayCore(
    private val protector: (Long) -> Boolean,
    private val onStatus: (String) -> Unit,
) {
    private var point: V2RayPoint? = null

    val isRunning: Boolean get() = point?.isRunning ?: false

    fun start(configJson: String, proxyDomainPort: String) {
        val supportsSet = object : V2RayVPNServiceSupportsSet {
            override fun setup(s: String): Long = 0
            override fun prepare(): Long = 0
            override fun shutdown(): Long = 0
            override fun protect(fd: Long): Boolean = protector(fd)
            override fun onEmitStatus(code: Long, message: String?): Long {
                onStatus(message ?: "")
                return 0
            }
        }
        val p = Libv2ray.newV2RayPoint(supportsSet, false)
        p.configureFileContent = configJson
        p.domainName = proxyDomainPort
        p.runLoop(false)
        point = p
        Log.i(TAG, "Xray запущен")
    }

    fun stop() {
        try {
            point?.stopLoop()
        } catch (e: Exception) {
            Log.w(TAG, "stopLoop: ${e.message}")
        }
        point = null
    }

    /** Накопленный трафик аутбаунда proxy (uplink/downlink) в байтах. */
    fun queryTraffic(): Pair<Long, Long> {
        val p = point ?: return 0L to 0L
        return try {
            val up = p.queryStats("proxy", "uplink")
            val down = p.queryStats("proxy", "downlink")
            up to down
        } catch (_: Exception) {
            0L to 0L
        }
    }

    companion object {
        private const val TAG = "XrayCore"
    }
}
