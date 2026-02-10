 'use client';

import { useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebaseClient';
import type { ContentItem, ContentItemType, PageDoc } from '@/types/content';
import { useAuth } from '@/contexts/AuthContext';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 64);

export const AdminPageBuilder = () => {
  const { userProfile, currentUser } = useAuth();
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState<PageDoc | null>(null);
  const [message, setMessage] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [itemType, setItemType] = useState<ContentItemType>('text');
  const [itemTitle, setItemTitle] = useState('');
  const [itemValue, setItemValue] = useState('');
  const [itemFile, setItemFile] = useState<File | null>(null);

  const generate = async () => {
    setGenerating(true);
    setMessage('');
    const token = await currentUser?.getIdToken();
    const res = await fetch('/api/ai/generate-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction, idToken: token }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data?.message || '生成に失敗しました');
      setGenerating(false);
      return;
    }
    const data = await res.json();
    setPage(data.page);
    setGenerating(false);
  };

  const importSheet = async () => {
    if (!sheetUrl) return;
    setImporting(true);
    setMessage('');
    const token = await currentUser?.getIdToken();
    const res = await fetch('/api/admin/import-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl, idToken: token }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data?.message || '取り込みに失敗しました');
      setImporting(false);
      return;
    }
    const data = await res.json();
    setPage(data.page);
    setImporting(false);
  };


  const save = async () => {
    if (!page) return;
    if (!userProfile?.isAdmin) return;
    const slug = page.slug || slugify(page.title || 'page');
    const detailSlugs = new Set<string>();
    page.sections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'table' && item.table) {
          item.table.rows.forEach((row) => {
            if (row.detailUrl) {
              const detailSlug = row.detailUrl.split('/').pop();
              if (detailSlug) detailSlugs.add(detailSlug);
            }
          });
        }
      });
    });
    page.detailPages?.forEach((detail) => detail.slug && detailSlugs.add(detail.slug));

    if (page.sourceKey) {
      const q = query(collection(db, 'pages'), where('sourceKey', '==', page.sourceKey));
      const snap = await getDocs(q);
      const deletions: Promise<void>[] = [];
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const currentSlug = data.slug || docSnap.id;
        if (currentSlug !== slug && !detailSlugs.has(currentSlug)) {
          deletions.push(deleteDoc(doc(db, 'pages', currentSlug)));
        }
      });
      if (deletions.length > 0) {
        await Promise.all(deletions);
      }
    }
    const ref = doc(db, 'pages', slug);
    await setDoc(ref, {
      ...page,
      slug,
      published: !!page.published,
      order: page.order ?? Date.now(),
      updatedAt: serverTimestamp(),
      createdAt: page.createdAt || serverTimestamp(),
    });
    if (page.detailPages && page.detailPages.length > 0) {
      await Promise.all(
        page.detailPages.map((detail) => {
          const detailSlug = detail.slug || slugify(detail.title || 'detail');
          return setDoc(doc(db, 'pages', detailSlug), {
            ...detail,
            slug: detailSlug,
            published: page.published ?? detail.published ?? false,
            parentSlug: slug,
            sourceKey: page.sourceKey,
            order: detail.order ?? page.order ?? Date.now(),
            updatedAt: serverTimestamp(),
            createdAt: detail.createdAt || serverTimestamp(),
          });
        })
      );
    }
    setMessage('ページを保存しました');
  };

  const addItemToPage = (item: ContentItem) => {
    if (!page) return;
    const sections = page.sections.length ? page.sections : [{ id: 'section-1', title: 'コンテンツ', items: [] }];
    const updated = {
      ...page,
      sections: [
        {
          ...sections[0],
          items: [...sections[0].items, item],
        },
        ...sections.slice(1),
      ],
    };
    setPage(updated);
  };

  const handleAddItem = async () => {
    if (!page) return;
    const id = `item-${Date.now()}`;
    let storagePath: string | undefined;
    let url = itemValue;

    if ((itemType === 'audio' || itemType === 'video') && itemFile) {
      const slug = page.slug || slugify(page.title || 'page');
      storagePath = `media/${slug}/${itemFile.name}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, itemFile);
      url = await getDownloadURL(fileRef);
    }

    addItemToPage({
      id,
      type: itemType,
      title: itemTitle,
      text: itemType === 'text' ? itemValue : undefined,
      url: itemType !== 'text' ? url : undefined,
      storagePath,
    });
    setItemTitle('');
    setItemValue('');
    setItemFile(null);
  };

  const previewPage = useMemo(() => page, [page]);

  const isInternalLink = (url?: string) => (url ? url.startsWith('/') : false);

  const prettifyHeader = (header: string) => {
    const normalized = header.replace(/[_-]+/g, ' ').trim();
    if (/url|リンク/i.test(normalized)) return 'URL';
    if (/解説|説明|詳細/i.test(normalized)) return '解説';
    if (/タイトル|名称|名前|name|title/i.test(normalized)) return 'タイトル';
    if (/マニュアル|manual/i.test(normalized)) return 'マニュアル';
    return normalized || header;
  };

  const computeTableView = (item: ContentItem) => {
    if (item.type !== 'table' || !item.table) return null;
    const totalRows = item.table.rows.length;
    const emptyCounts = item.table.headers.map(() => 0);
    const maxLengths = item.table.headers.map((header) => header.length);
    item.table.rows.forEach((row) => {
      row.cells.forEach((cell, idx) => {
        if (cell.type === 'link') {
          const label = cell.label || '';
          if (!label && !cell.url) emptyCounts[idx] += 1;
          maxLengths[idx] = Math.max(maxLengths[idx], label.length);
        } else {
          const value = cell.value || '';
          if (!value) emptyCounts[idx] += 1;
          maxLengths[idx] = Math.max(maxLengths[idx], value.length);
        }
      });
    });
    const visibleIndexes = item.table.headers
      .map((_, idx) => idx)
      .filter((idx) => {
        const emptyRatio = totalRows ? emptyCounts[idx] / totalRows : 1;
        return emptyRatio < 1;
      });
    const widths = maxLengths.map((len) => Math.max(140, Math.min(320, len * 12 + 36)));
    return { visibleIndexes, widths };
  };

  const renderPreviewItem = (item: ContentItem) => {
    if (item.type === 'text') {
      return <p className="text-sm text-slate-100 whitespace-pre-wrap">{item.text}</p>;
    }
    if (item.type === 'url') {
      const external = item.url && !isInternalLink(item.url);
      return (
        <a
          href={item.url}
          className="text-sm text-indigo-200 hover:text-indigo-100"
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
        >
          {item.title || item.url}
        </a>
      );
    }
    if (item.type === 'video') {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black/40">
          <iframe
            className="h-full w-full"
            src={item.url}
            title={item.title || 'video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    if (item.type === 'audio') {
      return <audio controls className="w-full" src={item.url || ''} />;
    }
    if (item.type === 'table' && item.table) {
      const view = computeTableView(item);
      const visibleIndexes = view?.visibleIndexes ?? item.table.headers.map((_, idx) => idx);
      const widths = view?.widths ?? item.table.headers.map(() => 180);
      return (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
          <table className="min-w-[720px] w-full border-collapse text-xs">
            <thead>
              <tr className="bg-white/5 text-slate-300">
                {visibleIndexes.map((headerIndex) => (
                  <th
                    key={`${item.table.headers[headerIndex]}-${headerIndex}`}
                    className="border-b border-white/10 px-4 py-3 text-left font-semibold tracking-wide"
                    style={{ width: `${widths[headerIndex]}px` }}
                  >
                    {prettifyHeader(item.table.headers[headerIndex])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.table.rows.map((row, rowIndex) => (
                <tr
                  key={`row-${rowIndex}`}
                  className="border-b border-white/5 text-slate-100 transition hover:bg-white/5"
                >
                  {visibleIndexes.map((cellIndex) => {
                    const cell = row.cells[cellIndex];
                    return (
                      <td key={`cell-${rowIndex}-${cellIndex}`} className="px-4 py-3 align-top">
                        {cell.type === 'link' ? (
                        <a
                          href={cell.url}
                          className="inline-flex max-w-[160px] items-center gap-2 truncate whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-indigo-100 hover:border-indigo-300/60 hover:text-white"
                          target={cell.url.startsWith('/') ? undefined : '_blank'}
                          rel={cell.url.startsWith('/') ? undefined : 'noreferrer'}
                          title={cell.label}
                        >
                          {cell.label}
                          <span className="text-[10px]">→</span>
                        </a>
                        ) : cell.value ? (
                          <span className="block max-w-[260px] truncate whitespace-nowrap text-slate-100/90" title={cell.value}>
                            {cell.value}
                          </span>
                        ) : (
                          <span className="text-slate-600"> </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return null;
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
      <h2 className="text-xl font-semibold">ページ作成</h2>
      <p className="mt-2 text-sm text-slate-200">
        指示文からページ構成を作成し、会員ページに反映できます。
      </p>
      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm font-semibold text-slate-100">スプレッドシート取り込み</p>
          <p className="mt-1 text-xs text-slate-300">
            シートURLを貼り付けるだけで、ページを自動作成します。
          </p>
          <div className="mt-3 flex flex-col gap-3 md:flex-row">
            <input
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/..."
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />
            <button
              onClick={importSheet}
              disabled={importing || !sheetUrl}
              className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-300 disabled:opacity-60"
            >
              {importing ? '取り込み中...' : '取り込み'}
            </button>
          </div>
        </div>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="例: 入門講座のページを作成。動画2本、テキスト解説、参考リンクを含める。"
          rows={5}
          className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm focus:border-indigo-400/60 focus:outline-none"
        />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={generate}
            disabled={generating || !instruction}
            className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400 disabled:opacity-60"
          >
            {generating ? '生成中...' : 'ページ構成を生成'}
          </button>
          <button
            onClick={save}
            disabled={!page}
            className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white hover:border-white/60 disabled:opacity-60"
          >
            会員ページへ保存
          </button>
        </div>
        {message && <p className="text-sm text-emerald-200">{message}</p>}
        {page && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-sm font-semibold text-slate-100">ページ基本情報</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-slate-300">タイトル</label>
                <input
                  value={page.title}
                  onChange={(e) => setPage({ ...page, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">説明</label>
                <input
                  value={page.description || ''}
                  onChange={(e) => setPage({ ...page, description: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={page.published}
                  onChange={(e) => setPage({ ...page, published: e.target.checked })}
                />
                公開する
              </label>
            </div>
          </div>
        )}
        {page && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <h3 className="text-sm font-semibold text-slate-100">コンテンツを追加</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-slate-300">タイプ</label>
                <select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as ContentItemType)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                >
                  <option value="text">テキスト</option>
                  <option value="video">動画</option>
                  <option value="audio">音声</option>
                  <option value="url">URLリンク</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-300">タイトル</label>
                <input
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-300">
                  {itemType === 'text' ? 'テキスト' : itemType === 'url' ? 'URL' : 'URLまたはアップロード'}
                </label>
                <input
                  value={itemValue}
                  onChange={(e) => setItemValue(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  placeholder={itemType === 'video' ? 'https://www.youtube.com/embed/...' : ''}
                />
                {(itemType === 'audio' || itemType === 'video') && (
                  <input
                    type="file"
                    onChange={(e) => setItemFile(e.target.files?.[0] || null)}
                    className="mt-2 w-full text-xs text-slate-300"
                  />
                )}
              </div>
            </div>
            <button
              onClick={handleAddItem}
              className="mt-4 rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400"
            >
              追加
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <h3 className="text-sm font-semibold text-slate-100">プレビュー</h3>
          {!previewPage ? (
            <p className="mt-2 text-xs text-slate-300">ページを作成すると、ここにプレビューが表示されます。</p>
          ) : (
            <div className="mt-3 space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h4 className="text-xl font-semibold">{previewPage.title}</h4>
                {previewPage.description && <p className="mt-2 text-sm text-slate-200">{previewPage.description}</p>}
              </div>
              {previewPage.sections.map((section) => (
                <div key={section.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <h5 className="text-lg font-semibold">{section.title}</h5>
                  <div className="mt-3 space-y-3">
                    {section.items.map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        {item.title && <p className="mb-2 text-xs font-semibold text-slate-300">{item.title}</p>}
                        {renderPreviewItem(item)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
