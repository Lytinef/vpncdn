package com.vpncdn.client

import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.EventChannel

/**
 * Шина состояния VPN: связывает фоновый VpnService с Flutter через EventChannel.
 * Все обращения к EventSink выполняются в главном потоке.
 */
object VpnBus {
    private val main = Handler(Looper.getMainLooper())

    @Volatile var stage: String = "disconnected"
        private set

    @Volatile var lastStats: Map<String, Any> =
        mapOf("pingMs" to 0, "downloadMbps" to 0.0, "uploadMbps" to 0.0)
        private set

    private var statusSink: EventChannel.EventSink? = null
    private var statsSink: EventChannel.EventSink? = null

    fun bindStatus(sink: EventChannel.EventSink?) {
        statusSink = sink
        // Сразу отдаём текущее состояние новому подписчику.
        sink?.let { emitStatus(it) }
    }

    fun bindStats(sink: EventChannel.EventSink?) {
        statsSink = sink
        sink?.let { it.success(lastStats) }
    }

    fun setStage(stage: String, message: String? = null) {
        this.stage = stage
        main.post { statusSink?.let { emitStatus(it, message) } }
    }

    fun setStats(pingMs: Int, downloadMbps: Double, uploadMbps: Double) {
        lastStats = mapOf(
            "pingMs" to pingMs,
            "downloadMbps" to downloadMbps,
            "uploadMbps" to uploadMbps,
        )
        main.post { statsSink?.success(lastStats) }
    }

    private fun emitStatus(sink: EventChannel.EventSink, message: String? = null) {
        sink.success(mapOf("stage" to stage, "message" to message))
    }
}
