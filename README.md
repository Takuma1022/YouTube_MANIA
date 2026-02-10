# YouTube MANIA 会員サイト

## セットアップ

1. `.env.local.example` を `.env.local` にコピーしてFirebase情報を入力
2. Firebaseプロジェクトを作成し、Authentication/Firestore/Storageを有効化
3. `firestore.rules` をFirebaseへ反映
4. `storage.rules` をFirebaseへ反映（音声/動画アップロード用）

## 開発サーバー起動

```bash
npm run dev
```

## 主要機能

- Gmail限定ログイン + 承認制
- 参加申請フォーム（未ログイン）
- 管理画面で承認/AI指示
- 会員ページの自動生成・表示
- ログインログの記録
- 管理者のみアップロード/承認/編集（Storageは管理者書き込み）
