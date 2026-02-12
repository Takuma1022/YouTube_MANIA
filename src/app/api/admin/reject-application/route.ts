import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const idToken = String(body?.idToken || '');
    const applicationId = String(body?.applicationId || '');
    if (!idToken || !applicationId) {
      return NextResponse.json({ message: '必須情報が不足しています。' }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const adminSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const isAdmin = adminSnap.exists && adminSnap.data()?.isAdmin === true;
    if (!isAdmin) {
      return NextResponse.json({ message: '管理者のみ操作可能です。' }, { status: 403 });
    }

    const appRef = adminDb.collection('applications').doc(applicationId);
    const appSnap = await appRef.get();
    if (!appSnap.exists) {
      return NextResponse.json({ message: '申請が見つかりません。' }, { status: 404 });
    }

    await appRef.set(
      {
        status: 'rejected',
        rejectedAt: FieldValue.serverTimestamp(),
        rejectedBy: decoded.email || decoded.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: '却下処理に失敗しました。' }, { status: 500 });
  }
}
