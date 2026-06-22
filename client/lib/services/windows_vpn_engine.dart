import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../models/models.dart';
import 'vpn_engine.dart';

/// Windows VPN-движок: поднимает xray.exe (SOCKS) + tun2socks (wintun) и
/// настраивает маршруты, чтобы весь трафик шёл в туннель, кроме соединения с
/// самим сервером (host-route через реальный шлюз) — иначе петля.
///
/// Требует прав администратора (создание wintun-адаптера и правка таблицы
/// маршрутов) — приложение помечено requireAdministrator в манифесте.
class WindowsVpnEngine implements VpnEngine {
  static const _socksPort = 10808;
  static const _tunAddr = '198.18.0.1';
  static const _tunMask = '255.255.255.0';

  final _statusCtrl = StreamController<VpnStatus>.broadcast();
  VpnStage _stage = VpnStage.disconnected;

  Process? _xray;
  Process? _tun2socks;
  IOSink? _log;

  // Для отката маршрутов при отключении.
  String? _gateway; // реальный шлюз по умолчанию
  final List<String> _serverIps = [];
  int? _tunIfIndex;

  @override
  Stream<VpnStatus> get statusStream => _statusCtrl.stream;

  @override
  Future<VpnStage> currentStage() async => _stage;

  // На десктопе системного диалога разрешения нет — права даёт UAC при запуске.
  @override
  Future<bool> prepare() async => true;

  @override
  Future<List<InstalledApp>> installedApps() async => const [];

  @override
  Future<void> setStatsActive(bool active) async {}

  @override
  Future<void> setAutoStart(bool enabled) async {
    // Автозапуск через ключ реестра Run (best-effort).
    final exe = Platform.resolvedExecutable;
    if (enabled) {
      await _run('reg', [
        'add', r'HKCU\Software\Microsoft\Windows\CurrentVersion\Run',
        '/v', 'Unway', '/t', 'REG_SZ', '/d', exe, '/f',
      ]);
    } else {
      await _run('reg', [
        'delete', r'HKCU\Software\Microsoft\Windows\CurrentVersion\Run',
        '/v', 'Unway', '/f',
      ]);
    }
  }

  void _setStage(VpnStage s, [String? message]) {
    _stage = s;
    _statusCtrl.add(VpnStatus(s, message));
  }

  Directory get _workDir {
    final base = Platform.environment['LOCALAPPDATA'] ?? Directory.systemTemp.path;
    return Directory('$base\\Unway')..createSync(recursive: true);
  }

  /// Папка с бинарниками (рядом с exe приложения).
  String get _binDir => File(Platform.resolvedExecutable).parent.path;

  void _logLine(String s) {
    try {
      _log?.writeln('${DateTime.now().toIso8601String()}  $s');
    } catch (_) {}
  }

  @override
  Future<void> connect(TunnelConfig config) async {
    // Защита от повторного/двойного запуска (двойной тап и т.п.).
    if (_stage == VpnStage.connecting || _stage == VpnStage.connected) return;
    _log = File('${_workDir.path}\\windows-vpn.log').openWrite(mode: FileMode.append);
    _setStage(VpnStage.connecting);
    try {
      await _killOrphans(); // подчищаем зависшие процессы прошлой попытки
      final conn = config.connection;

      // 1) Конфиг Xray.
      final cfgFile = File('${_workDir.path}\\xray-config.json');
      // 1) Реальный шлюз/интерфейс и IP сервера — для host-route в обход туннеля.
      // Резолвим ДО конфига: xray пойдёт на конкретный edge-IP (тот, что исключим
      // из туннеля), иначе он сам резолвит CDN-домен в другой ротируемый IP NGENIX,
      // который заворачивается в TUN → петля → долгий коннект и высокий пинг.
      _gateway = await _defaultGateway();
      _serverIps
        ..clear()
        ..addAll(await _resolveIps(conn.address));
      _logLine('gateway=$_gateway serverIps=$_serverIps');
      if (_gateway == null || _serverIps.isEmpty) {
        throw Exception('Не удалось определить шлюз/адрес сервера');
      }

      // 2) Конфиг Xray — vnext.address = конкретный edge-IP (Host/SNI = домен,
      // NGENIX роутит по Host).
      await cfgFile.writeAsString(_buildXrayConfig(config, _serverIps.first));

      // 3) Xray.
      _xray = await Process.start(
        '$_binDir\\xray.exe',
        ['run', '-c', cfgFile.path],
        workingDirectory: _binDir,
      );
      _pipe(_xray!, 'xray');
      await _waitSocks();

      // 4) tun2socks (создаёт wintun-адаптер).
      _tun2socks = await Process.start(
        '$_binDir\\tun2socks.exe',
        // MTU 1280: меньше фрагментации сквозь XHTTP/TLS/CDN (скорость/рывки/пинг).
        // -tcp-auto-tuning: авто-подбор буферов netstack (throughput).
        ['-device', 'wintun', '-proxy', 'socks5://127.0.0.1:$_socksPort', '-mtu', '1280', '-tcp-auto-tuning', '-loglevel', 'warn'],
        workingDirectory: _binDir,
      );
      _pipe(_tun2socks!, 'tun2socks');

      // 5) Настройка адаптера и маршрутов.
      await _setupRouting();

      // 6) Проверяем сквозную доступность (через туннель).
      if (!await _probe()) {
        throw Exception('Не удалось подключиться к серверу');
      }

      _setStage(VpnStage.connected);
      _logLine('connected');
    } catch (e) {
      _logLine('ошибка connect: $e');
      await _teardown();
      _setStage(VpnStage.error, e.toString());
    }
  }

  @override
  Future<void> disconnect() async {
    _setStage(VpnStage.disconnecting);
    await _teardown();
    _setStage(VpnStage.disconnected);
  }

  @override
  Future<int?> pingNow() async {
    if (_stage != VpnStage.connected) return null;
    final ms = await _measure();
    return ms >= 0 ? ms : null;
  }

  // ── внутреннее ──────────────────────────────────────────

  void _pipe(Process p, String tag) {
    p.stdout.transform(utf8.decoder).listen((d) => _logLine('[$tag] ${d.trimRight()}'));
    p.stderr.transform(utf8.decoder).listen((d) => _logLine('[$tag!] ${d.trimRight()}'));
  }

  /// Ждём, пока xray поднимет SOCKS-порт.
  Future<void> _waitSocks() async {
    for (var i = 0; i < 30; i++) {
      try {
        final s = await Socket.connect('127.0.0.1', _socksPort,
            timeout: const Duration(milliseconds: 500));
        s.destroy();
        return;
      } catch (_) {
        await Future.delayed(const Duration(milliseconds: 300));
      }
    }
    throw Exception('Xray SOCKS не поднялся');
  }

  Future<void> _setupRouting() async {
    // Ждём появления wintun-адаптера и берём его ifIndex/alias.
    String? alias;
    for (var i = 0; i < 30; i++) {
      final r = await _ps(
        r"Get-NetAdapter | Where-Object { $_.InterfaceDescription -like '*Wintun*' -or $_.Name -like '*wintun*' } | Select-Object -First 1 | ForEach-Object { '{0}|{1}' -f $_.ifIndex, $_.Name }",
      );
      final line = r.trim();
      if (line.contains('|')) {
        final parts = line.split('|');
        _tunIfIndex = int.tryParse(parts[0]);
        alias = parts.sublist(1).join('|');
        break;
      }
      await Future.delayed(const Duration(milliseconds: 300));
    }
    if (_tunIfIndex == null || alias == null) {
      throw Exception('wintun-адаптер не найден');
    }
    _logLine('wintun ifIndex=$_tunIfIndex alias=$alias');

    // IP + DNS на адаптере.
    await _run('netsh', ['interface', 'ip', 'set', 'address', 'name=$alias', 'static', _tunAddr, _tunMask]);
    await _run('netsh', ['interface', 'ip', 'set', 'dns', 'name=$alias', 'static', '1.1.1.1']);

    // Host-route к серверу через реальный шлюз (чтобы трафик туннеля не зациклился).
    for (final ip in _serverIps) {
      await _run('route', ['add', ip, 'mask', '255.255.255.255', _gateway!, 'metric', '1']);
    }

    // Перекрываем дефолт двумя /1-маршрутами через туннель (не трогая исходный default).
    await _run('route', ['add', '0.0.0.0', 'mask', '128.0.0.0', _tunAddr, 'metric', '1', 'if', '$_tunIfIndex']);
    await _run('route', ['add', '128.0.0.0', 'mask', '128.0.0.0', _tunAddr, 'metric', '1', 'if', '$_tunIfIndex']);

    // Расширяем диапазон эфемерных портов: tun2socks открывает соединение к SOCKS
    // на каждый поток → дефолтных ~16k под нагрузкой не хватает ("Only one usage of
    // each socket address"), и трафик начинает обрываться.
    await _run('netsh', ['int', 'ipv4', 'set', 'dynamicport', 'tcp', 'start=10000', 'num=55535']);
  }

  Future<void> _teardown() async {
    try {
      await _run('route', ['delete', '0.0.0.0', 'mask', '128.0.0.0']);
      await _run('route', ['delete', '128.0.0.0', 'mask', '128.0.0.0']);
      for (final ip in _serverIps) {
        await _run('route', ['delete', ip]);
      }
    } catch (_) {}
    _tun2socks?.kill(ProcessSignal.sigkill);
    _tun2socks = null;
    _xray?.kill(ProcessSignal.sigkill);
    _xray = null;
    await _killOrphans();
    _serverIps.clear();
    _tunIfIndex = null;
    _logLine('teardown done');
    await _log?.flush();
    await _log?.close();
    _log = null;
  }

  /// Проверка доступности с ретраями: wintun-адаптеру и XHTTP-сессии Xray нужно
  /// несколько секунд, чтобы «подняться» — первая попытка часто падает мгновенно
  /// («сеть недоступна»), поэтому пробуем несколько раз.
  Future<bool> _probe() async {
    // Частые короткие попытки: ловим момент готовности туннеля без лишнего ожидания.
    for (var i = 0; i < 25; i++) {
      final ms = await _measure();
      if (ms >= 0) {
        _logLine('probe ok: ${ms}ms (попытка ${i + 1})');
        return true;
      }
      await Future.delayed(const Duration(milliseconds: 400));
    }
    return false;
  }

  /// Проверка через туннель строго по IPv4 (IPv6 в туннель не заворачивается и
  /// раньше давал многосекундную задержку на коннекте — отсюда «долгое
  /// подключение»). Читаем реальный HTTP-ответ — значит туннель достаёт сквозь.
  Future<int> _measure() async {
    // Фиксированный IP БЕЗ DNS: сразу после смены маршрутов системный резолвер ещё
    // не готов (errno 11004 / таймауты) и давал ~30с задержку коннекта. 1.1.1.1:80
    // отвечает HTTP-редиректом — значит туннель достаёт сквозь.
    final sw = Stopwatch()..start();
    Socket? sock;
    try {
      sock = await Socket.connect('1.1.1.1', 80, timeout: const Duration(seconds: 5));
      sock.write('GET / HTTP/1.1\r\nHost: 1.1.1.1\r\nConnection: close\r\n\r\n');
      await sock.flush();
      // Время до ПЕРВОГО байта ответа (а не до полного чтения и закрытия — это
      // добавляло лишний RTT и завышало «пинг»).
      final firstChunk =
          await sock.cast<List<int>>().first.timeout(const Duration(seconds: 5));
      return firstChunk.isNotEmpty ? sw.elapsedMilliseconds : -1;
    } catch (e) {
      _logLine('probe error: $e');
      return -1;
    } finally {
      sock?.destroy();
    }
  }

  Future<String?> _defaultGateway() async {
    final r = await _ps(
      r"(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop",
    );
    final g = r.trim();
    return g.isEmpty ? null : g;
  }

  Future<List<String>> _resolveIps(String host) async {
    try {
      final addrs = await InternetAddress.lookup(host, type: InternetAddressType.IPv4);
      return addrs.map((a) => a.address).toSet().toList();
    } catch (_) {
      return [];
    }
  }

  Future<String> _ps(String script) async {
    final r = await Process.run('powershell', ['-NoProfile', '-Command', script]);
    return (r.stdout as String?) ?? '';
  }

  /// Принудительно завершает зависшие наши процессы (порт 10808 и т.п.).
  Future<void> _killOrphans() async {
    await _run('taskkill', ['/F', '/T', '/IM', 'tun2socks.exe']);
    await _run('taskkill', ['/F', '/T', '/IM', 'xray.exe']);
  }

  Future<void> _run(String exe, List<String> args) async {
    try {
      final r = await Process.run(exe, args);
      _logLine('$exe ${args.join(' ')} -> ${r.exitCode}');
    } catch (e) {
      _logLine('$exe ${args.join(' ')} FAILED: $e');
    }
  }

  /// Конфиг Xray: SOCKS-вход (со sniffing для роутинга по домену) + VLESS+XHTTP.
  String _buildXrayConfig(TunnelConfig config, String serverAddress) {
    final c = config.connection;
    final rules = <Map<String, dynamic>>[
      // Приватные сети — напрямую.
      {
        'type': 'field',
        'ip': ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8'],
        'outboundTag': 'direct',
      },
    ];
    if (config.bypassEnabled) {
      // Xray-роутер ПАНИКУЕТ на не-ASCII (IDN) доменах вроде "честныйзнак.рф"
      // (нужен punycode) → ядро падало, SOCKS не поднимался. Фильтруем не-ASCII и
      // пустые (IDN-домены обхода — редкость).
      final domains = config.bypassDomains
          .where((d) => d.trim().isNotEmpty && d.runes.every((r) => r < 128))
          .toList();
      if (domains.isNotEmpty) {
        rules.add({
          'type': 'field',
          'domain': domains,
          'outboundTag': 'direct',
        });
      }
    }
    final cfg = {
      'log': {'loglevel': 'warning'},
      'inbounds': [
        {
          'tag': 'socks',
          'listen': '127.0.0.1',
          'port': _socksPort,
          'protocol': 'socks',
          'settings': {'udp': true},
          'sniffing': {'enabled': true, 'destOverride': ['http', 'tls', 'quic']},
        },
      ],
      'outbounds': [
        {
          'tag': 'proxy',
          'protocol': 'vless',
          'settings': {
            'vnext': [
              {
                'address': serverAddress,
                'port': c.port,
                'users': [
                  {'id': c.uuid, 'encryption': 'none'},
                ],
              },
            ],
          },
          'streamSettings': {
            'network': 'xhttp',
            'security': 'tls',
            'tlsSettings': {
              'serverName': c.sni,
              'alpn': ['h2', 'http/1.1'],
            },
            'xhttpSettings': {'path': c.wsPath, 'host': c.wsHost, 'mode': 'auto'},
            'sockopt': {'tcpKeepAliveIdle': 30, 'tcpKeepAliveInterval': 15},
          },
        },
        {'tag': 'direct', 'protocol': 'freedom'},
        {'tag': 'block', 'protocol': 'blackhole'},
      ],
      'routing': {'domainStrategy': 'IPIfNonMatch', 'rules': rules},
    };
    return const JsonEncoder.withIndent('  ').convert(cfg);
  }
}
