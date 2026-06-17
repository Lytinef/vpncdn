import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppVersionView } from '../api/types';

type Platform = AppVersionView['platform'];

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'android', label: 'Android' },
  { key: 'ios', label: 'iOS' },
  { key: 'windows', label: 'Windows' },
];

interface FormState {
  latestVersion: string;
  latestBuild: number;
  minBuild: number;
  updateUrl: string;
  notes: string;
}

const emptyForm: FormState = {
  latestVersion: '',
  latestBuild: 1,
  minBuild: 0,
  updateUrl: '',
  notes: '',
};

const initForms = (): Record<Platform, FormState> => {
  const init = {} as Record<Platform, FormState>;
  for (const p of PLATFORMS) init[p.key] = { ...emptyForm };
  return init;
};

export default function Versions() {
  const [forms, setForms] = useState<Record<Platform, FormState>>(initForms);
  const [saved, setSaved] = useState<Platform | ''>('');
  const [error, setError] = useState('');

  const load = async () => {
    const list = await api.get<AppVersionView[]>('/admin/app-versions');
    const next = initForms();
    for (const p of PLATFORMS) {
      const row = list.find((v) => v.platform === p.key);
      if (row) {
        next[p.key] = {
          latestVersion: row.latestVersion,
          latestBuild: row.latestBuild,
          minBuild: row.minBuild,
          updateUrl: row.updateUrl ?? '',
          notes: row.notes ?? '',
        };
      }
    }
    setForms(next);
  };
  useEffect(() => void load(), []);

  const update = (platform: Platform, patch: Partial<FormState>) =>
    setForms((f) => ({ ...f, [platform]: { ...f[platform], ...patch } }));

  const save = async (platform: Platform) => {
    setError('');
    setSaved('');
    const f = forms[platform];
    const payload: Record<string, unknown> = {
      latestBuild: f.latestBuild,
      minBuild: f.minBuild,
      updateUrl: f.updateUrl.trim(),
      notes: f.notes,
    };
    if (f.latestVersion.trim()) payload.latestVersion = f.latestVersion.trim();
    try {
      await api.put(`/admin/app-versions/${platform}`, payload);
      setSaved(platform);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h1>Версии приложения</h1>
      <p className="muted">
        Клиент при запуске сравнивает свой build с «актуальным». Если ниже — показывает баннер
        «доступна новая версия»; если ниже «минимального» — обновление обязательно.
      </p>
      {error && <div className="error">{error}</div>}

      {PLATFORMS.map((p) => {
        const f = forms[p.key];
        return (
          <div key={p.key} className="card form-grid" style={{ marginBottom: 16 }}>
            <h2 style={{ gridColumn: '1 / -1', margin: 0 }}>{p.label}</h2>
            <label>
              <span>Актуальная версия (напр. 1.2.0)</span>
              <input
                value={f.latestVersion}
                onChange={(e) => update(p.key, { latestVersion: e.target.value })}
              />
            </label>
            <label>
              <span>Build (versionCode) — по нему сравнение</span>
              <input
                type="number"
                value={f.latestBuild}
                onChange={(e) => update(p.key, { latestBuild: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Мин. build (ниже — обязательное обновление; 0 — нет)</span>
              <input
                type="number"
                value={f.minBuild}
                onChange={(e) => update(p.key, { minBuild: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Ссылка на обновление (TG-канал / стор / APK)</span>
              <input
                value={f.updateUrl}
                onChange={(e) => update(p.key, { updateUrl: e.target.value })}
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span>Что нового</span>
              <textarea
                rows={3}
                value={f.notes}
                onChange={(e) => update(p.key, { notes: e.target.value })}
              />
            </label>
            <button className="btn primary" onClick={() => save(p.key)}>
              Сохранить
            </button>
            {saved === p.key && <span className="badge ok">Сохранено</span>}
          </div>
        );
      })}
    </div>
  );
}
