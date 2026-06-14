package com.vpncdn.client.vpn

import android.util.Log
import java.io.File

/**
 * (flavor full) Мост TUN → SOCKS5 на базе hev-socks5-tunnel (см. xray/MOBILE.md).
 *
 * Читает пакеты из TUN-устройства (fd от VpnService) и форвардит их в локальный
 * SOCKS-инбаунд Xray (127.0.0.1:socksPort).
 */
class Tun2socks {
    private var running = false

    fun start(filesDir: File, tunFd: Int, socksPort: Int, mtu: Int, dns: String) {
        val configFile = File(filesDir, "tun2socks.yml")
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
              log-level: warn
            dns:
              servers:
                - $dns
            """.trimIndent(),
        )
        TProxyStartService(configFile.absolutePath, tunFd)
        running = true
        Log.i(TAG, "tun2socks запущен (socks 127.0.0.1:$socksPort)")
    }

    fun stop() {
        if (!running) return
        try {
            TProxyStopService()
        } catch (e: Exception) {
            Log.w(TAG, "stop: ${e.message}")
        }
        running = false
    }

    /** [tx, rx] байт через туннель — для оценки скорости. */
    fun stats(): LongArray = try {
        TProxyGetStats()
    } catch (_: Exception) {
        longArrayOf(0, 0)
    }

    private external fun TProxyStartService(configPath: String, fd: Int)
    private external fun TProxyStopService()
    private external fun TProxyGetStats(): LongArray

    companion object {
        private const val TAG = "Tun2socks"
        init {
            System.loadLibrary("hev-socks5-tunnel")
        }
    }
}
