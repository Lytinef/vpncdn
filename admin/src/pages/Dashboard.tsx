import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { DashboardStats } from '../api/types';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<DashboardStats>('/admin/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!stats) return <div>Загрузка…</div>;

  const cards = [
    { label: 'Пользователей', value: stats.usersTotal },
    { label: 'Активных подписок', value: stats.activeSubscriptions },
    { label: 'Активных устройств', value: stats.activeDevices },
    { label: 'Выручка за месяц, ₽', value: stats.revenueThisMonthRub },
  ];

  const load = stats.serverLoad;
  const loadColor = (v: number | null) =>
    v == null ? 'var(--muted)' : v >= 85 ? 'var(--danger)' : v >= 60 ? '#e5a50a' : '#4ade80';

  return (
    <div>
      <h1>Дашборд</h1>
      <div className="cards">
        {cards.map((c) => (
          <div key={c.label} className="card stat">
            <div className="stat-value">{c.value.toLocaleString('ru-RU')}</div>
            <div className="muted">{c.label}</div>
          </div>
        ))}
      </div>

      <h2>Нагрузка серверов</h2>
      {load.nodesReporting === 0 ? (
        <p className="muted">
          Нет данных метрик (узлов с агентом: {load.nodesTotal}). Метрики появятся после первого
          опроса (≤1 мин), если у узла указан URL агента.
        </p>
      ) : (
        <>
          <div className="cards">
            <div className="card stat">
              <div className="stat-value" style={{ color: loadColor(load.maxCpuPercent) }}>
                {load.maxCpuPercent ?? '—'}%
              </div>
              <div className="muted">CPU макс. (сред. {load.avgCpuPercent ?? '—'}%)</div>
            </div>
            <div className="card stat">
              <div className="stat-value" style={{ color: loadColor(load.maxMemPercent) }}>
                {load.maxMemPercent ?? '—'}%
              </div>
              <div className="muted">RAM макс. (сред. {load.avgMemPercent ?? '—'}%)</div>
            </div>
          </div>
          <table className="table" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Узел</th>
                <th>CPU</th>
                <th>RAM</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {load.nodes.map((n) => (
                <tr key={n.id}>
                  <td>{n.name}</td>
                  <td style={{ color: loadColor(n.cpuPercent) }}>
                    {n.cpuPercent ?? '—'}%
                  </td>
                  <td style={{ color: loadColor(n.memPercent) }}>
                    {n.memPercent ?? '—'}%
                  </td>
                  <td className="muted">
                    {n.metricsAt ? new Date(n.metricsAt).toLocaleTimeString('ru-RU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(load.maxCpuPercent ?? 0) >= 85 || (load.maxMemPercent ?? 0) >= 85 ? (
            <p style={{ color: 'var(--danger)' }}>
              ⚠ Высокая нагрузка — пора задуматься о более мощном сервере или добавлении узла.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
