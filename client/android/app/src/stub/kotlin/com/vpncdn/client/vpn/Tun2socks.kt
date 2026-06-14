package com.vpncdn.client.vpn

import java.io.File

/**
 * (flavor stub) Заглушка моста TUN → SOCKS. Не выполняет туннелирование.
 */
class Tun2socks {
    fun start(filesDir: File, tunFd: Int, socksPort: Int, mtu: Int, dns: String) {
        // no-op в stub-сборке
    }

    fun stop() {}

    fun stats(): LongArray = longArrayOf(0, 0)
}
