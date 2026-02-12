 'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useParams } from 'next/navigation';
import { db, storage } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import type { ContentItem, PageDoc } from '@/types/content';
import { getDownloadURL, ref } from 'firebase/storage';

const isInternalLink = (url?: string) => (url ? url.startsWith('/') : false);

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
    const flattened: React.ReactNode[] = [];
    nodes.forEach((node, index) => {
      if (typeof node === 'string') {
        const parts = node.split('\n');
        parts.forEach((line, lineIndex) => {
          flattened.push(line);
          if (lineIndex < parts.length - 1) {
            flattened.push(<br key={`br-${index}-${lineIndex}`} />);
          }
        });
        return;
      }
      flattened.push(node);
    });
    return flattened;
  };

  return withLineBreaks(splitByColor(value));
};

const renderItem = (item: ContentItem) => {
  if (item.type === 'text') {
    return <div className="text-sm text-slate-100 whitespace-pre-wrap">{renderRichText(item.text || '')}</div>;
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
    const prettifyHeader = (header: string) => {
      const normalized = header.replace(/[_-]+/g, ' ').trim();
      if (/url|リンク/i.test(normalized)) return 'URL';
      if (/解説|説明|詳細/i.test(normalized)) return '解説';
      if (/タイトル|名称|名前|name|title/i.test(normalized)) return 'タイトル';
      if (/マニュアル|manual/i.test(normalized)) return 'マニュアル';
      return normalized || header;
    };
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
                        target={cell.url.startsWith('/') ? undefined : '_blank'}
                        rel={cell.url.startsWith('/') ? undefined : 'noreferrer'}
                      onClick={(event) => event.stopPropagation()}
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

export default function PageDetail() {
  const { userProfile, loading } = useAuth();
  const params = useParams();
  const slug = String(params?.slug || '');
  const [page, setPage] = useState<PageDoc | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const sectionList = useMemo(() => page?.sections ?? [], [page]);

  useEffect(() => {
    if (!userProfile?.isApproved || !slug) return;
    const fetchPage = async () => {
      const q = query(collection(db, 'pages'), where('slug', '==', slug));
      const snap = await getDocs(q);
      const doc = snap.docs[0];
      if (doc) {
        setPage({ id: doc.id, ...(doc.data() as any) });
      }
    };
    fetchPage().catch(() => {});
  }, [userProfile?.isApproved, slug]);

  useEffect(() => {
    if (!page) return;
    const items = page.sections.flatMap((s) => s.items);
    const load = async () => {
      const entries = await Promise.all(
        items
          .filter((item) => item.storagePath)
          .map(async (item) => {
            const url = await getDownloadURL(ref(storage, item.storagePath!));
            return [item.id, url] as const;
          })
      );
      setMediaUrls(Object.fromEntries(entries));
    };
    load().catch(() => {});
  }, [page]);

  if (loading) {
    return <div className="text-sm text-slate-300">読み込み中...</div>;
  }

  if (!userProfile?.isApproved) {
    return <div className="text-sm text-slate-300">このページを見る権限がありません。</div>;
  }

  if (!page) {
    return <div className="text-sm text-slate-300">ページが見つかりません。</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-semibold">{page.title}</h1>
        {page.description && page.description !== '解説' && page.description !== '解説ページ' && (
          <p className="mt-2 text-sm text-slate-200">{page.description}</p>
        )}
        <div className="mt-4">
          <button
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                window.location.href = '/dashboard';
              }
            }}
            className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-100 hover:border-indigo-300/60"
          >
            戻る
          </button>
        </div>
        {sectionList.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            {sectionList.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-white/10 px-3 py-1 text-slate-200 hover:border-indigo-400/60"
              >
                {section.title}
              </a>
            ))}
          </div>
        )}
      </div>
      {page.sections.map((section) => (
        <div key={section.id} id={section.id} className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold">{section.title}</h2>
          <div className="mt-4 space-y-4">
            {section.items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                {item.title && <p className="mb-2 text-sm font-semibold text-slate-200">{item.title}</p>}
                {item.storagePath && mediaUrls[item.id] ? renderItem({ ...item, url: mediaUrls[item.id] }) : renderItem(item)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
