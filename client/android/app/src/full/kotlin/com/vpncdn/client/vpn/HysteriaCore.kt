package com.vpncdn.client.vpn

import android.util.Log
import java.io.File

/**
 * (flavor full) Прямой режим через Hysteria2: запускает бинарь hysteria как
 * подпроцесс (SOCKS на socksPort). Бинарь лежит в nativeLibraryDir как
 * libhysteria.so (распаковывается из APK, useLegacyPackaging=true).
 *
 * protect не нужен: приложение исключено из VPN (addDisallowedApplication),
 * подпроцесс работает под тем же UID → его UDP к серверу идёт мимо туннеля.
 */
class HysteriaCore(
    private val nativeLibDir: String,
    private val onStatus: (String) -> Unit,
) {
    private var process: Process? = null

    val isRunning: Boolean get() = process?.isAlive ?: false

    fun start(filesDir: File, configJson: String) {
        val cfg = File(filesDir, "hysteria.json").apply { writeText(configJson) }
        val bin = File(nativeLibDir, "libhysteria.so")
        if (!bin.exists()) {
            throw IllegalStateException("libhysteria.so не найден в $nativeLibDir")
        }
        val p = ProcessBuilder(bin.absolutePath, "client", "-c", cfg.absolutePath)
            .redirectErrorStream(true)
            .start()
        process = p
        Thread {
            try {
                p.inputStream.bufferedReader().forEachLine { onStatus(it) }
            } catch (_: Exception) {
            }
        }.apply { isDaemon = true }.start()
        Log.i(TAG, "hysteria запущен")
    }

    fun stop() {
        try {
            process?.destroy()
        } catch (e: Exception) {
            Log.w(TAG, "stop: ${e.message}")
        }
        process = null
    }

    companion object {
        private const val TAG = "HysteriaCore"
    }
}
