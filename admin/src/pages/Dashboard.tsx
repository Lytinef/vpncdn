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
    </div>
  );
}
