import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

type MemberPayload = {
  email: string;
  name?: string;
  status?: 'pending' | 'approved' | 'suspended';
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const idToken = String(body?.idToken || '');
    const action = String(body?.action || '');
    const member = (body?.member || {}) as MemberPayload;

    if (!idToken || !action) {
      return NextResponse.json({ message: '必要な情報が不足しています。' }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const adminSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const isAdmin = adminSnap.exists && adminSnap.data()?.isAdmin === true;
    if (!isAdmin) {
      return NextResponse.json({ message: '管理者のみ操作できます。' }, { status: 403 });
    }

    const email = String(member.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ message: 'メールアドレスが必要です。' }, { status: 400 });
    }

    const ref = adminDb.collection('approved_emails').doc(email);

    if (action === 'delete') {
      await ref.delete();
      return NextResponse.json({ ok: true });
    }

    const status = (member.status || 'approved') as MemberPayload['status'];
    await ref.set(
      {
        email,
        name: String(member.name || ''),
        status,
        approved: status === 'approved',
        updatedAt: new Date(),
        approvedAt: status === 'approved' ? new Date() : null,
        approvedBy: decoded.email || decoded.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: '会員操作に失敗しました。' }, { status: 500 });
  }
}
