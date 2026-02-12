import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';

const isGmail = (email: string) => email.toLowerCase().endsWith('@gmail.com');

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!name || !email) {
      return NextResponse.json({ message: '名前とGmailを入力してください。' }, { status: 400 });
    }
    if (!isGmail(email)) {
      return NextResponse.json({ message: 'Gmailアドレスのみ受け付けています。' }, { status: 400 });
    }

    const docId = email;
    const existingDoc = await adminDb.collection('applications').doc(docId).get();
    const existingData = existingDoc.exists ? existingDoc.data() : null;

    // 既に承認済みの場合は再申請不要
    if (existingData?.status === 'approved') {
      return NextResponse.json({ message: '既に承認済みです。ログインページからログインしてください。' }, { status: 400 });
    }

    // 既にpending状態の場合
    if (existingData?.status === 'pending') {
      return NextResponse.json({ message: '申請は既に受け付けています。承認までお待ちください。' }, { status: 400 });
    }

    // rejected状態 or 新規 → pending に設定
    await adminDb.collection('applications').doc(docId).set(
      {
        name,
        email,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const isReapply = existingData?.status === 'rejected';
    return NextResponse.json({ ok: true, reapply: isReapply });
  } catch (error) {
    return NextResponse.json({ message: '申請の保存に失敗しました。' }, { status: 500 });
  }
}
