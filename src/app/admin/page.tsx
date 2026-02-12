 'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import type { LoginEvent } from '@/types/logs';
import { AdminPageBuilder } from '@/components/AdminPageBuilder';

export default function AdminPage() {
  const { userProfile, loading, currentUser } = useAuth();
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState('');

  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    const fetchLogs = async () => {
      const q = query(collection(db, 'login_events'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      const docs = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as LoginEvent[];
      setLoginEvents(docs);
    };
    fetchLogs().catch(() => {});
  }, [userProfile?.isAdmin]);

  const refreshSheets = async () => {
    setRefreshing(true);
    setRefreshResult('');
    try {
      const token = await currentUser?.getIdToken();
      const res = await fetch('/api/admin/refresh-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });
      const data = await res.json();
      if (data.details && data.details.length > 0) {
        setRefreshResult(data.details.join(' / '));
      } else {
        setRefreshResult(data.message || '完了');
      }
    } catch {
      setRefreshResult('更新チェックに失敗しました。');
    }
    setRefreshing(false);
  };

  if (loading) {
    return <div className="text-sm text-slate-300">読み込み中...</div>;
  }

  if (!userProfile?.isAdmin) {
    return <div className="text-sm text-slate-300">管理者のみアクセス可能です。</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-semibold">投稿管理</h1>
      </div>

      <AdminPageBuilder />

      <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h2 className="text-xl font-semibold">スプレッドシート更新チェック</h2>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={refreshSheets}
            disabled={refreshing}
            className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400 disabled:opacity-60"
          >
            {refreshing ? 'チェック中...' : '更新チェック'}
          </button>
          {refreshResult && (
            <span className="text-sm text-slate-200">{refreshResult}</span>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h2 className="text-xl font-semibold">ログインログ</h2>
        <div className="mt-4 space-y-3">
          {loginEvents.length === 0 ? (
            <p className="text-sm text-slate-200">ログがまだありません。</p>
          ) : (
            loginEvents.map((log) => (
              <div key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-100">{log.email}</span>
                  <span className="text-slate-300">{log.ip}</span>
                </div>
                <p className="mt-1 text-slate-400">{log.userAgent}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
