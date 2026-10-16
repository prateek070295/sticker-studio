# Sticker Studio — Sheet Extractor

A high-performance, local-first desktop-browser application that automatically extracts individual illustrations from sticker sheets and exports them as print-ready, transparent PNGs with adjustable, smooth white die-cut borders.

---

## Features

- **5-Layer Architecture**: Immutable Source Image, Foreground Extraction, Artwork Components, Sticker Groups, and Die-Cut Backing.
- **Internal White & Cream Preservation**: Uses constrained exterior flood-fill with gradient boundary barriers so white puppy fur, flower petals, and cream frosting are never removed.
- **60 FPS Real-Time Border Slider**: Precomputed group-local Euclidean Distance Transforms (EDT) allow instantaneous border thickness changes ($0$ to $60\text{ px}$) via thresholding without re-segmentation.
- **Zero Neighbor Leakage**: Strict pixel ownership masks guarantee that adjacent illustrations inside a sticker's bounding box are never included in its export.
- **Intelligent Grouping & Bridging**: Automatically groups satellites (sparkles, hearts, droplets) to main anchor illustrations and generates smooth rounded bridges for physical cut-line continuity.
- **Batch ZIP Export**: Exports all selected stickers as tightly cropped transparent PNGs with an accompanying `manifest.json`.
- **Non-destructive Undo / Redo**: Instant rollback of grouping, exclusions, and border adjustments.

---

## Quick Start

### Prerequisites
- Node.js $\ge 20$

### Development
```bash
npm run dev
```
Open `http://localhost:5173/` in your browser.

### Production Build & Preview
```bash
npm run build
npm run preview
```

### Running Tests
```bash
# Algorithmic and real sticker sheet tests
npm test

# Automated browser E2E test
node scripts/e2e-browser-test.cjs
```

---

## Keyboard Shortcuts
- `Ctrl + Z` / `Cmd + Z`: Undo
- `Ctrl + Y` / `Cmd + Shift + Z`: Redo
- `V`: Pointer / Selection Tool
- `L`: Lasso Grouping Tool
- `Escape`: Clear Selection

---

## Free Web App (PWA) & Offline Use (₹0 Hosting Cost)

Sticker Studio is also a fully installable, offline-capable **Progressive Web App (PWA)** ready to deploy to **Cloudflare Pages Free Tier** for free forever:

- **100% Client-Side Privacy**: Uploaded sheets, masks, and exports never leave the browser. Zero server processing or cloud uploads.
- **Install on Any Device**: One-click install on Windows (Edge/Chrome), macOS, iPad, iPhone, and Android.
- **Full Offline Operation**: After first visit, all assets are cached locally via Workbox Service Worker. The app continues to work without an internet connection.
- **Instant Deployment Guide**: See [`deploy-guide.md`](file:///c:/Users/prate/Documents/SheetExtractor/deploy-guide.md) to launch your own `https://<your-project>.pages.dev` in 60 seconds via GitHub or Wrangler CLI.

---

## Standalone Windows Executables

Sticker Studio is also available as standalone Windows x64 software that runs completely offline with zero installation of Node.js, Python, or dev tools:

| Executable | Type | Size | SHA-256 Checksum |
|---|---|---|---|
| `release/StickerStudio-Setup-1.0.0.exe` | Standard Installer (Desktop icon, Start Menu, Uninstaller) | 85.62 MB | `dab3279030f02d1fb3746b31fe2bf3e7ca6ccae7255f5f9a6c2ac8df3551a007` |
| `release/StickerStudio-Portable-1.0.0.exe` | Self-contained single portable executable | 85.42 MB | `9c78d84946e6d3dee859abb1c119d55dc096bcb101aa061af3af4e30d543e35f` |

### How to Run

1. **Portable Version**: Double-click `StickerStudio-Portable-1.0.0.exe`. It extracts and runs directly without modifying your system.
2. **Setup Version**: Double-click `StickerStudio-Setup-1.0.0.exe` and follow the guided wizard to install Sticker Studio to your system with desktop and Start Menu shortcuts.

> [!NOTE]
> **Windows Defender SmartScreen Notice**: Because this build is an open-source release without an expensive EV code-signing certificate, Windows SmartScreen may present a blue prompt stating *"Windows protected your PC / Unknown Publisher"*.
> Click **"More info"** and then select **"Run anyway"**.

### Building Releases from Source

To package the Windows executables yourself:
```bash
npm run electron:dist
```
Artifacts will be produced directly in the `release/` directory.

---

## Known Limitations & Upgrade Path
- `ponytail: flood-fill edge threshold` — Constrained flood-fill uses a fixed gradient barrier threshold ($35$). Very faint pastel artwork with near-zero contrast against background may require using the Keep Brush.
- `ponytail: title letter grouping heuristic` — Titles are grouped using horizontal baseline alignment. Highly curved circular arch text may need manual Lasso grouping.

