import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { BypassEntryView } from '../api/types';

const empty = { type: 'domain' as 'domain' | 'app', value: '', title: '', category: '' };

export default function Bypass() {
  const [items, setItems] = useState<BypassEntryView[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = () => api.get<BypassEntryView[]>('/admin/bypass').then(setItems);
  useEffect(() => void load(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/bypass', form);
      setForm({ ...empty });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggle = async (it: BypassEntryView) => {
    await api.patch(`/admin/bypass/${it.id}`, { isActive: !it.isActive });
    load();
  };

  const remove = async (it: BypassEntryView) => {
    if (!confirm(`Удалить «${it.title}»?`)) return;
    await api.del(`/admin/bypass/${it.id}`);
    load();
  };

  const filtered = items.filter(
    (i) =>
      !filter ||
      i.title.toLowerCase().includes(filter.toLowerCase()) ||
      i.value.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <h1>Список обхода VPN (РФ-сервисы)</h1>
      <p className="muted">
        Приложения и сайты, которые не работают через VPN. Клиент берёт активные записи и
        пропускает их трафик мимо туннеля при включённом обходе.
      </p>

      <form className="card form-inline" onSubmit={submit}>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as 'domain' | 'app' })}
        >
          <option value="domain">Домен</option>
          <option value="app">Приложение</option>
        </select>
        <input
          placeholder={form.type === 'app' ? 'package name (com.example)' : 'домен (example.ru)'}
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          required
        />
        <input
          placeholder="Название"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <input
          placeholder="Категория"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <button className="btn primary" type="submit">
          Добавить
        </button>
      </form>
      {error && <div className="error">{error}</div>}

      <div className="toolbar">
        <input placeholder="Фильтр…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted">{filtered.length} записей</span>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Тип</th>
            <th>Значение</th>
            <th>Название</th>
            <th>Категория</th>
            <th>Активна</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((it) => (
            <tr key={it.id}>
              <td>{it.type === 'app' ? 'приложение' : 'домен'}</td>
              <td><code>{it.value}</code></td>
              <td>{it.title}</td>
              <td>{it.category ?? '—'}</td>
              <td>
                <span className={`badge ${it.isActive ? 'ok' : 'danger'}`}>
                  {it.isActive ? 'да' : 'нет'}
                </span>
              </td>
              <td className="nowrap">
                <button className="btn ghost sm" onClick={() => toggle(it)}>
                  {it.isActive ? 'Выключить' : 'Включить'}
                </button>
                <button className="btn danger sm" onClick={() => remove(it)}>
                  Удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
