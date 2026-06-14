import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Paginated, UserListItem } from '../api/types';

export default function Users() {
  const [data, setData] = useState<Paginated<UserListItem> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const load = () => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) q.set('search', search);
    api.get<Paginated<UserListItem>>(`/admin/users?${q}`).then(setData);
  };

  useEffect(load, [page]);

  return (
    <div>
      <h1>Пользователи</h1>
      <div className="toolbar">
        <input
          placeholder="Поиск по username / имени / Telegram ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
        />
        <button className="btn" onClick={() => (setPage(1), load())}>
          Найти
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Telegram</th>
            <th>Username</th>
            <th>Подписка</th>
            <th>Статус</th>
            <th>Регистрация</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((u) => (
            <tr key={u.id}>
              <td>{u.telegramId}</td>
              <td>{u.username ?? u.firstName ?? '—'}</td>
              <td>{u.subscription ? u.subscription.plan.name : '—'}</td>
              <td>
                {u.isBlocked ? (
                  <span className="badge danger">заблокирован</span>
                ) : u.subscription ? (
                  <span className="badge ok">{u.subscription.status}</span>
                ) : (
                  <span className="badge">нет</span>
                )}
              </td>
              <td>{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
              <td>
                <Link className="btn ghost sm" to={`/users/${u.id}`}>
                  Открыть
                </Link>
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
            {page} / {Math.max(1, Math.ceil(data.total / limit))} · всего {data.total}
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
