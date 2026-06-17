import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../models/models.dart';
import '../services/api.dart';

/// Проверка актуальной версии: сравнивает текущий build с серверным.
/// Не критична — при ошибке тихо ничего не показывает.
class UpdateController extends ChangeNotifier {
  final Api _api;
  UpdateController(this._api);

  AppVersionInfo? info;
  bool _dismissed = false;

  /// Мягкий баннер «доступна новая версия» (не обязательное обновление).
  bool get bannerVisible =>
      info != null && info!.updateAvailable && !info!.forceUpdate && !_dismissed;

  /// Обязательное обновление — блокирует приложение.
  bool get mustUpdate => info != null && info!.forceUpdate;

  Future<void> check() async {
    try {
      final pkg = await PackageInfo.fromPlatform();
      final build = int.tryParse(pkg.buildNumber) ?? 0;
      info = await _api.checkVersion(build);
      notifyListeners();
    } catch (_) {
      // Проверка версии необязательна — игнорируем сбой.
    }
  }

  void dismiss() {
    _dismissed = true;
    notifyListeners();
  }
}
