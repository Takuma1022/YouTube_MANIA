 'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';

type MemberStatus = 'pending' | 'approved' | 'suspended';

type ApprovedMember = {
  email: string;
  name?: string;
  status?: MemberStatus;
  approvedAt?: any;
};

type LoginEvent = {
  email: string;
  ip: string;
  userAgent: string;
  createdAt?: any;
};

const formatDateTime = (value?: any) => {
  if (!value) return '未ログイン';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '未ログイン';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export default function MembersPage() {
  const { userProfile, signInWithGoogle, loading } = useAuth();
  const [members, setMembers] = useState<ApprovedMember[]>([]);
  const [logs, setLogs] = useState<LoginEvent[]>([]);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<MemberStatus>('approved');

  const loadMembers = async () => {
    const snap = await getDocs(collection(db, 'approved_emails'));
    const docs = snap.docs.map((doc) => ({ ...(doc.data() as any) })) as ApprovedMember[];
    setMembers(docs);
  };

  const loadLogs = async () => {
    const q = query(collection(db, 'login_events'), orderBy('createdAt', 'desc'), limit(300));
    const snap = await getDocs(q);
    const docs = snap.docs.map((doc) => ({ ...(doc.data() as any) })) as LoginEvent[];
    setLogs(docs);
  };

  useEffect(() => {
    loadMembers().catch(() => {});
    loadLogs().catch(() => {});
  }, []);

  const lastLoginMap = useMemo(() => {
    const map = new Map<string, LoginEvent>();
    logs.forEach((log) => {
      if (!log.email) return;
      if (!map.has(log.email)) {
        map.set(log.email, log);
      }
    });
    return map;
  }, [logs]);

  const importCsv = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setMessage('');
    const token = await (await import('firebase/auth')).getAuth().currentUser?.getIdToken();
    const text = await file.text();
    const res = await fetch('/api/admin/import-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText: text, idToken: token }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data?.message || 'CSV取り込みに失敗しました');
    } else {
      setMessage('CSVを取り込みました');
      await loadMembers();
    }
    setImporting(false);
  };

  const addManualMember = async () => {
    const name = manualName.trim();
    const email = manualEmail.trim().toLowerCase();
    if (!name || !email) {
      setMessage('名前とメールアドレスを入力してください');
      return;
    }
    const token = await (await import('firebase/auth')).getAuth().currentUser?.getIdToken();
    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: token,
        action: 'upsert',
        member: { email, name, status: 'approved' },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data?.message || '会員の追加に失敗しました');
      return;
    }
    setManualName('');
    setManualEmail('');
    setMessage('会員を追加しました');
    await loadMembers();
  };

  const deleteMember = async (email: string) => {
    if (!confirm(`「${email}」を削除しますか？`)) return;
    const token = await (await import('firebase/auth')).getAuth().currentUser?.getIdToken();
    await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token, action: 'delete', member: { email } }),
    });
    await loadMembers();
  };

  const startEdit = (member: ApprovedMember) => {
    setEditingEmail(member.email);
    setEditName(member.name || '');
    setEditEmail(member.email);
    setEditStatus(member.status || 'approved');
  };

  const cancelEdit = () => {
    setEditingEmail(null);
    setEditName('');
    setEditEmail('');
    setEditStatus('approved');
  };

  const saveEdit = async () => {
    if (!editingEmail) return;
    const newEmail = editEmail.trim().toLowerCase();
    if (!newEmail) return;
    const token = await (await import('firebase/auth')).getAuth().currentUser?.getIdToken();
    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: token,
        action: 'upsert',
        member: { email: newEmail, name: editName.trim(), status: editStatus },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data?.message || '保存に失敗しました');
      return;
    }
    if (newEmail !== editingEmail) {
      await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token, action: 'delete', member: { email: editingEmail } }),
      });
    }
    cancelEdit();
    await loadMembers();
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-slate-200">
        読み込み中...
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        <h1 className="text-2xl font-semibold">ログインが必要です</h1>
        <p className="mt-2 text-sm text-slate-200">管理画面を利用するにはログインしてください。</p>
        <button
          onClick={signInWithGoogle}
          className="mt-6 rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200"
        >
          Gmailでログイン
        </button>
      </div>
    );
  }

  if (!userProfile.isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-2xl font-semibold">管理者のみアクセス可能です</h1>
        <p className="mt-2 text-sm text-slate-200">管理権限が必要です。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-semibold">会員名簿管理</h1>
        <p className="mt-2 text-sm text-slate-200">会員の基本情報と最終ログインを確認できます。</p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h2 className="text-lg font-semibold">会員検索</h2>
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="名前またはメールで検索"
          className="mt-3 w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-100"
        />
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h2 className="text-lg font-semibold">手動追加</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={manualName}
            onChange={(event) => setManualName(event.target.value)}
            placeholder="名前"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
          />
          <input
            value={manualEmail}
            onChange={(event) => setManualEmail(event.target.value)}
            placeholder="メールアドレス"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div className="mt-3">
          <button
            onClick={addManualMember}
            className="rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400"
          >
            追加
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h2 className="text-lg font-semibold">CSV一括登録</h2>
        <p className="mt-2 text-xs text-slate-300">
          「名前」「メールアドレス」の2列を含むCSVをアップロードしてください。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-100 hover:border-indigo-300/60">
            ファイルを選択
            <input
              type="file"
              accept=".csv"
              onChange={(event) => importCsv(event.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          {importing && <span className="text-xs text-slate-300">取り込み中...</span>}
          {message && <span className="text-xs text-emerald-200">{message}</span>}
        </div>
      </div>

      {(['pending', 'approved', 'suspended'] as MemberStatus[]).map((status) => {
        const title =
          status === 'pending' ? '承認待ち' : status === 'approved' ? '承認済み' : '停止';
        const list = members
          .filter((member) => (member.status || 'approved') === status)
          .filter((member) => {
            if (!searchText.trim()) return true;
            const q = searchText.toLowerCase();
            return (
              (member.name || '').toLowerCase().includes(q) ||
              (member.email || '').toLowerCase().includes(q)
            );
          });
        return (
          <div key={status} className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-lg font-semibold">{title}</h2>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
              <table className="min-w-[720px] w-full border-collapse text-xs text-slate-100">
                <thead>
                  <tr className="bg-white/5 text-slate-300">
                    <th className="border-b border-white/10 px-4 py-3 text-left">名前</th>
                    <th className="border-b border-white/10 px-4 py-3 text-left">メール</th>
                    <th className="border-b border-white/10 px-4 py-3 text-left">最終ログイン</th>
                    <th className="border-b border-white/10 px-4 py-3 text-left">最終ログイン場所</th>
                    <th className="border-b border-white/10 px-4 py-3 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((member, index) => {
                    const log = lastLoginMap.get(member.email || '');
                    const isEditing = editingEmail === member.email;
                    return (
                      <tr key={`${member.email}-${index}`} className="border-b border-white/5">
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs"
                            />
                          ) : (
                            member.name || '未設定'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs"
                            />
                          ) : (
                            member.email
                          )}
                        </td>
                        <td className="px-4 py-3">{formatDateTime(log?.createdAt)}</td>
                        <td className="px-4 py-3">{log?.ip || '未ログイン'}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <select
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value as MemberStatus)}
                                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-100"
                              >
                                <option value="pending">承認待ち</option>
                                <option value="approved">承認済み</option>
                                <option value="suspended">停止</option>
                              </select>
                              <button
                                onClick={saveEdit}
                                className="rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200"
                              >
                                保存
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200"
                              >
                                キャンセル
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => startEdit(member)}
                                className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => deleteMember(member.email)}
                                className="rounded-full border border-rose-400/40 px-3 py-1 text-xs text-rose-200"
                              >
                                削除
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                        該当する会員がいません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
