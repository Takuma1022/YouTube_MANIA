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
    await adminDb.collection('applications').doc(docId).set(
      {
        name,
        email,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: '申請の保存に失敗しました。' }, { status: 500 });
  }
}
