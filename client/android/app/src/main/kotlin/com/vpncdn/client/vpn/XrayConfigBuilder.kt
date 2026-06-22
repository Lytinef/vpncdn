package com.vpncdn.client.vpn

import org.json.JSONArray
import org.json.JSONObject

/**
 * Формирует JSON-конфигурацию Xray-core для клиента:
 *  - inbound SOCKS5 на 127.0.0.1:<socksPort> (туда tun2socks отдаёт трафик из TUN);
 *  - outbound VLESS + WebSocket + TLS на CDN-домен (NGENIX);
 *  - direct (freedom) и block (blackhole);
 *  - правила маршрутизации: домены обхода -> direct (мимо VPN), остальное -> proxy.
 */
object XrayConfigBuilder {

    fun build(
        socksPort: Int,
        uuid: String,
        address: String,
        port: Int,
        sni: String,
        wsPath: String,
        wsHost: String,
        bypassEnabled: Boolean,
        bypassDomains: List<String>,
    ): String {
        val root = JSONObject()
        root.put("log", JSONObject().put("loglevel", "warning"))

        // ── inbound SOCKS ──
        val inbound = JSONObject()
            .put("tag", "socks-in")
            .put("listen", "127.0.0.1")
            .put("port", socksPort)
            .put("protocol", "socks")
            .put("settings", JSONObject().put("udp", true).put("auth", "noauth"))
            .put(
                "sniffing",
                JSONObject()
                    .put("enabled", true)
                    .put("destOverride", JSONArray(listOf("http", "tls", "quic"))),
            )
        root.put("inbounds", JSONArray().put(inbound))

        // ── outbound VLESS (proxy) ──
        val user = JSONObject()
            .put("id", uuid)
            .put("encryption", "none")
            .put("level", 0)
        val vnext = JSONObject()
            .put("address", address)
            .put("port", port)
            .put("users", JSONArray().put(user))
        val proxySettings = JSONObject().put("vnext", JSONArray().put(vnext))

        val tlsSettings = JSONObject()
            .put("serverName", sni)
            .put("allowInsecure", false)
            .put("alpn", JSONArray(listOf("h2", "http/1.1")))
        // XHTTP (SplitHTTP) — современный CDN-транспорт: устойчивее WS к буферизации/
        // таймаутам CDN, работает по HTTP/1.1. mode=auto сам подбирает режим.
        val xhttpSettings = JSONObject()
            .put("path", wsPath)
            .put("host", wsHost)
            .put("mode", "auto")
        // TCP keepalive: пробы только при простое соединения, на throughput не влияют.
        val sockopt = JSONObject()
            .put("tcpKeepAliveIdle", 30)
            .put("tcpKeepAliveInterval", 15)
        val stream = JSONObject()
            .put("network", "xhttp")
            .put("security", "tls")
            .put("xhttpSettings", xhttpSettings)
            .put("tlsSettings", tlsSettings)
            .put("sockopt", sockopt)

        val proxy = JSONObject()
            .put("tag", "proxy")
            .put("protocol", "vless")
            .put("settings", proxySettings)
            .put("streamSettings", stream)

        val direct = JSONObject().put("tag", "direct").put("protocol", "freedom")
        val block = JSONObject().put("tag", "block").put("protocol", "blackhole")
        root.put("outbounds", JSONArray().put(proxy).put(direct).put(block))

        // ── routing ──
        val rules = JSONArray()
        // Приватные сети — напрямую (явные CIDR, без geoip.dat — его нет в приложении).
        rules.put(
            JSONObject()
                .put("type", "field")
                .put(
                    "ip",
                    JSONArray(
                        listOf(
                            "10.0.0.0/8",
                            "172.16.0.0/12",
                            "192.168.0.0/16",
                            "127.0.0.0/8",
                            "::1/128",
                            "fc00::/7",
                            "fe80::/10",
                        ),
                    ),
                )
                .put("outboundTag", "direct"),
        )
        // Обход блокировок: РФ-домены идут мимо туннеля.
        // Не-ASCII (IDN) домены вроде "честныйзнак.рф" роняют xray-роутер (нужен
        // punycode) — фильтруем; пустые тоже.
        val asciiBypass = bypassDomains.filter { it.isNotBlank() && it.all { ch -> ch.code < 128 } }
        if (bypassEnabled && asciiBypass.isNotEmpty()) {
            val domains = JSONArray()
            asciiBypass.forEach { domains.put("domain:$it") }
            rules.put(
                JSONObject()
                    .put("type", "field")
                    .put("domain", domains)
                    .put("outboundTag", "direct"),
            )
        }
        val routing = JSONObject()
            .put("domainStrategy", "AsIs")
            .put("rules", rules)
        root.put("routing", routing)

        // ── stats / policy (для метрик скорости через Xray API) ──
        root.put("stats", JSONObject())
        root.put(
            "policy",
            JSONObject().put(
                "system",
                JSONObject().put("statsOutboundUplink", true).put("statsOutboundDownlink", true),
            ),
        )

        return root.toString()
    }
}
