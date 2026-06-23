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
        security: String = "tls",
        network: String = "xhttp",
        flow: String = "",
        publicKey: String = "",
        shortId: String = "",
        fingerprint: String = "chrome",
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
        // flow (xtls-rprx-vision) ставится на пользователя только в прямом режиме.
        val user = JSONObject()
            .put("id", uuid)
            .put("encryption", "none")
            .put("level", 0)
        if (security == "reality" && flow.isNotEmpty()) user.put("flow", flow)
        val vnext = JSONObject()
            .put("address", address)
            .put("port", port)
            .put("users", JSONArray().put(user))
        val proxySettings = JSONObject().put("vnext", JSONArray().put(vnext))

        // TCP keepalive: пробы только при простое соединения, на throughput не влияют.
        val sockopt = JSONObject()
            .put("tcpKeepAliveIdle", 30)
            .put("tcpKeepAliveInterval", 15)

        val stream: JSONObject
        if (security == "reality") {
            // Прямой режим (мимо CDN): VLESS + XTLS-Vision + Reality.
            // Маскируется под настоящий TLS-сайт (serverName), минимум оверхеда → ниже пинг.
            val realitySettings = JSONObject()
                .put("serverName", sni)
                .put("publicKey", publicKey)
                .put("shortId", shortId)
                .put("fingerprint", if (fingerprint.isNotEmpty()) fingerprint else "chrome")
                .put("show", false)
            stream = JSONObject()
                .put("network", "tcp")
                .put("security", "reality")
                .put("realitySettings", realitySettings)
                .put("sockopt", sockopt)
        } else {
            // CDN: VLESS + XHTTP + TLS через NGENIX.
            // XHTTP (SplitHTTP) — устойчивее WS к буферизации/таймаутам CDN, HTTP/1.1.
            // xmux: несколько параллельных XHTTP-соединений + keepalive → меньше
            // head-of-line при потерях (всплески пинга) и обрывов длинных соединений.
            val xmux = JSONObject()
                .put("maxConcurrency", "16-32")
                .put("maxConnections", 0)
                .put("hMaxRequestTimes", "600-900")
                .put("hKeepAlivePeriod", 30)
            val xhttpSettings = JSONObject()
                .put("path", wsPath)
                .put("host", wsHost)
                .put("mode", "auto")
                .put("extra", JSONObject().put("xmux", xmux))
            // allowInsecure удалён в xray-core 26.x; по умолчанию сертификат и так
            // проверяется (CDN/NGENIX — валидный LE-серт), поле не нужно.
            val tlsSettings = JSONObject()
                .put("serverName", sni)
                .put("alpn", JSONArray(listOf("h2", "http/1.1")))
            stream = JSONObject()
                .put("network", "xhttp")
                .put("security", "tls")
                .put("xhttpSettings", xhttpSettings)
                .put("tlsSettings", tlsSettings)
                .put("sockopt", sockopt)
        }

        val proxy = JSONObject()
            .put("tag", "proxy")
            .put("protocol", "vless")
            .put("settings", proxySettings)
            .put("streamSettings", stream)

        // direct: freedom с domainStrategy=UseIP — после sniffing назначение
        // подменяется на домен, и freedom САМ резолвит его через прямой резолвер
        // приложения (приложение исключено из VPN). Иначе для обходимого домена
        // использовался бы IP, отрезолвленный через туннель (гео сервера) — сайт
        // открывался бы «как через VPN». Это чинит обход доменов на Android.
        val direct = JSONObject()
            .put("tag", "direct")
            .put("protocol", "freedom")
            .put("settings", JSONObject().put("domainStrategy", "UseIP"))
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
