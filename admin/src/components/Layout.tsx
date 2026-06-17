import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const links = [
  { to: '/', label: 'Дашборд', end: true },
  { to: '/users', label: 'Пользователи' },
  { to: '/payments', label: 'Платежи' },
  { to: '/nodes', label: 'Узлы' },
  { to: '/bypass', label: 'Обход VPN' },
  { to: '/versions', label: 'Версии' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { admin, logout } = useAuth();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Unway</div>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="muted">{admin?.email}</div>
          <button className="btn ghost" onClick={logout}>
            Выйти
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
