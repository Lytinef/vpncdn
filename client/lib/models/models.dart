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

/// Конфигурация VLESS-подключения для нативного ядра.
class VlessConnection {
  final String uuid;
  final String address;
  final int port;
  final String sni;
  final String wsPath;
  final String wsHost;
  final String uri;

  VlessConnection({
    required this.uuid,
    required this.address,
    required this.port,
    required this.sni,
    required this.wsPath,
    required this.wsHost,
    required this.uri,
  });

  factory VlessConnection.fromJson(Map<String, dynamic> j) => VlessConnection(
        uuid: j['uuid'],
        address: j['address'],
        port: j['port'],
        sni: j['sni'],
        wsPath: j['wsPath'],
        wsHost: j['wsHost'],
        uri: j['uri'],
      );

  Map<String, dynamic> toMap() => {
        'uuid': uuid,
        'address': address,
        'port': port,
        'sni': sni,
        'wsPath': wsPath,
        'wsHost': wsHost,
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
