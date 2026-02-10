import { HomeGate } from '@/components/HomeGate';

export default function Home() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-16 pt-6">
      <HomeGate />
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl shadow-indigo-500/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.25),transparent_55%)]" />
        <p className="text-sm uppercase tracking-[0.3em] text-indigo-200">Members Only</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
          YouTube MANIA 会員サイト
        </h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="/apply"
            className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400"
          >
            参加申請をする
          </a>
          <a
            href="/dashboard"
            className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white hover:border-white/60"
          >
            会員ページへ
          </a>
        </div>
      </section>


      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-2xl font-semibold">使い方ガイド</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-200">
            <li>1. 参加申請 → 承認後にログインできます。</li>
            <li>2. 会員ページから学習コンテンツを選択。</li>
            <li>3. 動画/音声/テキストをいつでも見返せます。</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-2xl font-semibold">困ったときは</h2>
          <p className="mt-4 text-sm text-slate-200">
            表示に問題がある場合は、一度ログアウトしてから再ログインしてください。
            それでも解決しない場合は、運営にご連絡ください。
          </p>
        </div>
      </section>

      <div className="flex justify-end">
        <a
          href="/login"
          className="text-xs text-slate-500/40 hover:text-slate-300/70"
          aria-label="管理者ログイン"
        >
          ©
        </a>
      </div>
    </div>
  );
}
