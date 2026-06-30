# Outline Minimap

Outline Minimap is a lightweight Obsidian plugin that shows a clickable heading outline for the active Markdown note.

It reads headings from Obsidian's `metadataCache`, renders a slim minimap in the top-right of the active pane, and jumps to a heading when clicked.

## Features

- Heading-based minimap for the active Markdown note.
- H1-H6 depth setting.
- Optional limit for how many top-level H1 sections are shown.
- Optional current-position window that shows only nearby headings.
- Click a heading to jump to its source line.
- Active heading highlight while scrolling.
- Empty-note behavior setting.
- Plain DOM implementation with no UI framework.

## Development

```bash
bun install
bun run dev
```

For a production build:

```bash
bun run build
```

To test in Obsidian, copy or symlink this folder into:

```text
<vault>/.obsidian/plugins/outline-minimap
```

Then enable "Outline Minimap" from Community plugins.

## License

MIT
