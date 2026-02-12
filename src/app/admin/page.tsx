 'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import type { Application } from '@/types/application';
import type { LoginEvent } from '@/types/logs';
import { AdminPageBuilder } from '@/components/AdminPageBuilder';

export default function AdminPage() {
  const { userProfile, loading, currentUser } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState('');

  const refresh = async () => {
    const q = query(collection(db, 'applications'), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    const docs = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as Application[];
    setApplications(docs);
  };

  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    refresh().catch(() => {});
    const fetchLogs = async () => {
      const q = query(collection(db, 'login_events'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      const docs = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as LoginEvent[];
      setLoginEvents(docs);
    };
    fetchLogs().catch(() => {});
  }, [userProfile?.isAdmin]);

  const approve = async (app: Application) => {
    if (!app.email) return;
    const token = await currentUser?.getIdToken();
    if (!token) return;
    await fetch('/api/admin/approve-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: app.id, idToken: token }),
    });
    await refresh();
  };

  const reject = async (app: Application) => {
    if (!app.email) return;
    if (!confirm(`${app.name}（${app.email}）の申請を却下しますか？`)) return;
    const token = await currentUser?.getIdToken();
    if (!token) return;
    await fetch('/api/admin/reject-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: app.id, idToken: token }),
    });
    await refresh();
  };

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
        <h1 className="text-3xl font-semibold">管理画面</h1>
        <p className="mt-2 text-sm text-slate-200">承認とページの作成・公開を行います。</p>
      </div>

      <AdminPageBuilder />

      <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h2 className="text-xl font-semibold">スプレッドシート更新チェック</h2>
        <p className="mt-2 text-sm text-slate-200">
          保存済みページのスプレッドシートに新しい行が追加されていないかチェックし、あれば自動で追記します。
        </p>
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
        <h2 className="text-xl font-semibold">参加申請</h2>
        <div className="mt-4 space-y-3">
          {applications.length === 0 ? (
            <p className="text-sm text-slate-200">承認待ちの申請はありません。</p>
          ) : (
            applications.map((app) => (
              <div key={app.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4">
                <div>
                  <p className="text-sm font-semibold">{app.name}</p>
                  <p className="text-xs text-slate-300">{app.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => approve(app)}
                    className="rounded-full bg-emerald-400 px-4 py-1 text-xs font-semibold text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-300"
                  >
                    承認
                  </button>
                  <button
                    onClick={() => reject(app)}
                    className="rounded-full bg-rose-500 px-4 py-1 text-xs font-semibold text-white shadow-lg shadow-rose-500/30 hover:bg-rose-400"
                  >
                    却下
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h2 className="text-xl font-semibold">ログインログ</h2>
        <p className="mt-2 text-sm text-slate-200">最新50件を表示しています。</p>
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
