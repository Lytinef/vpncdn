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
 *  - скорость: Xray QueryStats СБРАСЫВАет счётчик при чтении, т.е. возвращает
 *    трафик за интервал с прошлого опроса — это уже готовая дельта;
 *  - пинг: TCP-хендшейк до публичного хоста (через туннель).
 */
class StatsCollector(
    private val scope: CoroutineScope,
    private val trafficProvider: () -> Pair<Long, Long>, // uplink, downlink за интервал (дельта)
) {
    private var job: kotlinx.coroutines.Job? = null
    private val intervalMs = 2000L
    // Пинг дорогой (TCP-хендшейк через туннель будит радио) — делаем его реже,
    // чем замер скорости: раз в pingEveryNTicks тиков (≈ каждые 6 секунд).
    private val pingEveryNTicks = 3

    fun start() {
        job = scope.launch(Dispatchers.IO) {
            var lastTs = System.currentTimeMillis()
            var primed = false
            var tick = 0
            var lastPing = 0
            while (isActive) {
                // В фоне (экран погашен/приложение свёрнуто) не делаем ни пинга, ни замеров —
                // главный источник расхода батареи. Туннель при этом продолжает работать.
                if (!VpnBus.statsActive) {
                    primed = false
                    tick = 0
                    delay(4000)
                    continue
                }
                if (!primed) {
                    trafficProvider() // обнуляем счётчик после простоя, чтобы не было скачка
                    lastTs = System.currentTimeMillis()
                    primed = true
                    delay(intervalMs)
                    continue
                }
                delay(intervalMs)
                val now = System.currentTimeMillis()
                val (up, down) = trafficProvider() // уже дельта за интервал
                val dt = (now - lastTs).coerceAtLeast(1) / 1000.0
                lastTs = now

                // Пинг — не каждый тик (экономия батареи), между замерами держим прошлый.
                if (tick % pingEveryNTicks == 0) lastPing = measurePing()
                tick++
                VpnBus.setStats(lastPing, round1(bytesToMbps(down, dt)), round1(bytesToMbps(up, dt)))
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
