package com.vpncdn.client.vpn

import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URL

/**
 * Проверка реальной доступности и задержки через локальный SOCKS5 Xray.
 * Делает настоящий HTTP-запрос (как url-test в v2rayNG/Happ): SOCKS-коннект Xray
 * может отвечать на CONNECT досрочно, поэтому простой TCP-хендшейк не доказывает
 * сквозную доступность и даёт неверный пинг — нужен полный round-trip с ответом.
 * Используется чтобы:
 *  - подтвердить, что туннель реально достаёт до сервера (а не просто поднялся
 *    TUN) — иначе кнопка показывала «Подключено» даже без интернета;
 *  - измерять пинг по запросу пользователя.
 */
object ProxyProbe {
    // 204 No Content — крошечный ответ, стандартный эндпоинт проверки связи.
    private const val TEST_URL = "https://www.gstatic.com/generate_204"

    /** Задержка сквозного HTTP-запроса через туннель в мс, либо -1 при ошибке. */
    fun latencyMs(socksPort: Int, timeoutMs: Int): Long {
        var conn: HttpURLConnection? = null
        return try {
            val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress("127.0.0.1", socksPort))
            val start = System.nanoTime()
            conn = (URL(TEST_URL).openConnection(proxy) as HttpURLConnection).apply {
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                useCaches = false
                requestMethod = "GET"
            }
            val code = conn.responseCode // форсирует полный запрос+ответ через туннель
            if (code in 200..399) (System.nanoTime() - start) / 1_000_000 else -1
        } catch (_: Exception) {
            -1
        } finally {
            conn?.disconnect()
        }
    }

    /** Достижим ли внешний мир через туннель. */
    fun reachable(socksPort: Int, timeoutMs: Int): Boolean = latencyMs(socksPort, timeoutMs) >= 0
}
