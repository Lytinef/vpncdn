/// DTO-модели клиента (соответствуют ответам backend).

class Plan {
  final String code;
  final String name;
  final num priceRub;
  final int deviceLimit;
  final int durationDays;

  Plan({
    required this.code,
    required this.name,
    required this.priceRub,
    required this.deviceLimit,
    required this.durationDays,
  });

  factory Plan.fromJson(Map<String, dynamic> j) => Plan(
        code: j['code'],
        name: j['name'],
        priceRub: j['priceRub'],
        deviceLimit: j['deviceLimit'],
        durationDays: j['durationDays'],
      );

  Map<String, dynamic> toJson() => {
        'code': code,
        'name': name,
        'priceRub': priceRub,
        'deviceLimit': deviceLimit,
        'durationDays': durationDays,
      };
}

class Subscription {
  final String id;
  final String status;
  final Plan plan;
  final Plan? nextPlan;
  final DateTime? currentPeriodEnd;
  final bool autoRenew;
  final bool cancelAtPeriodEnd;

  Subscription({
    required this.id,
    required this.status,
    required this.plan,
    required this.nextPlan,
    required this.currentPeriodEnd,
    required this.autoRenew,
    required this.cancelAtPeriodEnd,
  });

  bool get isActive =>
      (status == 'active' || status == 'past_due' || status == 'canceled') &&
      currentPeriodEnd != null &&
      currentPeriodEnd!.isAfter(DateTime.now());

  factory Subscription.fromJson(Map<String, dynamic> j) => Subscription(
        id: j['id'],
        status: j['status'],
        plan: Plan.fromJson(j['plan']),
        nextPlan: j['nextPlan'] != null ? Plan.fromJson(j['nextPlan']) : null,
        currentPeriodEnd: j['currentPeriodEnd'] != null
            ? DateTime.parse(j['currentPeriodEnd'])
            : null,
        autoRenew: j['autoRenew'] ?? false,
        cancelAtPeriodEnd: j['cancelAtPeriodEnd'] ?? false,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'status': status,
        'plan': plan.toJson(),
        'nextPlan': nextPlan?.toJson(),
        'currentPeriodEnd': currentPeriodEnd?.toIso8601String(),
        'autoRenew': autoRenew,
        'cancelAtPeriodEnd': cancelAtPeriodEnd,
      };
}

class UserProfile {
  final String id;
  final String? username;
  final String? firstName;
  final String? photoUrl;

  UserProfile({required this.id, this.username, this.firstName, this.photoUrl});

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        id: j['id'],
        username: j['username'],
        firstName: j['firstName'],
        photoUrl: j['photoUrl'],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'firstName': firstName,
        'photoUrl': photoUrl,
      };
}

class AccountState {
  final UserProfile user;
  final Subscription? subscription;
  final int devicesUsed;
  final int devicesLimit;

  AccountState({
    required this.user,
    required this.subscription,
    required this.devicesUsed,
    required this.devicesLimit,
  });

  factory AccountState.fromJson(Map<String, dynamic> j) => AccountState(
        user: UserProfile.fromJson(j['user']),
        subscription: j['subscription'] != null
            ? Subscription.fromJson(j['subscription'])
            : null,
        devicesUsed: j['devices']['used'],
        devicesLimit: j['devices']['limit'],
      );

  Map<String, dynamic> toJson() => {
        'user': user.toJson(),
        'subscription': subscription?.toJson(),
        'devices': {'used': devicesUsed, 'limit': devicesLimit},
      };
}

class Device {
  final String id;
  final String name;
  final String platform;
  final bool isActive;

  Device({required this.id, required this.name, required this.platform, required this.isActive});

  factory Device.fromJson(Map<String, dynamic> j) => Device(
        id: j['id'],
        name: j['name'],
        platform: j['platform'],
        isActive: j['isActive'] ?? true,
      );
}

/// Один вариант VLESS-подключения для нативного ядра.
/// mode='cdn': XHTTP+TLS через NGENIX (обход блокировок).
/// mode='direct': Vision+Reality мимо CDN (ниже пинг, IP блокируем).
class VlessConnection {
  final String mode;
  final String protocol; // 'vless' | 'hysteria2'
  final String uuid;
  final String address;
  final int port;
  final String sni;
  final String security; // 'tls' | 'reality'
  final String network; // 'xhttp' | 'tcp' | 'udp'
  final String wsPath;
  final String wsHost;
  final String flow;
  final String publicKey;
  final String shortId;
  final String fingerprint;
  // hysteria2:
  final String auth;
  final String certPin;
  final bool insecure;
  final String uri;

  VlessConnection({
    required this.mode,
    required this.protocol,
    required this.uuid,
    required this.address,
    required this.port,
    required this.sni,
    required this.security,
    required this.network,
    required this.wsPath,
    required this.wsHost,
    required this.flow,
    required this.publicKey,
    required this.shortId,
    required this.fingerprint,
    required this.auth,
    required this.certPin,
    required this.insecure,
    required this.uri,
  });

  factory VlessConnection.fromJson(Map<String, dynamic> j) => VlessConnection(
        mode: j['mode'] ?? 'cdn',
        protocol: j['protocol'] ?? 'vless',
        uuid: j['uuid'],
        address: j['address'],
        port: j['port'],
        sni: j['sni'],
        security: j['security'] ?? 'tls',
        network: j['network'] ?? 'xhttp',
        wsPath: j['wsPath'] ?? '',
        wsHost: j['wsHost'] ?? '',
        flow: j['flow'] ?? '',
        publicKey: j['publicKey'] ?? '',
        shortId: j['shortId'] ?? '',
        fingerprint: j['fingerprint'] ?? '',
        auth: j['auth'] ?? '',
        certPin: j['certPin'] ?? '',
        insecure: j['insecure'] ?? false,
        uri: j['uri'] ?? '',
      );

  Map<String, dynamic> toMap() => {
        'mode': mode,
        'protocol': protocol,
        'uuid': uuid,
        'address': address,
        'port': port,
        'sni': sni,
        'security': security,
        'network': network,
        'wsPath': wsPath,
        'wsHost': wsHost,
        'flow': flow,
        'publicKey': publicKey,
        'shortId': shortId,
        'fingerprint': fingerprint,
        'auth': auth,
        'certPin': certPin,
        'insecure': insecure,
        'uri': uri,
      };
}

/// Конфиг прямого режима AmneziaWG (для нативного awg-туннеля).
class AwgConfig {
  final String address; // IP клиента в подсети, напр. 10.8.2.5
  final String serverPublicKey;
  final String endpoint; // host:port сервера awg
  final int mtu;
  final Map<String, dynamic> params; // jc/jmin/jmax/s1..s4/h1..h4/i1

  AwgConfig({
    required this.address,
    required this.serverPublicKey,
    required this.endpoint,
    required this.mtu,
    required this.params,
  });

  factory AwgConfig.fromJson(Map<String, dynamic> j) => AwgConfig(
        address: j['address'] ?? '',
        serverPublicKey: j['serverPublicKey'] ?? '',
        endpoint: j['endpoint'] ?? '',
        mtu: j['mtu'] ?? 1376,
        params: (j['params'] as Map?)?.cast<String, dynamic>() ?? const {},
      );
}

/// Ответ сервера: два варианта подключения (CDN + опционально прямой).
class DeviceConnection {
  final VlessConnection cdn;
  final VlessConnection? direct;
  /// Узел предлагает прямой режим AmneziaWG (нативный awg-туннель).
  final bool directAwg;

  DeviceConnection({required this.cdn, this.direct, this.directAwg = false});

  bool get hasDirect => direct != null || directAwg;

  /// Вариант по флагу режима (если прямого нет — всегда CDN).
  VlessConnection select(bool directMode) =>
      (directMode && direct != null) ? direct! : cdn;

  factory DeviceConnection.fromJson(Map<String, dynamic> j) {
    // Новый формат: {cdn, direct}. Старый: плоские поля = CDN.
    final cdn = j['cdn'] != null
        ? VlessConnection.fromJson(j['cdn'] as Map<String, dynamic>)
        : VlessConnection.fromJson(j);
    final direct = j['direct'] != null
        ? VlessConnection.fromJson(j['direct'] as Map<String, dynamic>)
        : null;
    return DeviceConnection(
      cdn: cdn,
      direct: direct,
      directAwg: j['directAwg'] ?? false,
    );
  }

  Map<String, dynamic> toMap() => {
        'cdn': cdn.toMap(),
        if (direct != null) 'direct': direct!.toMap(),
        'directAwg': directAwg,
      };
}

class BypassList {
  final String version;
  final List<BypassItem> apps;
  final List<BypassItem> domains;

  BypassList({required this.version, required this.apps, required this.domains});

  factory BypassList.fromJson(Map<String, dynamic> j) => BypassList(
        version: j['version'],
        apps: (j['apps'] as List).map((e) => BypassItem.fromJson(e)).toList(),
        domains: (j['domains'] as List).map((e) => BypassItem.fromJson(e)).toList(),
      );
}

class BypassItem {
  final String value;
  final String title;
  final String? category;

  BypassItem({required this.value, required this.title, this.category});

  factory BypassItem.fromJson(Map<String, dynamic> j) =>
      BypassItem(value: j['value'], title: j['title'], category: j['category']);
}

/// Информация об актуальной версии клиента (с backend /app/version).
class AppVersionInfo {
  final String? latestVersion;
  final int latestBuild;
  final bool updateAvailable;
  final bool forceUpdate;
  final String? updateUrl;
  final String? notes;

  AppVersionInfo({
    required this.latestVersion,
    required this.latestBuild,
    required this.updateAvailable,
    required this.forceUpdate,
    required this.updateUrl,
    required this.notes,
  });

  factory AppVersionInfo.fromJson(Map<String, dynamic> j) => AppVersionInfo(
        latestVersion: j['latestVersion'],
        latestBuild: j['latestBuild'] ?? 0,
        updateAvailable: j['updateAvailable'] ?? false,
        forceUpdate: j['forceUpdate'] ?? false,
        updateUrl: j['updateUrl'],
        notes: j['notes'],
      );
}

class InstalledApp {
  final String packageName;
  final String name;

  InstalledApp({required this.packageName, required this.name});

  factory InstalledApp.fromMap(Map<dynamic, dynamic> m) =>
      InstalledApp(packageName: m['packageName'], name: m['name'] ?? m['packageName']);
}
