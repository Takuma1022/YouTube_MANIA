import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 64);

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
    if (!idToken) {
      return NextResponse.json({ message: '認証が必要です。' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const adminSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const isAdmin = adminSnap.exists && adminSnap.data()?.isAdmin === true;
    if (!isAdmin) {
      return NextResponse.json({ message: '管理者のみ操作できます。' }, { status: 403 });
    }

    // 全ページを取得し、sourceKeyを持つメインページだけフィルタ
    const pagesSnap = await adminDb.collection('pages').get();

    const pagesBySourceKey = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    pagesSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.sourceKey && typeof data.sourceKey === 'string' && data.sourceKey.length > 0 && !data.parentSlug) {
        pagesBySourceKey.set(data.sourceKey, d);
      }
    });

    if (pagesBySourceKey.size === 0) {
      return NextResponse.json({ message: '更新対象のページがありません。', updated: 0 });
    }

    let updatedCount = 0;
    const results: string[] = [];

    for (const [sourceKey, pageDoc] of pagesBySourceKey) {
      const [sheetId, gid] = sourceKey.split(':');
      if (!sheetId || !gid) continue;

      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
      let csvText: string;
      try {
        const res = await fetch(csvUrl, { cache: 'no-store' });
        if (!res.ok) continue;
        csvText = await res.text();
      } catch {
        continue;
      }

      const table = toSheetTable(csvText);
      if (!table || table.headers.length === 0 || table.rows.length === 0) continue;

      const pageData = pageDoc.data();
      const existingTable = pageData.sections?.[0]?.items?.[0]?.table;
      if (!existingTable) continue;

      // 既存行の1列目の値をセットにして重複チェック
      const existingKeys = new Set<string>();
      (existingTable.rows || []).forEach((row: any) => {
        const firstCell = row.cells?.[0];
        const key = firstCell?.type === 'link'
          ? (firstCell.label || firstCell.url || '')
          : (firstCell?.value || '');
        if (key) existingKeys.add(key.trim());
      });

      // スプレッドシートの行のうち、既存に無いものだけ抽出
      const addedRows: string[][] = [];
      table.rows.forEach((row) => {
        const firstCol = (row[0] || '').trim();
        if (!firstCol) return;
        if (!existingKeys.has(firstCol)) {
          addedRows.push(row);
        }
      });

      if (addedRows.length === 0) {
        results.push(`${pageData.title}: 変更なし`);
        continue;
      }

      const pageSlugBase = pageData.slug || pageDoc.id;

      const detailColumnIndexes = table.headers
        .map((header: string, idx: number) => ({ header, idx }))
        .filter(({ header }: { header: string }) => /解説|説明|詳細/.test(header));

      const newDetailPages: any[] = [];

      const newTableRows = addedRows.map((row, addedIndex) => {
        const existingRowCount = existingTable.rows?.length || 0;
        const rowIndex = existingRowCount + addedIndex;
        let detailUrl: string | undefined;
        const cells = row.map((value, colIndex) => {
          const header = table.headers[colIndex] || `列${colIndex + 1}`;
          const trimmed = value.trim();
          if (!trimmed) {
            return { type: 'text' as const, value: '' };
          }
          if (isUrl(trimmed)) {
            return { type: 'link' as const, label: 'リンクを開く', url: trimmed };
          }

          const isDetailColumn = detailColumnIndexes.some((item: { idx: number }) => item.idx === colIndex);
          if (isDetailColumn && trimmed.length > 0) {
            const baseTitle = row[0]?.trim() || `解説 ${rowIndex + 1}`;
            const detailSlug = slugify(`${pageSlugBase}-${baseTitle}-${header}-${rowIndex + 1}`);
            newDetailPages.push({
              slug: detailSlug,
              title: baseTitle,
              description: header,
              published: pageData.published ?? false,
              parentSlug: pageSlugBase,
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
            return { type: 'link' as const, label: `${header}を読む`, url: `/dashboard/pages/${detailSlug}` };
          }

          return { type: 'text' as const, value: trimmed };
        });
        const rowData: any = { cells };
        if (detailUrl) rowData.detailUrl = detailUrl;
        return rowData;
      });

      // 既存テーブルに新しい行を追記（undefinedを除去）
      const cleanRows = (existingTable.rows || []).map((r: any) => {
        const cleaned: any = { cells: r.cells };
        if (r.detailUrl) cleaned.detailUrl = r.detailUrl;
        return cleaned;
      });
      const updatedRows = [...cleanRows, ...newTableRows];
      const updatedSections = [{
        ...pageData.sections[0],
        items: [{
          ...pageData.sections[0].items[0],
          table: {
            headers: table.headers,
            rows: updatedRows,
          },
        }],
      }];

      // メインページを更新
      await adminDb.collection('pages').doc(pageDoc.id).update({
        sections: updatedSections,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 新しい解説ページを保存
      for (const detail of newDetailPages) {
        await adminDb.collection('pages').doc(detail.slug).set({
          ...detail,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      updatedCount++;
      results.push(`${pageData.title}: ${addedRows.length}行追加`);
    }

    return NextResponse.json({
      message: updatedCount > 0
        ? `${updatedCount}件のページを更新しました。`
        : '新しいデータはありませんでした。',
      updated: updatedCount,
      details: results,
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    return NextResponse.json({ message: `更新チェックに失敗しました: ${msg}` }, { status: 500 });
  }
}
