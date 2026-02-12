import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 64);

const extractSheetInfo = (url: string) => {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/gid=(\d+)/);
  return {
    sheetId: idMatch?.[1] || '',
    gid: gidMatch?.[1] || '0',
  };
};

const isUrl = (value: string) => /^https?:\/\//i.test(value);

const formatDetailText = (value: string) => {
  const sentences = value
    .split('。')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `${s}。`);
  if (sentences.length === 0) return '';
  const formatted: string[] = [];
  sentences.forEach((sentence) => {
    formatted.push(sentence);
    if (sentence.length >= 60) {
      formatted.push('');
    }
  });
  return formatted.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const toSheetTable = (csvText: string): { headers: string[]; rows: string[][] } => {
  const parsed = Papa.parse<string[]>(csvText.trim(), { skipEmptyLines: true });
  const rows = parsed.data as string[][];
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((cell) => String(cell || '').trim());
  const bodyRows = rows
    .slice(1)
    .map((row) => headers.map((_, idx) => String(row[idx] || '').trim()));
  return { headers, rows: bodyRows };
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const idToken = String(body?.idToken || '');
    const sheetUrl = String(body?.sheetUrl || '');
    if (!idToken || !sheetUrl) {
      return NextResponse.json({ message: '必要な情報が不足しています。' }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const adminSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const isAdmin = adminSnap.exists && adminSnap.data()?.isAdmin === true;
    if (!isAdmin) {
      return NextResponse.json({ message: '管理者のみ操作できます。' }, { status: 403 });
    }

    const { sheetId, gid } = extractSheetInfo(sheetUrl);
    if (!sheetId) {
      return NextResponse.json({ message: 'スプレッドシートURLが正しくありません。' }, { status: 400 });
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
    const res = await fetch(csvUrl, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ message: 'スプレッドシートを読み込めませんでした。' }, { status: 400 });
    }
    const csvText = await res.text();
    const table = toSheetTable(csvText);
    if (!table || table.headers.length === 0 || table.rows.length === 0) {
      return NextResponse.json({ message: 'データが見つかりませんでした。' }, { status: 400 });
    }

    const detailPages: any[] = [];
    const sourceKey = `${sheetId}:${gid}`;
    const pageSlugBase = slugify(`sheet-${sheetId.slice(0, 6)}-${gid}`);
    const detailColumnIndexes = table.headers
      .map((header, idx) => ({ header, idx }))
      .filter(({ header }) => /解説|説明|詳細/.test(header));

    const tableRows = table.rows.map((row, rowIndex) => {
      let detailUrl: string | undefined;
      const cells = row.map((value, colIndex) => {
        const header = table.headers[colIndex] || `列${colIndex + 1}`;
        const trimmed = value.trim();
        if (!trimmed) {
          return { type: 'text', value: '' };
        }
        if (isUrl(trimmed)) {
          return { type: 'link', label: 'リンクを開く', url: trimmed };
        }

        const isDetailColumn = detailColumnIndexes.some((item) => item.idx === colIndex);
        if (isDetailColumn && trimmed.length > 0) {
          const baseTitle = row[0]?.trim() || `解説 ${rowIndex + 1}`;
          const detailSlug = slugify(`${pageSlugBase}-${baseTitle}-${header}-${rowIndex + 1}`);
          detailPages.push({
            id: detailSlug,
            slug: detailSlug,
            title: baseTitle,
            description: header,
            published: false,
            parentSlug: '',
            sourceKey,
            sections: [
              {
                id: `${detailSlug}-section`,
                title: header,
                items: [
                  {
                    id: `${detailSlug}-text`,
                    type: 'text',
                    title: baseTitle,
                    text: formatDetailText(trimmed),
                  },
                ],
              },
            ],
          });
          detailUrl = detailUrl || `/dashboard/pages/${detailSlug}`;
          return { type: 'link', label: `${header}を読む`, url: `/dashboard/pages/${detailSlug}` };
        }

        return { type: 'text', value: trimmed };
      });
      return { cells, detailUrl };
    });

    const sections = [
      {
        id: 'sheet-table',
        title: '一覧',
        items: [
          {
            id: 'sheet-table-item',
            type: 'table',
            table: {
              headers: table.headers,
              rows: tableRows,
            },
          },
        ],
      },
    ];

    const pageTitle = 'スプレッドシート取り込み';
    const page = {
      id: pageSlugBase,
      slug: pageSlugBase,
      title: pageTitle,
      description: 'スプレッドシートの内容を一覧にしました。',
      published: false,
      order: Date.now(),
      sections,
      sourceKey,
      detailPages,
    };

    page.detailPages = page.detailPages?.map((detail) => ({
      ...detail,
      parentSlug: page.slug,
    }));

    return NextResponse.json({ page });
  } catch (error) {
    return NextResponse.json({ message: '取り込みに失敗しました。' }, { status: 500 });
  }
}
