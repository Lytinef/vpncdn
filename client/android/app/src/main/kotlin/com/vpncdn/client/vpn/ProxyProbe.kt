package com.vpncdn.client.vpn

import java.net.InetSocketAddress
import java.net.Proxy
import java.net.Socket

/**
 * Проверка реальной доступности через локальный SOCKS5 Xray (127.0.0.1:port).
 * Используется чтобы:
 *  - подтвердить, что туннель действительно достаёт до сервера (а не просто
 *    поднялся TUN) — иначе кнопка показывала «Подключено» даже без интернета;
 *  - измерять пинг по запросу пользователя (как в v2rayNG/Happ).
 */
object ProxyProbe {
    /** TCP-хендшейк до host:port через SOCKS5. Возвращает задержку в мс или -1 при ошибке. */
    fun latencyMs(socksPort: Int, host: String, port: Int, timeoutMs: Int): Long {
        return try {
            val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress("127.0.0.1", socksPort))
            val start = System.nanoTime()
            Socket(proxy).use { s ->
                s.connect(InetSocketAddress(host, port), timeoutMs)
            }
            (System.nanoTime() - start) / 1_000_000
        } catch (_: Exception) {
            -1
        }
    }

    /** Достижим ли внешний мир через туннель (пара запасных хостов). */
    fun reachable(socksPort: Int, timeoutMs: Int): Boolean {
        return latencyMs(socksPort, "1.1.1.1", 443, timeoutMs) >= 0 ||
            latencyMs(socksPort, "8.8.8.8", 443, timeoutMs) >= 0
    }
}
