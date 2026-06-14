'use strict';

/**
 * Агент Xray-узла (без рестарта Xray при изменении клиентов).
 *  - запускает и контролирует процесс xray (супервайзер с авто-рестартом при падении);
 *  - управляет VLESS-клиентами через gRPC API Xray (HandlerService.AlterInbound):
 *    AddUserOperation / RemoveUserOperation — динамически, без перезапуска;
 *  - после (пере)старта Xray восстанавливает всех клиентов из clients.json.
 *
 * Backend обращается сюда по node.apiUrl с Authorization: Bearer <apiSecret>.
 */

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const protobuf = require('protobufjs');

const PORT = parseInt(process.env.AGENT_PORT || '8090', 10);
const SECRET = process.env.AGENT_SECRET || '';
const BASE_CONFIG = process.env.XRAY_BASE_CONFIG || '/etc/xray/config.base.json';
const GENERATED = process.env.XRAY_CONFIG || '/etc/xray/config.generated.json';
const CLIENTS_FILE = process.env.CLIENTS_FILE || '/data/clients.json';
const XRAY_BIN = process.env.XRAY_BIN || 'xray';
const INBOUND_TAG = process.env.INBOUND_TAG || 'vless-in';
const API_ADDR = process.env.XRAY_API_ADDR || '127.0.0.1:10085';

const PROTO_DIR = path.join(__dirname, 'proto');

// ── proto: grpc-сервис + кодирование вложенных сообщений ──
const packageDefinition = protoLoader.loadSync(path.join(PROTO_DIR, 'command.proto'), {
  includeDirs: [PROTO_DIR],
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const grpcPkg = grpc.loadPackageDefinition(packageDefinition);
const HandlerService = grpcPkg.xray.app.proxyman.command.HandlerService;

const statsPackageDef = protoLoader.loadSync(path.join(PROTO_DIR, 'stats_command.proto'), {
  includeDirs: [PROTO_DIR],
  keepCase: true,
});
const StatsService = grpc.loadPackageDefinition(statsPackageDef).xray.app.stats.command
  .StatsService;

const root = protobuf.loadSync([
  path.join(PROTO_DIR, 'command.proto'),
  path.join(PROTO_DIR, 'vless_account.proto'),
]);
const Account = root.lookupType('xray.proxy.vless.Account');
const AddUserOperation = root.lookupType('xray.app.proxyman.command.AddUserOperation');
const RemoveUserOperation = root.lookupType('xray.app.proxyman.command.RemoveUserOperation');

// Полные имена типов = значения TypedMessage.type в Xray.
const T_ADD = 'xray.app.proxyman.command.AddUserOperation';
const T_REMOVE = 'xray.app.proxyman.command.RemoveUserOperation';
const T_VLESS = 'xray.proxy.vless.Account';

let clients = loadClients();
let child = null;
let restarting = false;
let apiClient = null;

function loadClients() {
  try {
    return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function persistClients() {
  fs.mkdirSync(path.dirname(CLIENTS_FILE), { recursive: true });
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

function ensureGeneratedConfig() {
  // Базовый конфиг с пустым списком клиентов — пользователей добавим по gRPC.
  const base = JSON.parse(fs.readFileSync(BASE_CONFIG, 'utf8'));
  const inbound = base.inbounds.find((i) => i.tag === INBOUND_TAG);
  if (!inbound) throw new Error(`inbound ${INBOUND_TAG} не найден в базовом конфиге`);
  inbound.settings.clients = [];
  fs.writeFileSync(GENERATED, JSON.stringify(base, null, 2));
}

function getApiClient() {
  if (!apiClient) {
    apiClient = new HandlerService(API_ADDR, grpc.credentials.createInsecure());
  }
  return apiClient;
}

let statsClient = null;
function getStatsClient() {
  if (!statsClient) {
    statsClient = new StatsService(API_ADDR, grpc.credentials.createInsecure());
  }
  return statsClient;
}

// Трафик по пользователям (email): дельта с прошлого опроса (reset=true).
function queryUserTraffic() {
  return new Promise((resolve, reject) => {
    getStatsClient().QueryStats({ pattern: 'user>>>', reset: true }, (err, resp) => {
      if (err) return reject(err);
      const byEmail = {};
      for (const s of (resp && resp.stat) || []) {
        const parts = s.name.split('>>>'); // user>>><email>>>traffic>>><uplink|downlink>
        if (parts.length !== 4 || parts[0] !== 'user' || parts[2] !== 'traffic') continue;
        const email = parts[1];
        byEmail[email] = byEmail[email] || { email, uplink: 0, downlink: 0 };
        if (parts[3] === 'uplink') byEmail[email].uplink = Number(s.value) || 0;
        else if (parts[3] === 'downlink') byEmail[email].downlink = Number(s.value) || 0;
      }
      resolve(Object.values(byEmail));
    });
  });
}

// CPU/RAM узла (хостовые значения; контейнер видит /proc хоста).
function systemMetrics() {
  const cores = os.cpus().length || 1;
  const load1 = os.loadavg()[0] || 0;
  const cpuPercent = Math.min(100, Math.round((load1 / cores) * 100));
  let memPercent;
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const total = Number(/MemTotal:\s+(\d+)/.exec(meminfo)[1]);
    const avail = Number(/MemAvailable:\s+(\d+)/.exec(meminfo)[1]);
    memPercent = Math.round(((total - avail) / total) * 100);
  } catch {
    memPercent = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
  }
  return { cpuPercent, memPercent, cores, loadavg: load1, clients: clients.length };
}

function alterInbound(operationTypedMessage) {
  return new Promise((resolve, reject) => {
    getApiClient().AlterInbound(
      { tag: INBOUND_TAG, operation: operationTypedMessage },
      (err, resp) => (err ? reject(err) : resolve(resp)),
    );
  });
}

async function addUser(uuid, email) {
  const accountBytes = Account.encode(
    Account.create({ id: uuid, flow: '', encryption: 'none' }),
  ).finish();
  const opBytes = AddUserOperation.encode(
    AddUserOperation.create({
      user: { level: 0, email, account: { type: T_VLESS, value: accountBytes } },
    }),
  ).finish();
  try {
    await alterInbound({ type: T_ADD, value: opBytes });
  } catch (e) {
    if (/already exists|exists/i.test(e.message || '')) return; // идемпотентно
    throw e;
  }
}

async function removeUser(email) {
  const opBytes = RemoveUserOperation.encode(RemoveUserOperation.create({ email })).finish();
  try {
    await alterInbound({ type: T_REMOVE, value: opBytes });
  } catch (e) {
    if (/not found|does not exist|doesn't exist/i.test(e.message || '')) return;
    throw e;
  }
}

function waitForApi(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    getApiClient().waitForReady(Date.now() + timeoutMs, (err) =>
      err ? reject(err) : resolve(),
    );
  });
}

async function syncAllUsers() {
  try {
    await waitForApi();
  } catch {
    console.warn('[agent] gRPC API недоступен, повтор синка через 3с');
    setTimeout(syncAllUsers, 3000);
    return;
  }
  let ok = 0;
  for (const c of clients) {
    try {
      await addUser(c.id, c.email);
      ok++;
    } catch (e) {
      console.error(`[agent] не удалось добавить ${c.email}: ${e.message}`);
    }
  }
  console.log(`[agent] синхронизировано клиентов: ${ok}/${clients.length}`);
}

function startXray() {
  ensureGeneratedConfig();
  child = spawn(XRAY_BIN, ['run', '-config', GENERATED], { stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`[agent] xray завершился (code=${code})`);
    if (!restarting) setTimeout(startXray, 2000); // авто-рестарт при падении
  });
  console.log('[agent] xray запущен');
  // Восстанавливаем клиентов в работающем процессе через gRPC.
  syncAllUsers();
}

// ── HTTP API ──
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const auth = req.headers.authorization || '';
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', clients: clients.length }));

app.get('/clients', (_req, res) => res.json(clients));

app.post('/clients', async (req, res) => {
  const { uuid, email } = req.body || {};
  if (!uuid) return res.status(400).json({ error: 'uuid required' });
  const mail = email || uuid;
  try {
    if (!clients.some((c) => c.id === uuid)) {
      clients.push({ id: uuid, email: mail });
      persistClients();
    }
    await addUser(uuid, mail); // динамически, без рестарта
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.delete('/clients/:uuid', async (req, res) => {
  const target = clients.find((c) => c.id === req.params.uuid);
  clients = clients.filter((c) => c.id !== req.params.uuid);
  persistClients();
  try {
    if (target) await removeUser(target.email); // динамически, без рестарта
    res.status(204).end();
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Трафик по пользователям (дельта с прошлого опроса) — backend накапливает.
app.get('/stats', async (_req, res) => {
  try {
    res.json(await queryUserTraffic());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Нагрузка узла (CPU/RAM в процентах).
app.get('/metrics', (_req, res) => res.json(systemMetrics()));

startXray();
app.listen(PORT, '0.0.0.0', () => console.log(`[agent] HTTP API на :${PORT}`));
