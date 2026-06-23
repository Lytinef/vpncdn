'use strict';

/**
 * Мини-API провижининга AmneziaWG-пиров. Backend (по Bearer AGENT_SECRET):
 *  - GET  /awg/info            — публичный ключ сервера, порт, подсеть, обфускация;
 *  - POST /awg/peers {publicKey} — добавить пира (выдать IP), вернуть address;
 *  - DELETE /awg/peers/:publicKey — удалить пира.
 * Пиры персистятся в PEERS_FILE и восстанавливаются на старте (awg set peer).
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = parseInt(process.env.AWG_PORT || '8091', 10);
const SECRET = process.env.AGENT_SECRET || '';
const IFACE = process.env.AWG_IFACE || 'awg0';
const SUBNET = process.env.AWG_SUBNET || '10.8.2';
const LISTEN_PORT = parseInt(process.env.AWG_LISTEN_PORT || '51820', 10);
const PEERS_FILE = process.env.PEERS_FILE || '/data/awg-peers.json';
const PRIVATE_KEY = process.env.AWG_PRIVATE_KEY || '';

const MTU = parseInt(process.env.AWG_MTU || '1376', 10);

// Профиль обфускации AmneziaWG 2.0 (совпадает с entrypoint и клиентами).
const PARAMS = {
  jc: parseInt(process.env.AWG_JC || '6', 10),
  jmin: parseInt(process.env.AWG_JMIN || '10', 10),
  jmax: parseInt(process.env.AWG_JMAX || '50', 10),
  s1: parseInt(process.env.AWG_S1 || '102', 10),
  s2: parseInt(process.env.AWG_S2 || '94', 10),
  s3: parseInt(process.env.AWG_S3 || '24', 10),
  s4: parseInt(process.env.AWG_S4 || '5', 10),
  h1: process.env.AWG_H1 || '735017314-1784971875',
  h2: process.env.AWG_H2 || '1928766202-1941935460',
  h3: process.env.AWG_H3 || '2096113811-2127150958',
  h4: process.env.AWG_H4 || '2141629287-2145783098',
  i1:
    process.env.AWG_I1 ||
    '<b 0x084481800001000300000000077469636b65747306776964676574096b696e6f706f69736b0272750000010001c00c0005000100000039001806776964676574077469636b6574730679616e646578c025c0390005000100000039002b1765787465726e616c2d7469636b6574732d776964676574066166697368610679616e646578036e657400c05d000100010000001c000457fafe25>',
};

let peers = loadPeers(); // [{ publicKey, ip }]
const serverPublicKey = derivePublicKey();

function loadPeers() {
  try {
    return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function persist() {
  fs.mkdirSync(path.dirname(PEERS_FILE), { recursive: true });
  fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2));
}

function derivePublicKey() {
  try {
    return execFileSync('awg', ['pubkey'], { input: PRIVATE_KEY + '\n' }).toString().trim();
  } catch (e) {
    console.error('[awg] не удалось получить pubkey сервера:', e.message);
    return '';
  }
}

/** Следующий свободный IP в подсети (.2 .. .254). */
function allocateIp() {
  const used = new Set(peers.map((p) => p.ip));
  for (let i = 2; i <= 254; i++) {
    const ip = `${SUBNET}.${i}`;
    if (!used.has(ip)) return ip;
  }
  throw new Error('подсеть исчерпана');
}

function awgAddPeer(publicKey, ip) {
  execFileSync('awg', ['set', IFACE, 'peer', publicKey, 'allowed-ips', `${ip}/32`]);
}
function awgRemovePeer(publicKey) {
  try {
    execFileSync('awg', ['set', IFACE, 'peer', publicKey, 'remove']);
  } catch (e) {
    if (!/not found|does not exist/i.test(e.message || '')) throw e;
  }
}

// Восстановление пиров после рестарта контейнера.
function restorePeers() {
  let ok = 0;
  for (const p of peers) {
    try {
      awgAddPeer(p.publicKey, p.ip);
      ok++;
    } catch (e) {
      console.error(`[awg] restore ${p.publicKey}: ${e.message}`);
    }
  }
  console.log(`[awg] восстановлено пиров: ${ok}/${peers.length}`);
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (!SECRET || req.headers.authorization !== `Bearer ${SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', peers: peers.length }));

app.get('/awg/info', (_req, res) =>
  res.json({ serverPublicKey, listenPort: LISTEN_PORT, subnet: SUBNET, mtu: MTU, params: PARAMS }),
);

app.post('/awg/peers', (req, res) => {
  try {
    let { publicKey } = req.body || {};
    // Если pubkey не передан — генерим пару на сервере (для бота/внешних
    // клиентов, где приватный ключ кладётся в выдаваемый конфиг). Нативный
    // клиент присылает свой publicKey (приватный не покидает устройство).
    let generatedPrivate = null;
    if (!publicKey) {
      generatedPrivate = execFileSync('awg', ['genkey']).toString().trim();
      publicKey = execFileSync('awg', ['pubkey'], { input: generatedPrivate + '\n' })
        .toString()
        .trim();
    }
    let peer = peers.find((p) => p.publicKey === publicKey);
    if (!peer) {
      peer = { publicKey, ip: allocateIp() };
      peers.push(peer);
      persist();
    }
    awgAddPeer(peer.publicKey, peer.ip); // идемпотентно
    res.json({
      address: peer.ip,
      publicKey,
      serverPublicKey,
      listenPort: LISTEN_PORT,
      mtu: MTU,
      params: PARAMS,
      ...(generatedPrivate ? { privateKey: generatedPrivate } : {}),
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.delete('/awg/peers/:publicKey', (req, res) => {
  const pub = req.params.publicKey;
  peers = peers.filter((p) => p.publicKey !== pub);
  persist();
  try {
    awgRemovePeer(pub);
    res.status(204).end();
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

restorePeers();
app.listen(PORT, '0.0.0.0', () => console.log(`[awg] API на :${PORT}`));
