package com.vpncdn.client.vpn

import com.vpncdn.client.VpnBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Периодически замеряет пинг и скорость загрузки/отдачи и публикует через VpnBus.
 *  - скорость: дельта накопленного трафика proxy за интервал;
 *  - пинг: TCP-хендшейк до публичного хоста (через туннель).
 */
class StatsCollector(
    private val scope: CoroutineScope,
    private val trafficProvider: () -> Pair<Long, Long>, // uplink, downlink (накопительно)
) {
    private var job: kotlinx.coroutines.Job? = null
    private val intervalMs = 1500L

    fun start() {
        var lastUp = 0L
        var lastDown = 0L
        var lastTs = System.currentTimeMillis()
        job = scope.launch(Dispatchers.IO) {
            // первичная инициализация базовых значений
            trafficProvider().let { lastUp = it.first; lastDown = it.second }
            while (isActive) {
                delay(intervalMs)
                val now = System.currentTimeMillis()
                val (up, down) = trafficProvider()
                val dt = (now - lastTs).coerceAtLeast(1) / 1000.0
                val upMbps = bytesToMbps(up - lastUp, dt)
                val downMbps = bytesToMbps(down - lastDown, dt)
                lastUp = up; lastDown = down; lastTs = now

                val ping = measurePing()
                VpnBus.setStats(ping, round1(downMbps), round1(upMbps))
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private fun bytesToMbps(deltaBytes: Long, seconds: Double): Double {
        if (deltaBytes <= 0 || seconds <= 0) return 0.0
        return (deltaBytes * 8.0) / 1_000_000.0 / seconds
    }

    private fun round1(v: Double): Double = Math.round(v * 10.0) / 10.0

    private fun measurePing(): Int {
        return try {
            val start = System.nanoTime()
            Socket().use { s ->
                s.connect(InetSocketAddress("1.1.1.1", 443), 2000)
            }
            ((System.nanoTime() - start) / 1_000_000).toInt()
        } catch (_: Exception) {
            0
        }
    }
}
