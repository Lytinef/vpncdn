package com.vpncdn.client

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager

/** Список установленных приложений с доступом в интернет (для раздельного туннелирования). */
object AppListProvider {
    fun list(context: Context): List<Map<String, String>> {
        val pm = context.packageManager
        val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        val self = context.packageName
        return packages
            .asSequence()
            .filter { it.packageName != self }
            // Только приложения с разрешением INTERNET.
            .filter { hasInternet(pm, it.packageName) }
            // Пользовательские + значимые системные (с launcher) — показываем все с интернетом.
            .map {
                mapOf(
                    "packageName" to it.packageName,
                    "name" to pm.getApplicationLabel(it).toString(),
                    "system" to ((it.flags and ApplicationInfo.FLAG_SYSTEM) != 0).toString(),
                )
            }
            .sortedBy { it["name"]?.lowercase() }
            .toList()
    }

    private fun hasInternet(pm: PackageManager, pkg: String): Boolean = try {
        pm.getPackageInfo(pkg, PackageManager.GET_PERMISSIONS)
            .requestedPermissions
            ?.contains(android.Manifest.permission.INTERNET) ?: false
    } catch (_: Exception) {
        false
    }
}
