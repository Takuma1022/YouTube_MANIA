 'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import type { PageDoc } from '@/types/content';

export default function DashboardPage() {
  const { userProfile, signInWithGoogle, loading } = useAuth();
  const [pages, setPages] = useState<PageDoc[]>([]);

  const toMillis = (value?: any) => {
    if (!value) return 0;
    if (value?.toDate) return value.toDate().getTime();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  useEffect(() => {
    if (!userProfile?.isApproved) return;
    const fetchPages = async () => {
      const q = query(collection(db, 'pages'), where('published', '==', true));
      const snap = await getDocs(q);
      const docs = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as PageDoc[];
      const filtered = docs.filter((page) => {
        if (page.parentSlug) return false;
        if (page.description === '解説ページ') return false;
        if (page.sections?.length === 1 && page.sections[0]?.title === '解説') return false;
        return true;
      });
      const sorted = [...filtered].sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
        const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return toMillis(a.updatedAt) - toMillis(b.updatedAt);
      });
      setPages(sorted);
    };
    fetchPages().catch(() => {});
  }, [userProfile?.isApproved]);

  if (loading) {
    return <div className="text-sm text-slate-300">読み込み中...</div>;
  }

  if (!userProfile) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        <h1 className="text-2xl font-semibold">ログインが必要です</h1>
        <p className="mt-2 text-sm text-slate-200">Gmailでログインしてください。</p>
        <button
          onClick={signInWithGoogle}
          className="mt-6 rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200"
        >
          Gmailでログイン
        </button>
      </div>
    );
  }

  if (!userProfile.isApproved) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-2xl font-semibold">承認待ち</h1>
        <p className="mt-2 text-sm text-slate-200">
          承認が完了すると、会員ページが表示されます。しばらくお待ちください。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-semibold">YouTubeMANIA 資料まとめ</h1>
        <div className="mt-4">
          <a
            href="/"
            className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-100 hover:border-indigo-300/60"
          >
            トップへ戻る
          </a>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {pages.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200">
            公開中のページがありません。準備が整い次第、ここに表示されます。
          </div>
        ) : (
          pages.map((page) => (
            <Link
              key={page.id}
              href={`/dashboard/pages/${page.slug}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:-translate-y-1 hover:border-indigo-400/60"
            >
              <h3 className="text-lg font-semibold">{page.title}</h3>
              <p className="mt-2 text-sm text-slate-200">{page.description || '詳細を見る'}</p>
              <span className="mt-3 inline-flex items-center text-xs text-indigo-200">開く →</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
