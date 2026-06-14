import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { NodeView } from '../api/types';

const empty = {
  name: '',
  region: '',
  originHost: '',
  cdnDomain: '',
  sni: '',
  port: 443,
  wsPath: '/ws',
  apiUrl: '',
  apiSecret: '',
  capacity: 1000,
  isActive: true,
};

export default function Nodes() {
  const [nodes, setNodes] = useState<NodeView[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState('');

  const load = () => api.get<NodeView[]>('/admin/nodes').then(setNodes);
  useEffect(() => void load(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.sni) payload.sni = form.cdnDomain;
      await api.post('/admin/nodes', payload);
      setForm({ ...empty });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggle = async (n: NodeView) => {
    await api.patch(`/admin/nodes/${n.id}`, { isActive: !n.isActive });
    load();
  };

  const remove = async (n: NodeView) => {
    if (!confirm(`Удалить узел «${n.name}»?`)) return;
    await api.del(`/admin/nodes/${n.id}`);
    load();
  };

  return (
    <div>
      <h1>VPN-узлы (за NGENIX)</h1>

      <table className="table">
        <thead>
          <tr>
            <th>Имя</th>
            <th>CDN-домен</th>
            <th>Origin</th>
            <th>WS</th>
            <th>Устройств</th>
            <th>CPU / RAM</th>
            <th>API</th>
            <th>Активен</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id}>
              <td>{n.name}</td>
              <td>{n.cdnDomain}:{n.port}</td>
              <td>{n.originHost}</td>
              <td>{n.wsPath}</td>
              <td>{n.devices} / {n.capacity}</td>
              <td>{n.cpuPercent ?? '—'}% / {n.memPercent ?? '—'}%</td>
              <td>{n.hasApi ? '✓' : '—'}</td>
              <td>
                <span className={`badge ${n.isActive ? 'ok' : 'danger'}`}>
                  {n.isActive ? 'да' : 'нет'}
                </span>
              </td>
              <td className="nowrap">
                <button className="btn ghost sm" onClick={() => toggle(n)}>
                  {n.isActive ? 'Выключить' : 'Включить'}
                </button>
                <button className="btn danger sm" onClick={() => remove(n)}>
                  Удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Добавить узел</h2>
      <form className="card form-grid" onSubmit={submit}>
        {(
          [
            ['name', 'Имя'],
            ['region', 'Регион'],
            ['cdnDomain', 'CDN-домен (NGENIX)'],
            ['sni', 'SNI (по умолч. = CDN-домен)'],
            ['originHost', 'Origin-хост'],
            ['wsPath', 'WebSocket path'],
            ['apiUrl', 'URL агента Xray (опц.)'],
            ['apiSecret', 'Секрет агента (опц.)'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              value={(form as any)[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          <span>Порт</span>
          <input
            type="number"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>Ёмкость</span>
          <input
            type="number"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary" type="submit">
          Добавить
        </button>
      </form>
    </div>
  );
}
