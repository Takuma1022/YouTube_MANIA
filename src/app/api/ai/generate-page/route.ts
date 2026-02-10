import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 64);

const buildTemplate = (instruction: string) => {
  const title = instruction.split(/[。\n]/)[0]?.trim() || '新規ページ';
  const baseSections = [
    {
      id: 'intro',
      title: '概要',
      items: [
        {
          id: 'intro-text',
          type: 'text',
          text: `${title}の要点とゴールをまとめます。`,
        },
      ],
    },
  ];

  const sections = [...baseSections];
  if (instruction.includes('動画')) {
    sections.push({
      id: 'videos',
      title: '動画コンテンツ',
      items: [
        {
          id: 'video-1',
          type: 'video',
          title: 'メイン動画',
          url: 'https://www.youtube.com/embed/',
        },
      ],
    });
  }
  if (instruction.includes('音声')) {
    sections.push({
      id: 'audio',
      title: '音声コンテンツ',
      items: [
        {
          id: 'audio-1',
          type: 'audio',
          title: '補足音声',
          url: '',
        },
      ],
    });
  }
  if (instruction.includes('リンク') || instruction.includes('URL')) {
    sections.push({
      id: 'links',
      title: '参考リンク',
      items: [
        {
          id: 'link-1',
          type: 'url',
          title: '参考リンク',
          url: 'https://example.com',
        },
      ],
    });
  }

  return {
    id: slugify(title),
    slug: slugify(title),
    title,
    description: 'AI指示から生成したページ構成です。',
    published: false,
    sections,
  };
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const instruction = String(body?.instruction || '').trim();
    const idToken = String(body?.idToken || '');
    if (!instruction) {
      return NextResponse.json({ message: '指示文が空です。' }, { status: 400 });
    }
    if (!idToken) {
      return NextResponse.json({ message: '認証が必要です。' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const adminSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const isAdmin = adminSnap.exists && adminSnap.data()?.isAdmin === true;
    if (!isAdmin) {
      return NextResponse.json({ message: '管理者のみ利用可能です。' }, { status: 403 });
    }

    const page = buildTemplate(instruction);
    return NextResponse.json({ page });
  } catch (error) {
    return NextResponse.json({ message: '生成に失敗しました。' }, { status: 500 });
  }
}
