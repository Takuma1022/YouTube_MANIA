import { ApplicationForm } from '@/components/ApplicationForm';

export default function ApplyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-semibold">参加申請</h1>
        <p className="mt-2 text-sm text-slate-200">
          まずはお名前とGmailアドレスを登録してください。確認後にログインできるようになります。
        </p>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <ApplicationForm />
      </div>
    </div>
  );
}
