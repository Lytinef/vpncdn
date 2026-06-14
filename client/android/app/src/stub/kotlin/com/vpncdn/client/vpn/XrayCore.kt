package com.vpncdn.client.vpn

/**
 * (flavor stub) Заглушка Xray-ядра — собирается без нативных библиотек.
 * Вход, подписка и весь UI работают; сам туннель недоступен.
 * Для рабочего VPN соберите flavor `full` с libv2ray.aar и tun2socks
 * (см. xray/MOBILE.md).
 */
class XrayCore(
    private val protector: (Long) -> Boolean,
    private val onStatus: (String) -> Unit,
) {
    val isRunning: Boolean = false

    fun start(configJson: String, proxyDomainPort: String) {
        throw RuntimeException(STUB_MESSAGE)
    }

    fun stop() {}

    fun queryTraffic(): Pair<Long, Long> = 0L to 0L

    companion object {
        const val STUB_MESSAGE =
            "Это stub-сборка без VPN-ядра. Соберите flavor 'full' с нативными " +
                "библиотеками (libv2ray.aar, tun2socks) — см. xray/MOBILE.md."
    }
}
