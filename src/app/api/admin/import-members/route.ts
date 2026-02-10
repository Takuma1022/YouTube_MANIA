import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

type MemberRow = {
  name: string;
  email: string;
};

const toMemberRows = (csvText: string): MemberRow[] => {
  const parsed = Papa.parse<string[]>(csvText.trim(), { skipEmptyLines: true });
  const rows = parsed.data as string[][];
  if (rows.length === 0) return [];

  const header = rows[0].map((cell) => String(cell || '').trim());
  const nameIdx = header.findIndex((h) => /名前|氏名|name/i.test(h));
  const emailIdx = header.findIndex((h) => /メール|mail|email/i.test(h));

  const hasHeader = nameIdx !== -1 || emailIdx !== -1;
  const startIndex = hasHeader ? 1 : 0;

  return rows.slice(startIndex).map((row) => ({
    name: String(row[nameIdx !== -1 ? nameIdx : 0] || '').trim(),
    email: String(row[emailIdx !== -1 ? emailIdx : 1] || '').trim().toLowerCase(),
  }));
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const idToken = String(body?.idToken || '');
    const csvText = String(body?.csvText || '');
    if (!idToken || !csvText) {
      return NextResponse.json({ message: '必要な情報が不足しています。' }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const adminSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const isAdmin = adminSnap.exists && adminSnap.data()?.isAdmin === true;
    if (!isAdmin) {
      return NextResponse.json({ message: '管理者のみ操作できます。' }, { status: 403 });
    }

    const rows = toMemberRows(csvText).filter((row) => row.email);
    if (rows.length === 0) {
      return NextResponse.json({ message: 'CSVに有効なデータがありません。' }, { status: 400 });
    }

    const batch = adminDb.batch();
    rows.forEach((row) => {
      const ref = adminDb.collection('approved_emails').doc(row.email);
      batch.set(
        ref,
        {
          email: row.email,
          name: row.name,
          status: 'approved',
          approved: true,
          approvedAt: new Date(),
          approvedBy: decoded.email || decoded.uid,
        },
        { merge: true }
      );
    });
    await batch.commit();

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (error) {
    return NextResponse.json({ message: 'CSV取り込みに失敗しました。' }, { status: 500 });
  }
}
