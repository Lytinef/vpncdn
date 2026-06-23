import '../models/models.dart';
import 'api_client.dart';

/// Типизированные вызовы backend поверх ApiClient.
class Api {
  final ApiClient _c;
  Api(this._c);

  // ── аккаунт ──
  Future<AccountState> me() async => AccountState.fromJson(await _c.get('/users/me'));

  Future<void> logoutAll() => _c.post('/users/me/logout-all');

  Future<void> deleteAccount() => _c.delete('/users/me');

  Future<void> logout(String refreshToken) =>
      _c.post('/auth/logout', body: {'refreshToken': refreshToken}, auth: false);

  /// Вход по одноразовому коду из личного кабинета. Возвращает пару токенов.
  Future<Map<String, dynamic>> loginWithCode(String code) async =>
      Map<String, dynamic>.from(
        await _c.post('/auth/code', body: {'code': code, 'platform': 'android'}, auth: false),
      );

  // ── подписки ──
  Future<List<Plan>> plans() async {
    final list = await _c.get('/plans', auth: false) as List;
    return list.map((e) => Plan.fromJson(e)).toList();
  }

  Future<Subscription?> subscription() async {
    final r = await _c.get('/subscription');
    return r['subscription'] != null ? Subscription.fromJson(r['subscription']) : null;
  }

  Future<void> cancelSubscription() => _c.post('/subscription/cancel');
  Future<void> resumeSubscription() => _c.post('/subscription/resume');
  Future<void> changePlan(String planCode) =>
      _c.post('/subscription/change-plan', body: {'planCode': planCode});

  // ── оплата ──
  Future<Map<String, dynamic>> checkout(String planCode) async =>
      Map<String, dynamic>.from(await _c.post('/payments/checkout', body: {'planCode': planCode}));

  Future<Map<String, dynamic>> syncPayment(String id) async =>
      Map<String, dynamic>.from(await _c.get('/payments/$id/sync'));

  // ── устройства ──
  Future<List<Device>> devices() async {
    final list = await _c.get('/devices') as List;
    return list.map((e) => Device.fromJson(e)).toList();
  }

  Future<Device> registerDevice({
    required String name,
    required String platform,
    String? hardwareId,
  }) async =>
      Device.fromJson(await _c.post('/devices', body: {
        'name': name,
        'platform': platform,
        if (hardwareId != null) 'hardwareId': hardwareId,
      }));

  Future<void> removeDevice(String id) => _c.delete('/devices/$id');

  Future<DeviceConnection> connection(String deviceId) async =>
      DeviceConnection.fromJson(await _c.get('/devices/$deviceId/connection'));

  /// Прямой режим AmneziaWG: шлём свой WG-pubkey, получаем awg-конфиг
  /// (address/serverPublicKey/endpoint/mtu/params). null — если awg не настроен.
  Future<AwgConfig?> awgConfig(String deviceId, String publicKey) async {
    final r = await _c.post('/devices/$deviceId/awg', body: {'publicKey': publicKey});
    if (r == null) return null;
    return AwgConfig.fromJson(r as Map<String, dynamic>);
  }

  // ── список обхода ──
  Future<BypassList> bypass() async => BypassList.fromJson(await _c.get('/bypass'));

  // ── версия приложения ──
  Future<AppVersionInfo> checkVersion(int build) async => AppVersionInfo.fromJson(
        await _c.get('/app/version?platform=android&build=$build', auth: false),
      );
}
