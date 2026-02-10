 'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-semibold">ログイン</h1>
        <p className="mt-2 text-sm text-slate-200">
          Gmailアドレスのみログインできます。申請完了後、ログイン可能になります。
        </p>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <button
          onClick={signInWithGoogle}
          className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200"
        >
          Gmailでログイン
        </button>
      </div>
    </div>
  );
}
