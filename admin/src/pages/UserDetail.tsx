import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { SubscriptionView, PlanView } from '../api/types';

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
  traffic: { uplinkBytes: number; downlinkBytes: number; totalBytes: number };
  subscriptions: (SubscriptionView | null)[];
  devices: {
    id: string;
    name: string;
    platform: string;
    isActive: boolean;
    lastSeenAt: string | null;
    uplinkBytes: number;
    downlinkBytes: number;
  }[];
  payments: { id: string; amountRub: number; status: string; purpose: string; createdAt: string }[];
}

function fmtBytes(n: number): string {
  if (!n) return '0';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<UserDetailData | null>(null);
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [planCode, setPlanCode] = useState('start');
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<UserDetailData>(`/admin/users/${id}`).then(setData);
  useEffect(() => void load(), [id]);
  useEffect(() => {
    api.get<PlanView[]>('/plans').then((p) => {
      setPlans(p);
      if (p.length) setPlanCode(p[0].code);
    });
  }, []);

  const subAction = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${id}/subscription/${path}`, body);
      await load();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = async (deviceId: string) => {
    if (!confirm('Отозвать устройство? Доступ к VPN на нём прекратится.')) return;
    await api.del(`/admin/users/${id}/devices/${deviceId}`);
    load();
  };

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
  const current = data.subscriptions.find(Boolean) as SubscriptionView | undefined;

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

      <h2>Управление подпиской</h2>
      <div className="card">
        <div className="muted" style={{ marginBottom: 10 }}>
          {current
            ? `Текущая: ${current.plan.name} · ${current.status} · до ${
                current.currentPeriodEnd
                  ? new Date(current.currentPeriodEnd).toLocaleDateString('ru-RU')
                  : '—'
              }`
            : 'Подписки нет'}
        </div>

        <div className="form-inline" style={{ marginBottom: 12 }}>
          <select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} · {p.priceRub} ₽ · {p.deviceLimit} устр.
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ width: 90 }}
            title="дней"
          />
          <button className="btn primary" disabled={busy} onClick={() => subAction('grant', { planCode, days })}>
            Выдать / обновить
          </button>
          <button className="btn" disabled={busy} onClick={() => subAction('extend', { days })}>
            Продлить на {days} дн.
          </button>
        </div>

        <div className="actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() => subAction('change-plan', { planCode, immediate: true })}
          >
            Сменить тариф сейчас
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => subAction('change-plan', { planCode, immediate: false })}
          >
            Сменить со след. периода
          </button>
          {current?.cancelAtPeriodEnd ? (
            <button className="btn" disabled={busy} onClick={() => subAction('resume')}>
              Возобновить
            </button>
          ) : (
            <button className="btn danger" disabled={busy} onClick={() => subAction('cancel')}>
              Отменить
            </button>
          )}
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
      <p className="muted">
        Всего трафика: ↓ {fmtBytes(data.traffic.downlinkBytes)} · ↑ {fmtBytes(data.traffic.uplinkBytes)} ·
        Σ {fmtBytes(data.traffic.totalBytes)}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Название</th>
            <th>Платформа</th>
            <th>Активно</th>
            <th>Трафик (↓ / ↑)</th>
            <th>Последняя активность</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.devices.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td>{d.platform}</td>
              <td>{d.isActive ? 'да' : 'нет'}</td>
              <td>{fmtBytes(d.downlinkBytes)} / {fmtBytes(d.uplinkBytes)}</td>
              <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('ru-RU') : '—'}</td>
              <td>
                <button className="btn danger sm" onClick={() => removeDevice(d.id)}>
                  Отозвать
                </button>
              </td>
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
