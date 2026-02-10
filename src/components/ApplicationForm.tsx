 'use client';

import { useState } from 'react';

export const ApplicationForm = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('submitting');
    setMessage('');
    const res = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    if (res.ok) {
      setStatus('done');
      setMessage('申請を受け付けました。承認までお待ちください。');
      setName('');
      setEmail('');
      return;
    }
    const data = await res.json().catch(() => ({}));
    setStatus('error');
    setMessage(data?.message || '送信に失敗しました');
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="text-xs text-slate-300">お名前</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
          placeholder="山田 太郎"
        />
      </div>
      <div>
        <label className="text-xs text-slate-300">Gmailアドレス</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
          placeholder="example@gmail.com"
        />
        <p className="mt-1 text-xs text-slate-400">Gmail以外は受け付けません。</p>
      </div>
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
      >
        申請を送信
      </button>
      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-rose-300' : 'text-emerald-200'}`}>{message}</p>
      )}
    </form>
  );
};
