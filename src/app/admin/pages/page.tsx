'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import type { ContentItem, PageDoc, TableCell } from '@/types/content';
import { useAuth } from '@/contexts/AuthContext';

const isInternalLink = (url?: string) => (url ? url.startsWith('/') : false);

const getTableItem = (page: PageDoc) =>
  page.sections.flatMap((section) => section.items).find((item) => item.type === 'table' && item.table);

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

const renderTablePreview = (item: ContentItem) => {
  const table = item.type === 'table' ? item.table : undefined;
  if (!table) return null;
  const view = computeTableView(item);
  const visibleIndexes = view?.visibleIndexes ?? table.headers.map((_, idx) => idx);
  const widths = view?.widths ?? table.headers.map(() => 180);
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
      <table className="min-w-[720px] w-full border-collapse text-xs">
        <thead>
          <tr className="bg-white/5 text-slate-300">
            {visibleIndexes.map((headerIndex) => (
              <th
                key={`${table.headers[headerIndex]}-${headerIndex}`}
                className="border-b border-white/10 px-4 py-3 text-left font-semibold tracking-wide"
                style={{ width: `${widths[headerIndex]}px` }}
              >
                {prettifyHeader(table.headers[headerIndex])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr
              key={`row-${rowIndex}`}
              className={`border-b border-white/5 text-slate-100 transition hover:bg-white/5 ${
                row.detailUrl ? 'cursor-pointer' : ''
              }`}
              onClick={() => {
                if (row.detailUrl) {
                  window.location.href = row.detailUrl;
                }
              }}
            >
              {visibleIndexes.map((cellIndex) => {
                const cell = row.cells[cellIndex];
                return (
                  <td key={`cell-${rowIndex}-${cellIndex}`} className="px-4 py-3 align-top">
                    {cell.type === 'link' ? (
                    <a
                      href={cell.url}
                      className="inline-flex max-w-[160px] items-center gap-2 truncate whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-indigo-100 hover:border-indigo-300/60 hover:text-white"
                      target={isInternalLink(cell.url) ? undefined : '_blank'}
                      rel={isInternalLink(cell.url) ? undefined : 'noreferrer'}
                      onClick={(event) => event.stopPropagation()}
                      title={cell.label}
                    >
                      {cell.label}
                      <span className="text-[10px]">→</span>
                    </a>
                  ) : (
                      <span className="block max-w-[260px] truncate whitespace-nowrap text-slate-100/90" title={cell.value}>
                        {cell.value}
                      </span>
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
};

const updateCell = (cell: TableCell, patch: Partial<TableCell>): TableCell => {
  if (cell.type === 'link') {
    return { ...cell, ...patch } as TableCell;
  }
  return { ...cell, ...patch } as TableCell;
};

const renderRichText = (value: string) => {
  const colorRegex = /\[color=(#[0-9a-fA-F]{6})\]([\s\S]*?)\[\/color\]/g;
  const splitByColor = (text: string) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = colorRegex.exec(text))) {
      if (match.index > lastIndex) {
        parts.push(renderBold(text.slice(lastIndex, match.index)));
      }
      parts.push(
        <span key={`color-${match.index}`} style={{ color: match[1] }}>
          {renderBold(match[2])}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(renderBold(text.slice(lastIndex)));
    }
    return parts;
  };

  const renderBold = (text: string) => {
    const boldRegex = /\*\*(.+?)\*\*/g;
    const segments: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = boldRegex.exec(text))) {
      if (match.index > lastIndex) {
        segments.push(text.slice(lastIndex, match.index));
      }
      segments.push(
        <strong key={`bold-${match.index}`} className="font-semibold text-white">
          {match[1]}
        </strong>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      segments.push(text.slice(lastIndex));
    }
    return segments;
  };

  const withLineBreaks = (nodes: React.ReactNode[]) => {
    const flattened = nodes.flatMap((node, index) => {
      if (typeof node === 'string') {
        return node.split('\n').flatMap((line, lineIndex, arr) =>
          lineIndex < arr.length - 1 ? [line, <br key={`br-${index}-${lineIndex}`} />] : [line]
        );
      }
      return [node];
    });
    return flattened;
  };

  return withLineBreaks(splitByColor(value));
};

const RichTextEditor = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const applyWrap = (prefix: string, suffix: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const nextValue = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + prefix.length;
      el.selectionEnd = end + prefix.length;
    });
  };

  const applyColor = (color: string) => {
    applyWrap(`[color=${color}]`, '[/color]');
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-300">{label}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => applyWrap('**', '**')}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-100"
        >
          太文字
        </button>
        <button
          type="button"
          onClick={() => applyColor('#f8fafc')}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-100"
        >
          白
        </button>
        <button
          type="button"
          onClick={() => applyColor('#93c5fd')}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-100"
        >
          青
        </button>
        <button
          type="button"
          onClick={() => applyColor('#c4b5fd')}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-100"
        >
          紫
        </button>
        <button
          type="button"
          onClick={() => applyColor('#fcd34d')}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-100"
        >
          金
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
      />
      <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-100">
        {renderRichText(value)}
      </div>
    </div>
  );
};

const createEmptyRow = (headers: string[]) => {
  return {
    cells: headers.map((header) => {
      const label = header.toLowerCase();
      if (label.includes('url') || label.includes('リンク') || label.includes('マニュアル')) {
        return { type: 'link', label: 'リンク', url: '' } as TableCell;
      }
      return { type: 'text', value: '' } as TableCell;
    }),
  };
};

export default function SavedPagesList() {
  const { userProfile, signInWithGoogle, loading } = useAuth();
  const [pages, setPages] = useState<PageDoc[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [editPage, setEditPage] = useState<PageDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [queryText, setQueryText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const toMillis = (value?: any) => {
    if (!value) return 0;
    if (value?.toDate) return value.toDate().getTime();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  const loadPages = async () => {
    setPagesLoading(true);
    const q = query(collection(db, 'pages'));
    const snap = await getDocs(q);
    const docs = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as PageDoc[];
    const sorted = [...docs].sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return toMillis(a.updatedAt) - toMillis(b.updatedAt);
    });
    setPages(sorted);
    setPagesLoading(false);
  };

  useEffect(() => {
    loadPages().catch(() => setPagesLoading(false));
  }, []);

  const openEditor = (page: PageDoc) => {
    setExpandedSlug(page.slug);
    setEditPage(page);
    setMessage('');
  };

  const savePage = async () => {
    if (!editPage) return;
    setSaving(true);
    await setDoc(doc(db, 'pages', editPage.slug), {
      ...editPage,
      published: !!editPage.published,
      updatedAt: serverTimestamp(),
      createdAt: editPage.createdAt || serverTimestamp(),
    });
    const detailSlugs = new Set<string>();
    editPage.sections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'table' && item.table) {
          item.table.rows.forEach((row) => {
            if (row.detailUrl) {
              const slug = row.detailUrl.split('/').pop();
              if (slug) detailSlugs.add(slug);
            }
          });
        }
      });
    });
    if (detailSlugs.size > 0) {
      await Promise.all(
        Array.from(detailSlugs).map((slug) =>
          setDoc(
            doc(db, 'pages', slug),
            {
              published: !!editPage.published,
              parentSlug: editPage.slug,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
        )
      );
    }
    setMessage('保存しました');
    setSaving(false);
    loadPages().catch(() => {});
  };

  const updatePublished = async (page: PageDoc, value: boolean) => {
    const updated = { ...page, published: value };
    await setDoc(doc(db, 'pages', page.slug), {
      ...updated,
      updatedAt: serverTimestamp(),
      createdAt: page.createdAt || serverTimestamp(),
    });
    const detailSlugs = new Set<string>();
    page.sections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'table' && item.table) {
          item.table.rows.forEach((row) => {
            if (row.detailUrl) {
              const slug = row.detailUrl.split('/').pop();
              if (slug) detailSlugs.add(slug);
            }
          });
        }
      });
    });
    if (detailSlugs.size > 0) {
      await Promise.all(
        Array.from(detailSlugs).map((slug) =>
          setDoc(
            doc(db, 'pages', slug),
            {
              published: value,
              parentSlug: page.slug,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
        )
      );
    }
    setPages((prev) => prev.map((p) => (p.slug === page.slug ? updated : p)));
  };
  const openDetailEditor = async (detailUrl?: string) => {
    if (!detailUrl) return;
    const slug = detailUrl.split('/').pop() || '';
    if (!slug) return;
    const existing = pages.find((p) => p.slug === slug);
    if (existing) {
      openEditor(existing);
      return;
    }
    const q = query(collection(db, 'pages'), where('slug', '==', slug));
    const snap = await getDocs(q);
    const docSnap = snap.docs[0];
    if (docSnap) {
      const page = { id: docSnap.id, ...(docSnap.data() as any) } as PageDoc;
      openEditor(page);
      return;
    }
    setMessage('解説ページが見つかりませんでした');
  };

  const deletePage = async (page: PageDoc) => {
    if (!confirm(`「${page.title}」を削除しますか？`)) return;
    await deleteDoc(doc(db, 'pages', page.slug));
    const detailSlugs = new Set<string>();
    page.sections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'table' && item.table) {
          item.table.rows.forEach((row) => {
            if (row.detailUrl) {
              const slug = row.detailUrl.split('/').pop();
              if (slug) detailSlugs.add(slug);
            }
          });
        }
      });
    });
    if (page.detailPages && page.detailPages.length > 0) {
      page.detailPages.forEach((detail) => detail.slug && detailSlugs.add(detail.slug));
    }
    const deletions: Promise<void>[] = [];
    detailSlugs.forEach((slug) => {
      deletions.push(deleteDoc(doc(db, 'pages', slug)));
    });
    if (deletions.length > 0) {
      await Promise.all(deletions);
    }
    setPages((prev) => prev.filter((p) => p.slug !== page.slug));
    if (expandedSlug === page.slug) {
      setExpandedSlug(null);
      setEditPage(null);
    }
  };

  const tableItem = useMemo(() => (editPage ? getTableItem(editPage) : null), [editPage]);
  const textItems = useMemo(() => {
    if (!editPage) return [];
    const items: { sectionId: string; itemIndex: number; item: ContentItem }[] = [];
    editPage.sections.forEach((section) => {
      section.items.forEach((item, itemIndex) => {
        if (item.type === 'text') {
          items.push({ sectionId: section.id, itemIndex, item });
        }
      });
    });
    return items;
  }, [editPage]);

  const isDetailPage = (page: PageDoc) => {
    if (page.parentSlug) return true;
    if (page.description === '解説ページ') return true;
    if (page.sections?.length === 1 && page.sections[0]?.title === '解説') return true;
    return false;
  };

  const isMainPage = (page: PageDoc) => {
    const hasTable = page.sections?.some((section) => section.items?.some((item) => item.type === 'table'));
    if (hasTable) return true;
    return !isDetailPage(page);
  };

  const filteredPages = useMemo(() => {
    const base = pages.filter(isMainPage);
    if (!queryText.trim()) return base;
    const q = queryText.toLowerCase();
    return base.filter((page) => {
      const title = page.title?.toLowerCase() || '';
      const desc = page.description?.toLowerCase() || '';
      return title.includes(q) || desc.includes(q);
    });
  }, [pages, queryText]);

  const movePage = async (slug: string, direction: 'up' | 'down') => {
    const list = filteredPages;
    const currentIndex = list.findIndex((page) => page.slug === slug);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const current = list[currentIndex];
    const target = list[targetIndex];
    const currentOrder = current.order ?? currentIndex;
    const targetOrder = target.order ?? targetIndex;
    await Promise.all([
      setDoc(
        doc(db, 'pages', current.slug),
        { order: targetOrder, updatedAt: serverTimestamp() },
        { merge: true }
      ),
      setDoc(
        doc(db, 'pages', target.slug),
        { order: currentOrder, updatedAt: serverTimestamp() },
        { merge: true }
      ),
    ]);
    await loadPages();
  };

  const updateTableCell = (rowIndex: number, cellIndex: number, patch: Partial<TableCell>) => {
    if (!editPage) return;
    const newSections = editPage.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (item.type !== 'table' || !item.table) return item;
        const newRows = item.table.rows.map((row, rIdx) => {
          if (rIdx !== rowIndex) return row;
          const newCells = row.cells.map((cell, cIdx) => {
            if (cIdx !== cellIndex) return cell;
            return updateCell(cell, patch);
          });
          return { ...row, cells: newCells };
        });
        return { ...item, table: { ...item.table, rows: newRows } };
      }),
    }));
    setEditPage({ ...editPage, sections: newSections });
  };

  const deleteTableRow = (rowIndex: number) => {
    if (!editPage) return;
    const newSections = editPage.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (item.type !== 'table' || !item.table) return item;
        const rows = item.table.rows.filter((_, idx) => idx !== rowIndex);
        return { ...item, table: { ...item.table, rows } };
      }),
    }));
    setEditPage({ ...editPage, sections: newSections });
  };

  const moveTableRow = (rowIndex: number, direction: 'up' | 'down') => {
    if (!editPage) return;
    const newSections = editPage.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (item.type !== 'table' || !item.table) return item;
        const rows = [...item.table.rows];
        const targetIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
        if (targetIndex < 0 || targetIndex >= rows.length) return item;
        const temp = rows[rowIndex];
        rows[rowIndex] = rows[targetIndex];
        rows[targetIndex] = temp;
        return { ...item, table: { ...item.table, rows } };
      }),
    }));
    setEditPage({ ...editPage, sections: newSections });
  };

  const updateTextItem = (sectionId: string, itemIndex: number, value: string) => {
    if (!editPage) return;
    const newSections = editPage.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const items = section.items.map((item, index) => {
        if (index !== itemIndex || item.type !== 'text') return item;
        return { ...item, text: value };
      });
      return { ...section, items };
    });
    setEditPage({ ...editPage, sections: newSections });
  };

  const addTableRow = () => {
    if (!editPage) return;
    const newSections = editPage.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (item.type !== 'table' || !item.table) return item;
        const newRow = createEmptyRow(item.table.headers);
        return { ...item, table: { ...item.table, rows: [...item.table.rows, newRow] } };
      }),
    }));
    setEditPage({ ...editPage, sections: newSections });
  };

  if (loading || pagesLoading) {
    return (
      <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-slate-200">
        読み込み中...
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        <h1 className="text-2xl font-semibold">ログインが必要です</h1>
        <p className="mt-2 text-sm text-slate-200">管理画面を利用するにはログインしてください。</p>
        <button
          onClick={signInWithGoogle}
          className="mt-6 rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200"
        >
          Gmailでログイン
        </button>
      </div>
    );
  }

  if (!userProfile.isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-2xl font-semibold">管理者のみアクセス可能です</h1>
        <p className="mt-2 text-sm text-slate-200">管理権限が必要です。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-semibold">保存済みページ一覧</h1>
        <p className="mt-2 text-sm text-slate-200">ページの公開設定と内容の修正ができます。</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="ページ名や説明で検索"
            className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-100 md:w-72"
          />
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 p-1 text-xs text-slate-200">
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-full px-3 py-1 ${viewMode === 'list' ? 'bg-white/15 text-white' : ''}`}
            >
              リスト
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-full px-3 py-1 ${viewMode === 'grid' ? 'bg-white/15 text-white' : ''}`}
            >
              グリッド
            </button>
          </div>
        </div>
        <div className="mt-4">
          <a
            href="/admin"
            className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-100 hover:border-indigo-300/60"
          >
            管理画面に戻る
          </a>
        </div>
      </div>

      {filteredPages.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200">
          保存済みページがありません。
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid gap-4 md:grid-cols-2' : 'space-y-4'}>
          {filteredPages.map((page) => (
            <div key={page.slug} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{page.title}</h2>
                  <p className="mt-1 text-xs text-slate-300">{page.description || '説明なし'}</p>
                </div>
                <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                    page.published
                      ? 'border-emerald-400/40 text-emerald-200'
                      : 'border-white/15 text-slate-300'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${page.published ? 'bg-emerald-300' : 'bg-slate-400'}`} />
                  {page.published ? '公開中' : '非公開'}
                </span>
                  <select
                    value={page.published ? 'published' : 'private'}
                    onChange={(e) => updatePublished(page, e.target.value === 'published')}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-100"
                  >
                    <option value="published">公開</option>
                    <option value="private">非公開</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => movePage(page.slug, 'up')}
                      className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => movePage(page.slug, 'down')}
                      className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    onClick={() => openEditor(page)}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-100 hover:border-indigo-300/60"
                  >
                    修正
                  </button>
                <button
                  onClick={() => deletePage(page)}
                  className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-xs text-rose-200 hover:border-rose-300/60"
                >
                  削除
                </button>
                </div>
              </div>

              {expandedSlug === page.slug && editPage && (
                <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,1.2fr]">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">修正</h3>
                    <button
                      onClick={() => {
                        setExpandedSlug(null);
                        setEditPage(null);
                      }}
                      className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-slate-200"
                    >
                      戻る
                    </button>
                  </div>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="text-xs text-slate-300">タイトル</label>
                        <input
                          value={editPage.title}
                          onChange={(e) => setEditPage({ ...editPage, title: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-300">説明</label>
                        <input
                          value={editPage.description || ''}
                          onChange={(e) => setEditPage({ ...editPage, description: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                        />
                      </div>
                      {tableItem?.table && (
                        <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-300">テーブル内容の修正</p>
                          <button
                            onClick={addTableRow}
                            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-slate-200 hover:border-indigo-300/60"
                          >
                            行を追加
                          </button>
                        </div>
                          <div className="max-h-[360px] overflow-auto rounded-xl border border-white/10">
                            <table className="min-w-[680px] w-full border-collapse text-xs">
                              <thead>
                                <tr className="bg-white/5 text-slate-300">
                                  {tableItem.table.headers.map((header) => (
                                    <th
                                      key={header}
                                      className="border-b border-white/10 px-3 py-2 text-left font-semibold"
                                    >
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                              {tableItem.table.rows.map((row, rowIndex) => (
                                <tr key={`edit-row-${rowIndex}`} className="border-b border-white/5">
                                  {row.cells.map((cell, cellIndex) => (
                                      <td key={`edit-cell-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top">
                                        {cell.type === 'link' ? (
                                          <div className="space-y-1">
                                            <input
                                              value={cell.label}
                                              onChange={(e) =>
                                                updateTableCell(rowIndex, cellIndex, { label: e.target.value })
                                              }
                                              className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs"
                                              placeholder="リンク名"
                                            />
                                            <input
                                              value={cell.url}
                                              onChange={(e) =>
                                                updateTableCell(rowIndex, cellIndex, { url: e.target.value })
                                              }
                                              className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs"
                                              placeholder="https://..."
                                            />
                                          </div>
                                        ) : (
                                          <textarea
                                            value={cell.value}
                                            onChange={(e) =>
                                              updateTableCell(rowIndex, cellIndex, { value: e.target.value })
                                            }
                                            rows={2}
                                            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs"
                                          />
                                        )}
                                      </td>
                                    ))}
                                  <td className="px-3 py-2 align-top">
                                    <div className="flex flex-col gap-1">
                                      <button
                                        onClick={() => moveTableRow(rowIndex, 'up')}
                                        className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200"
                                      >
                                        ↑
                                      </button>
                                      <button
                                        onClick={() => moveTableRow(rowIndex, 'down')}
                                        className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200"
                                      >
                                        ↓
                                      </button>
                                      <button
                                        onClick={() => deleteTableRow(rowIndex)}
                                        className="rounded-full border border-rose-400/40 px-2 py-1 text-[11px] text-rose-200"
                                      >
                                        削除
                                      </button>
                                      <button
                                        onClick={() => openDetailEditor(row.detailUrl)}
                                        className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200"
                                      >
                                        解説編集
                                      </button>
                                    </div>
                                  </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    {textItems.length > 0 && (
                      <div className="space-y-4">
                        <p className="text-xs text-slate-300">解説ページの編集</p>
                        {textItems.map((textItem, index) => (
                          <RichTextEditor
                            key={`${textItem.sectionId}-${textItem.item.id}-${index}`}
                            label={textItem.item.title || `テキスト ${index + 1}`}
                            value={textItem.item.text || ''}
                            onChange={(value) => updateTextItem(textItem.sectionId, textItem.itemIndex, value)}
                          />
                        ))}
                      </div>
                    )}
                      <button
                        onClick={savePage}
                        disabled={saving}
                        className="rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
                      >
                        {saving ? '保存中...' : '保存'}
                      </button>
                      {message && <p className="text-xs text-emerald-200">{message}</p>}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <h3 className="text-sm font-semibold text-slate-100">プレビュー</h3>
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <h4 className="text-xl font-semibold">{editPage.title}</h4>
                        {editPage.description && (
                          <p className="mt-2 text-sm text-slate-200">{editPage.description}</p>
                        )}
                      </div>
                      {editPage.sections.map((section) => (
                        <div key={section.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                          <h5 className="text-lg font-semibold">{section.title}</h5>
                          <div className="mt-3 space-y-3">
                            {section.items.map((item) => (
                              <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                {item.title && (
                                  <p className="mb-2 text-xs font-semibold text-slate-300">{item.title}</p>
                                )}
                                {renderTablePreview(item)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
