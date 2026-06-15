package com.vpncdn.client

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.VpnService
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import com.vpncdn.client.vpn.VpnConnectionService
import org.json.JSONObject

class MainActivity : FlutterActivity() {
    companion object {
        private const val METHOD = "vpncdn/vpn"
        private const val STATUS = "vpncdn/vpn/status"
        private const val STATS = "vpncdn/vpn/stats"
        private const val REQ_VPN = 0x0F01
        const val PREFS = "vpncdn_prefs"
        const val KEY_AUTOSTART = "auto_start"
    }

    private var pendingPrepare: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(messenger, METHOD).setMethodCallHandler { call, result ->
            when (call.method) {
                "prepare" -> prepareVpn(result)
                "connect" -> {
                    val cfg = JSONObject(call.arguments as Map<*, *>).toString()
                    val i = Intent(this, VpnConnectionService::class.java).apply {
                        action = VpnConnectionService.ACTION_CONNECT
                        putExtra(VpnConnectionService.EXTRA_CONFIG, cfg)
                    }
                    startService(i)
                    result.success(null)
                }
                "disconnect" -> {
                    val i = Intent(this, VpnConnectionService::class.java).apply {
                        action = VpnConnectionService.ACTION_DISCONNECT
                    }
                    startService(i)
                    result.success(null)
                }
                "stage" -> result.success(VpnBus.stage)
                "measure" -> result.success(VpnBus.lastStats)
                "setStatsActive" -> {
                    VpnBus.setStatsActive(call.argument<Boolean>("active") ?: true)
                    result.success(null)
                }
                "installedApps" -> result.success(AppListProvider.list(this))
                "setAutoStart" -> {
                    val enabled = call.argument<Boolean>("enabled") ?: false
                    getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit().putBoolean(KEY_AUTOSTART, enabled).apply()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }

        EventChannel(messenger, STATUS).setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(args: Any?, sink: EventChannel.EventSink?) = VpnBus.bindStatus(sink)
            override fun onCancel(args: Any?) = VpnBus.bindStatus(null)
        })

        EventChannel(messenger, STATS).setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(args: Any?, sink: EventChannel.EventSink?) = VpnBus.bindStats(sink)
            override fun onCancel(args: Any?) = VpnBus.bindStats(null)
        })
    }

    private fun prepareVpn(result: MethodChannel.Result) {
        val intent = VpnService.prepare(this)
        if (intent == null) {
            result.success(true)
        } else {
            pendingPrepare = result
            startActivityForResult(intent, REQ_VPN)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_VPN) {
            pendingPrepare?.success(resultCode == Activity.RESULT_OK)
            pendingPrepare = null
        }
    }
}
