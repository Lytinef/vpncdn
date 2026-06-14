package com.vpncdn.client.vpn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService
import com.vpncdn.client.MainActivity

/**
 * Автозапуск VPN после загрузки системы (если включено в настройках и есть
 * выданное ранее разрешение на VPN).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(MainActivity.KEY_AUTOSTART, false)) return

        // Если разрешение на VPN не выдано — тихо выходим (нужен экран приложения).
        if (VpnService.prepare(context) != null) return

        // Конфиг последнего подключения сохранён сервисом при connect().
        val lastConfig = prefs.getString(VpnConnectionService.KEY_LAST_CONFIG, null) ?: return
        val i = Intent(context, VpnConnectionService::class.java).apply {
            action = VpnConnectionService.ACTION_CONNECT
            putExtra(VpnConnectionService.EXTRA_CONFIG, lastConfig)
        }
        context.startForegroundService(i)
    }
}
