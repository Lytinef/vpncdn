import { useState } from 'react';
import { api } from '../api/client';

interface BroadcastResult {
  total: number;
  sent: number;
  failed: number;
}

export default function Broadcast() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState('');

  const send = async () => {
    if (!text.trim()) return;
    if (
      !confirm(
        'Отправить это сообщение ВСЕМ пользователям бота? Действие необратимо.',
      )
    )
      return;
    setSending(true);
    setError('');
    setResult(null);
    try {
      const r = await api.post<BroadcastResult>('/admin/broadcast', { text });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h1>Рассылка</h1>
      <p className="muted">
        Сообщение получат все незаблокированные пользователи бота. Поддерживается
        HTML-разметка Telegram (&lt;b&gt;, &lt;i&gt;, &lt;a href&gt;…).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        maxLength={4096}
        placeholder="Текст рассылки…"
        style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, padding: 12 }}
      />
      <div className="muted" style={{ textAlign: 'right' }}>
        {text.length} / 4096
      </div>
      <button className="btn" onClick={send} disabled={sending || !text.trim()}>
        {sending ? 'Отправляем…' : 'Отправить всем'}
      </button>
      {result && (
        <p style={{ marginTop: 16, color: '#1F9D55' }}>
          Готово: отправлено {result.sent} из {result.total}, ошибок {result.failed}.
        </p>
      )}
      {error && (
        <p style={{ marginTop: 16, color: '#E5484D' }}>{error}</p>
      )}
    </div>
  );
}
