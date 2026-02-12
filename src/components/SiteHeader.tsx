 'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const SiteHeader = () => {
  const { userProfile, signOut, signInWithGoogle } = useAuth();
  const [message, setMessage] = useState('');
  const isAdmin = userProfile?.isAdmin;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-10">
        <Link href="/" className="text-lg font-semibold tracking-wide">
          YouTube MANIA
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-200">
          {(!userProfile || isAdmin) && (
            <Link href="/" className="hover:text-white">
              トップ
            </Link>
          )}
          <Link href="/dashboard" className="hover:text-white">
            会員ページ
          </Link>
          {!userProfile && (
            <Link href="/apply" className="hover:text-white">
              申請
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin" className="hover:text-white">
              管理画面
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/pages" className="hover:text-white">
              保存済ページ
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/members" className="hover:text-white">
              会員名簿
            </Link>
          )}
          {userProfile ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-400 md:inline">{userProfile.email}</span>
              <button
                onClick={signOut}
                className="rounded-full border border-white/20 px-3 py-1 text-xs hover:border-white/60"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <button
              onClick={async () => {
                setMessage('');
                try {
                  await signInWithGoogle();
                } catch (error: any) {
                  setMessage(error?.message || 'ログインに失敗しました');
                }
              }}
              className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-200"
            >
              Gmailでログイン
            </button>
          )}
        </nav>
      </div>
      {message && <div className="border-t border-white/10 px-4 pb-3 text-xs text-rose-200 md:px-10">{message}</div>}
    </header>
  );
};
