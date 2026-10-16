# Sticker Studio V1.1 — Open-Source Reuse & Architectural Audit Report

**Date:** October 2026  
**Branch:** `feature/advanced-extraction-editor`  
**Application:** Sticker Studio — Sheet Extractor  

---

## 1. Executive Summary & Reuse Principles

This audit establishes the technical foundation for **Sticker Studio V1.1 — Advanced Extraction Editor**.

The governing paradigm is **Research-First, Reuse-First**:
1. Research existing open-source libraries before writing custom code.
2. Evaluate candidates against production constraints: offline-only execution, zero server dependence, strict security, sub-millisecond interactivity, and lean bundle footprint.
3. Where a candidate provides the right algorithm but brings prohibitive overhead (e.g. OpenCV.js at 11MB or SAM at 100MB+), adapt the core mathematical technique directly into typed arrays.
4. If a small, well-maintained, permissively licensed dependency demonstrably reduces maintenance risk without bloating the bundle, adopt it. If existing standard web platform APIs (e.g. `crypto.subtle` for SHA-256) or already-installed packages (e.g. `jszip`) cover the requirement, use them.

---

## 2. Candidate Evaluation & Reuse Decision Matrix

| Feature Area | Candidate Repository | Exact Package / Module | License | Maintenance Assessment | Existing Sticker Studio Equivalent | Compatibility Status | POC Evaluation Result | Reuse Decision | Rejection / Adoption Rationale | Custom Code Scope |
|---|---|---|---|---|---|---|---|---|---|---|
| **A: Mask Brush Engine** | [`la-voliere/react-mask-editor`](https://github.com/la-voliere/react-mask-editor) | `MaskEditor`, `toMask` | Apache-2.0 | Low (inactive) | None for interactive brush strokes | Incompatible as a component (assumes 1-bit binary canvas, replaces entire DOM stage) | Pointer interpolation pattern successfully avoids stroke gaps at high mouse speeds; custom 8-bit alpha blending needed | **ADAPT ALGORITHM** | Adapt line-segment sub-pixel pointer interpolation; implement typed-array radial stamping with bounded delta patches for lightweight undo/redo. | ~90 lines adapter (`src/core/maskPatch.ts`) |
| **A & E: Canvas Scene & Interactions** | [`konvajs/konva`](https://github.com/konvajs/konva) / `react-konva` | `Stage`, `Layer`, `Line` | MIT | High (actively maintained) | `SourceSheetView.tsx` (Canvas + SVG overlay) | High, but duplicates existing rendering pipeline | Adds ~160KB; vector scene graph is slower than direct typed array pixel manipulation for 12MP images | **REUSE EXISTING** | Existing HTML5 Canvas + SVG overlay already handles 60 FPS zoom, pan, and lasso. Surrendering it to Konva would add unnecessary abstraction and memory overhead. | 0 lines |
| **C & D: Touching-Object Split & Guided Segmentation** | [`image-js/image-js`](https://github.com/image-js/image-js) | `waterShed`, `computeThreshold` | MIT | Active | `src/core/segmentation.ts` | High (pure TS/JS, typed array compatible) | Unconstrained watershed over-segments details and creates spurious cuts; seeded priority flood with barrier constraints succeeds cleanly | **ADAPT ALGORITHM (CONSTRAINED)** | Unconstrained watershed is rejected. Adapt priority-flood queue with strict user constraints (barrier cut strokes or dual seeds). Zero artwork pixels erased; live color-coded preview before commit. | ~130 lines adaptation (`src/core/watershedSplit.ts`) |
| **C: ML Segmentation** | [`PanicTitan/maskify`](https://github.com/PanicTitan/maskify) | `@xenova/transformers` (SAM) | Unknown | Inactive | None | Incompatible with Cloudflare 25MB file limit & instant offline load | Model weights exceed 40MB-350MB; 2-5s initial WASM compilation latency | **REJECTED** | Large AI models violate hard offline PWA constraints and introduce unacceptable latency on lower-end client devices. | N/A |
| **C: Vision Primitives** | `OpenCV.js` (official) | `cv.watershed`, `cv.grabCut` | Apache-2.0 | Active | `src/core/segmentation.ts`, `src/core/edt.ts` | Poor for web bundle (8MB–11MB asm.js/WASM binary) | High latency to download and instantiate; existing pure TS EDT is 200x lighter and faster | **REJECTED** | Pure TypeScript implementation of EDT and seeded flood in Web Worker outperforms loading an 11MB binary blob. | N/A |
| **E: Polygon / Annotation UI** | [`react-image-annotate`](https://github.com/UniversalDataTool/react-image-annotate) | `Polygon`, `RegionSelect` | MIT | Low (abandoned) | `SourceSheetView.tsx` (`pointInPolygon`, SVG hulls) | Incompatible (stuck on React 16/17, heavy Material-UI dependency) | Failed React 19 peer dependency check; existing ray-casting polygon check is cleaner | **REUSE EXISTING** | Sticker Studio's existing SVG ray-casting `pointInPolygon` and dynamic lasso in `SourceSheetView.tsx` are already superior and bug-free. | 0 lines |
| **F: Vector Backing Offsets** | [`northamerican/paper-clipper`](https://github.com/northamerican/paper-clipper) | `clipperOffset`, `clipperUnite` | MIT | Low | `src/core/edt.ts` | High, but requires WebAssembly Clipper binary | Slower for real-time slider than EDT; valuable for vector smoothing | **REUSE EXISTING** (for raster EDT) + **ADAPT ALGORITHM** (for contour smoothing) | Keep linear-time EDT for 60 FPS slider; adapt Gaussian/box filter contour smoothing on backing seed mask for manual white-backing repairs. | ~60 lines |
| **F: Vector Geometry & Bridges** | [`paperjs/paper.js`](https://github.com/paperjs/paper.js) | `paper.Path`, `Path.smooth()` | MIT | Medium | `src/core/bridging.ts` | Moderate (heavy 400KB bundle) | Existing capsule bridging rasterizer (`rasterizeBridge`) is 56 lines, instant, and exact | **REUSE EXISTING** | Existing `rasterizeBridge` handles rounded capsule connector bridges with zero bundle overhead. Extend with editable endpoint handles. | ~40 lines |
| **G: Edge Inspector** | Computer Vision edge heuristics | Heuristics | N/A | N/A | None | Native TypeScript | Fast edge scan on alpha mask and distance field (<5ms per sticker) | **UNAVOIDABLE CUSTOM ALGORITHM** | Actionable checks for color fringing/halos, isolated backing islands, and configurable DPI-aware bridge thickness. | ~110 lines (`src/core/edgeInspector.ts`) |
| **H: Project Archive Serialization** | [`JSZip`](https://github.com/Stuk/jszip) vs `src/core/zip.ts` | `JSZip` (read/unpack) + `src/core/zip.ts` (write) | MIT | High (already in `package.json`) | `src/core/zip.ts` | 100% compatible | Reading `.stickerstudio` project archives via `JSZip.loadAsync`; writing via existing zero-dependency PKZIP writer | **ADOPT LIBRARY** (JSZip for unpack) + **REUSE EXISTING** (custom writer) | Zero new dependencies introduced. Uses existing `jszip` to extract source image and JSON metadata, and existing `createZip` to serialize. | ~90 lines (`src/core/projectArchive.ts`) |

---

## 3. Analysis of Unavoidable Custom Algorithms

Where open-source packages cannot be dropped in as-is without compromising bundle size or correctness, custom algorithms are engineered to strict mathematical standards:

### 1. Constrained Touching-Object Split (`src/core/watershedSplit.ts`)
- **Why Unconstrained Watershed Fails:** Unconstrained watershed generates catchment basins from every local gradient minimum, causing severe over-segmentation on illustrated stickers (e.g., splitting eyes, buttons, or decorative line work from characters).
- **The Solution:** A strictly **constrained priority-flood graph partition**:
  1. **User Constraints:** Requires either a separating barrier stroke across the junction, or Seed Marker A (Object 1) and Seed Marker B (Object 2).
  2. **Barrier Enforcement:** If a cut stroke is given, pixels intersecting the stroke line act as infinite-cost impassable barriers.
  3. **Cost Metric:** Priority queue expands from seeds based on edge cost:
     $$w(p, q) = 1 + \alpha \cdot \|\text{RGB}_p - \text{RGB}_q\|_2 + \beta \cdot (255 - \min(\alpha_p, \alpha_q))$$
  4. **Zero Artwork Pixel Loss:** Every single pixel in the original component remains labeled as either A or B. No pixels are cleared to alpha 0 or erased from source artwork.
  5. **Interactive Preview:** The user sees a real-time color-coded overlay (translucent cyan vs. amber) with "Accept Split", "Invert Labels", or "Cancel" before changes are committed.

### 2. Disjoint Pixel Ownership & Mask Patch Propagation (`src/core/maskPatch.ts`)
- **Invariant:** For every pixel $(x, y)$ where $\alpha(x, y) > 0$, that pixel belongs to exactly one component label $L$ in `labelMap`, and each component belongs to exactly one `StickerGroup`.
- **Restore Brush:** When restoring pixels from $\alpha = 0$ to $\alpha > 0$, new pixels are automatically assigned to the active sticker group's component, expanding its bounding box and invalidating its EDT cache.
- **Erase Brush:** When erasing pixels to $\alpha = 0$, their `labelMap` entries are cleared to 0. If a component shrinks, its bounding box is contracted. If a component is completely erased, it is detached from its group.
- **Undo/Redo:** History stores transaction records containing both alpha patch diffs and structural metadata (components, groups, label diffs) so undo restores full internal consistency, not just visible pixels.

### 3. Backing Pipeline Order of Operations (`src/core/composer.ts`)
- **Strict Geometry Pipeline:**
  $$\text{Base Seed Mask} \xrightarrow{+\text{Add} / -\text{Remove}} \text{Edited Seed} \xrightarrow{+\text{Bridges}} \text{Bridged Seed} \xrightarrow{\text{Smoothing}} \text{Contour Mask} \xrightarrow{\text{EDT}} D(x, y) \xrightarrow{\text{Border } R} \text{Antialiased Die-Cut Backing}$$
- **Slider Independence:** $M_{\text{add}}$ and $M_{\text{remove}}$ are stored in sticker local coordinates. Adjusting the border thickness slider $R$ immediately re-evaluates the distance thresholding and composition without re-rasterizing or discarding manual edits.

### 4. Configurable Edge Inspector with Print DPI Interpretation (`src/core/edgeInspector.ts`)
- **Configurability:** Replaces static 6px checks with configurable tolerances:
  - Minimum bridge width: specified in pixels or computed from physical dimensions ($\text{minBridgeWidthPx} = \max(\text{minPx}, \text{round}(\text{minPhysicalMm} \times \frac{\text{Dpi}}{25.4}))$).
  - Background color fringing: detects semi-transparent edge pixels whose color deviates towards `estimatedBgColor` beyond a configurable tolerance threshold.
  - Isolated islands: detects detached backing regions having zero intersection with artwork components.
  - Clipped borders: checks if die-cut backing touches the boundary of the extraction margin.

### 5. Hardened Project Archive Persistence (`src/core/projectArchive.ts`)
- **Integrity & Security:**
  - `schemaVersion: 1`: Explicit version header with migration hooks.
  - Source image SHA-256 checksum: Computed using native `crypto.subtle.digest('SHA-256', ...)` to verify that source pixels have not been corrupted.
  - Decompression safety (Zip Bomb Defense): Enforces a 100 MB max archive size, 250 MB total uncompressed budget, and blocks path traversal (`../`).
  - Transactional loading: Imports are staged and validated in memory; the active workspace is never modified until validation is 100% complete.

---

## 4. Measured Performance & Bundle Budgets

Measured from production build (`npm run build`, Vite v6.4.4, TypeScript 5.8):

| Asset | Measured Uncompressed | Measured Gzip | Production Budget | Status |
|---|---|---|---|---|
| **Main Application JS** | 300.74 kB | 90.87 kB | < 350 kB uncompressed (< 110 kB gzip) | **PASS** (Well within budget) |
| **Worker JS (`extractor.worker`)** | 8.91 kB | ~3.2 kB | < 25 kB | **PASS** |
| **Application CSS** | 34.49 kB | 6.88 kB | < 50 kB | **PASS** |
| **PWA Workbox Runtime** | 5.75 kB | 2.36 kB | < 10 kB | **PASS** |
| **WebAssembly Binaries** | 0 kB (None used) | 0 kB | 0 kB | **PASS** |
| **Total Precached Offline Assets** | 1,877 KiB (includes 4 sample sheets) | N/A | < 2,500 KiB | **PASS** |

**Dependency Policy:** Zero new runtime npm dependencies are required for V1.1. Native browser capabilities (`crypto.subtle`, `CanvasRenderingContext2D`, `OffscreenCanvas`, typed arrays) and existing project packages (`jszip`, `lucide-react`) fully cover every requirement.
