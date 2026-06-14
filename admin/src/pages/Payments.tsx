import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Paginated, PaymentListItem } from '../api/types';

const STATUSES = ['', 'succeeded', 'pending', 'waiting_for_capture', 'canceled', 'failed'];

export default function Payments() {
  const [data, setData] = useState<Paginated<PaymentListItem> | null>(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) q.set('status', status);
    api.get<Paginated<PaymentListItem>>(`/admin/payments?${q}`).then(setData);
  }, [page, status]);

  return (
    <div>
      <h1>Платежи</h1>
      <div className="toolbar">
        <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'все статусы'}
            </option>
          ))}
        </select>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Пользователь</th>
            <th>Сумма, ₽</th>
            <th>Назначение</th>
            <th>Рекуррент</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((p) => (
            <tr key={p.id}>
              <td>{new Date(p.createdAt).toLocaleString('ru-RU')}</td>
              <td>
                <Link to={`/users/${p.userId}`}>{p.userId.slice(0, 8)}…</Link>
              </td>
              <td>{p.amountRub}</td>
              <td>{p.purpose}</td>
              <td>{p.isRecurring ? 'да' : 'нет'}</td>
              <td>
                <span className={`badge ${p.status === 'succeeded' ? 'ok' : ''}`}>{p.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && (
        <div className="pager">
          <button className="btn ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ←
          </button>
          <span className="muted">
            {page} / {Math.max(1, Math.ceil(data.total / limit))}
          </span>
          <button
            className="btn ghost"
            disabled={page >= Math.ceil(data.total / limit)}
            onClick={() => setPage(page + 1)}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
