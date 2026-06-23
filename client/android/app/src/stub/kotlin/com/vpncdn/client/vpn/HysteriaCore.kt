package com.vpncdn.client.vpn

import android.util.Log
import java.io.File

/** (flavor stub) Заглушка — без нативного бинаря Hysteria2. */
class HysteriaCore(
    private val nativeLibDir: String,
    private val onStatus: (String) -> Unit,
) {
    val isRunning: Boolean get() = false

    fun start(filesDir: File, configJson: String) {
        Log.w(TAG, "stub: Hysteria2 недоступен в этой сборке")
    }

    fun stop() {}

    companion object {
        private const val TAG = "HysteriaCore"
    }
}
