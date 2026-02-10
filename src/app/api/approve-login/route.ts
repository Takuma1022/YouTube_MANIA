import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ message: '認証が必要です。' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(token);
    const email = String(decoded.email || '').toLowerCase();
    if (!email.endsWith('@gmail.com')) {
      return NextResponse.json({ message: 'Gmail以外は許可されていません。' }, { status: 403 });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const isAdminEmail = adminEmails.includes(email);

    const approvedSnap = await adminDb.collection('approved_emails').doc(email).get();
    const approved = approvedSnap.exists && approvedSnap.data()?.approved === true;
    if (!approved && !isAdminEmail) {
      return NextResponse.json({ message: '承認されていません。' }, { status: 403 });
    }

    await adminDb.collection('users').doc(decoded.uid).set(
      {
        uid: decoded.uid,
        email,
        displayName: decoded.name || '',
        photoURL: decoded.picture || '',
        isApproved: true,
        isAdmin: isAdminEmail,
        approvedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (isAdminEmail) {
      await adminDb.collection('approved_emails').doc(email).set(
        {
          email,
          approved: true,
          approvedAt: FieldValue.serverTimestamp(),
          approvedBy: 'system-admin-seed',
        },
        { merge: true }
      );
    }

    return NextResponse.json({ ok: true, approved: true });
  } catch (error) {
    return NextResponse.json({ message: '承認チェックに失敗しました。' }, { status: 500 });
  }
}
