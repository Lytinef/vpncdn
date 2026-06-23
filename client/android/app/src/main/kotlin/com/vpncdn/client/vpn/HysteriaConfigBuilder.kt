package com.vpncdn.client.vpn

import org.json.JSONObject

/**
 * Конфиг клиента Hysteria2 (прямой режим, UDP/QUIC) с SOCKS-инбаундом на
 * 127.0.0.1:socksPort — туда tun2socks/hev отдаёт трафик из TUN. Сервер
 * указываем уже отрезолвленным IP (host-route уводит его мимо туннеля).
 * Self-signed cert на сервере → insecure + pinSHA256 (защита от MITM).
 */
object HysteriaConfigBuilder {

    fun build(
        socksPort: Int,
        server: String,
        port: Int,
        auth: String,
        sni: String,
        certPin: String,
        insecure: Boolean,
    ): String {
        val tls = JSONObject()
            .put("sni", sni)
            .put("insecure", insecure)
        if (certPin.isNotEmpty()) tls.put("pinSHA256", certPin)

        return JSONObject()
            .put("server", "$server:$port")
            .put("auth", auth)
            .put("tls", tls)
            .put("socks5", JSONObject().put("listen", "127.0.0.1:$socksPort"))
            // Окна QUIC под высокий BDP международного пути — выше throughput.
            .put(
                "quic",
                JSONObject()
                    .put("initStreamReceiveWindow", 8388608)
                    .put("maxStreamReceiveWindow", 8388608)
                    .put("initConnReceiveWindow", 20971520)
                    .put("maxConnReceiveWindow", 20971520),
            )
            .put("fastOpen", true)
            .toString()
    }
}
