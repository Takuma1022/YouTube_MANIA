import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

const extractIp = (req: Request) => {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
};

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ message: '認証が必要です。' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(token);
    const email = String(decoded.email || '').toLowerCase();
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const ip = extractIp(req);

    await adminDb.collection('login_events').add({
      uid: decoded.uid,
      email,
      ip,
      userAgent,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: 'ログ記録に失敗しました。' }, { status: 500 });
  }
}
