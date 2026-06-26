package com.vpncdn.client.vpn

import android.util.Log

/** (flavor stub) Заглушка — без нативного libwg-go.so (прямой awg недоступен). */
object AwgCore {
    val available = false

    fun wgTurnOn(ifName: String, tunFd: Int, settings: String): Int {
        Log.w("AwgCore", "stub: AmneziaWG недоступен в этой сборке")
        return -1
    }

    fun wgTurnOff(handle: Int) {}
    fun wgGetSocketV4(handle: Int): Int = -1
    fun wgGetSocketV6(handle: Int): Int = -1
    fun wgGetConfig(handle: Int): String? = null
    fun wgVersion(): String = ""
}
