import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { SubscriptionView } from '../api/types';

interface UserDetailData {
  user: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    isBlocked: boolean;
    createdAt: string;
  };
  subscriptions: (SubscriptionView | null)[];
  devices: { id: string; name: string; platform: string; isActive: boolean; lastSeenAt: string | null }[];
  payments: { id: string; amountRub: number; status: string; purpose: string; createdAt: string }[];
}

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<UserDetailData | null>(null);

  const load = () => api.get<UserDetailData>(`/admin/users/${id}`).then(setData);
  useEffect(() => void load(), [id]);

  const toggleBlock = async () => {
    if (!data) return;
    await api.post(`/admin/users/${id}/${data.user.isBlocked ? 'unblock' : 'block'}`);
    load();
  };

  const removeUser = async () => {
    if (!confirm('Удалить аккаунт со всеми данными? Деньги не возвращаются.')) return;
    await api.del(`/admin/users/${id}`);
    navigate('/users');
  };

  if (!data) return <div>Загрузка…</div>;
  const u = data.user;

  return (
    <div>
      <button className="btn ghost" onClick={() => navigate('/users')}>
        ← Назад
      </button>
      <h1>{u.username ?? u.firstName ?? u.telegramId}</h1>

      <div className="card">
        <div className="row">
          <div>
            <div className="muted">Telegram ID</div>
            <div>{u.telegramId}</div>
          </div>
          <div>
            <div className="muted">Имя</div>
            <div>{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</div>
          </div>
          <div>
            <div className="muted">Регистрация</div>
            <div>{new Date(u.createdAt).toLocaleString('ru-RU')}</div>
          </div>
          <div>
            <div className="muted">Статус</div>
            <div>{u.isBlocked ? 'заблокирован' : 'активен'}</div>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={toggleBlock}>
            {u.isBlocked ? 'Разблокировать' : 'Заблокировать'}
          </button>
          <button className="btn danger" onClick={removeUser}>
            Удалить аккаунт
          </button>
        </div>
      </div>

      <h2>Подписки</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Тариф</th>
            <th>Статус</th>
            <th>Период до</th>
            <th>Автопродление</th>
            <th>След. тариф</th>
          </tr>
        </thead>
        <tbody>
          {data.subscriptions.filter(Boolean).map((s) => (
            <tr key={s!.id}>
              <td>{s!.plan.name}</td>
              <td>{s!.status}</td>
              <td>{s!.currentPeriodEnd ? new Date(s!.currentPeriodEnd).toLocaleDateString('ru-RU') : '—'}</td>
              <td>{s!.autoRenew ? 'да' : 'нет'}</td>
              <td>{s!.nextPlan?.name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Устройства ({data.devices.length})</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Название</th>
            <th>Платформа</th>
            <th>Активно</th>
            <th>Последняя активность</th>
          </tr>
        </thead>
        <tbody>
          {data.devices.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td>{d.platform}</td>
              <td>{d.isActive ? 'да' : 'нет'}</td>
              <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('ru-RU') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Платежи</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Сумма, ₽</th>
            <th>Назначение</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {data.payments.map((p) => (
            <tr key={p.id}>
              <td>{new Date(p.createdAt).toLocaleString('ru-RU')}</td>
              <td>{p.amountRub}</td>
              <td>{p.purpose}</td>
              <td>{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
