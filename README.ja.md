# Outline Minimap

[English README](README.md)

Outline Minimap は、現在開いている Markdown ノートの見出しをクリック可能なミニマップとして表示する、軽量な Obsidian プラグインです。

Obsidian の `metadataCache` から見出し情報を読み取り、アクティブなペインの右上に細いアウトラインを表示します。見出しをクリックすると、その見出しの行へ移動できます。

## 機能

- 現在の Markdown ノート向けの見出しベースのミニマップ
- H1-H6 の表示深度設定
- 上から何個目の H1 セクションまで表示するかの設定
- 現在位置の前後にある見出しだけを表示する設定
- 見出しクリックで該当行へジャンプ
- スクロール位置に応じた現在見出しのハイライト
- 見出しがないノートでの表示設定
- 背景の透明度とぼかし設定
- Obsidian の表示言語に応じた英語/日本語の設定表示
- UI フレームワークを使わない plain DOM 実装

## 開発

```bash
bun install
bun run dev
```

本番ビルド:

```bash
bun run build
```

Obsidian で試すには、このフォルダを次の場所へコピーまたはシンボリックリンクします。

```text
<vault>/.obsidian/plugins/outline-minimap
```

その後、Community plugins から "Outline Minimap" を有効化してください。

## ライセンス

MIT
