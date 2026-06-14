package com.vpncdn.client.vpn

import android.util.Log
import hev.htproxy.TProxyService
import java.io.File

/**
 * (flavor full) Мост TUN → SOCKS5 на базе hev-socks5-tunnel (см. xray/MOBILE.md).
 *
 * Читает пакеты из TUN (fd от VpnService) и форвардит в локальный SOCKS-инбаунд
 * Xray (127.0.0.1:socksPort). Рабочий поток управляется самой нативной библиотекой.
 */
class Tun2socks {
    private var running = false

    fun start(filesDir: File, tunFd: Int, socksPort: Int, mtu: Int, dns: String) {
        val configFile = File(filesDir, "tun2socks.yml")
        // Формат конфига hev-socks5-tunnel (см. conf/main.yml апстрима).
        configFile.writeText(
            """
            tunnel:
              mtu: $mtu
            socks5:
              port: $socksPort
              address: 127.0.0.1
              udp: 'udp'
            misc:
              task-stack-size: 20480
            """.trimIndent(),
        )
        TProxyService.TProxyStartService(configFile.absolutePath, tunFd)
        running = true
        Log.i(TAG, "tun2socks запущен (socks 127.0.0.1:$socksPort)")
    }

    fun stop() {
        if (!running) return
        try {
            TProxyService.TProxyStopService()
        } catch (e: Exception) {
            Log.w(TAG, "stop: ${e.message}")
        }
        running = false
    }

    /** [tx, rx] байт через туннель. */
    fun stats(): LongArray = try {
        TProxyService.TProxyGetStats()
    } catch (_: Exception) {
        longArrayOf(0, 0)
    }

    companion object {
        private const val TAG = "Tun2socks"
    }
}
