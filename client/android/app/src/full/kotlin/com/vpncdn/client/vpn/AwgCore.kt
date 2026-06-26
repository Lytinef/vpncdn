package com.vpncdn.client.vpn

import android.util.Log

/**
 * (flavor full) Прямой режим AmneziaWG: JNI-обёртка над libwg-go.so
 * (amneziawg-go + наш jni.c). TUN-fd берётся из VpnService, конфиг — UAPI-строка
 * с awg-параметрами (jc/.../i1). Возвращаемый handle используется для wgTurnOff
 * и получения fd UDP-сокета (его нужно protect-нуть мимо туннеля).
 */
object AwgCore {
    var available = false
        private set

    init {
        try {
            System.loadLibrary("wg-go")
            available = true
        } catch (e: Throwable) {
            Log.e("AwgCore", "libwg-go.so не загрузилась", e)
            available = false
        }
    }

    external fun wgTurnOn(ifName: String, tunFd: Int, settings: String): Int
    external fun wgTurnOff(handle: Int)
    external fun wgGetSocketV4(handle: Int): Int
    external fun wgGetSocketV6(handle: Int): Int
    external fun wgGetConfig(handle: Int): String?
    external fun wgVersion(): String
}
