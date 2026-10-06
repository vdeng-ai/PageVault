# Share Compatibility Checklist

Phase J keeps compatibility testing lightweight: PageVault validates standards-oriented metadata automatically and uses a short manual checklist for embedded messaging browsers that cannot be reproduced reliably in CI.

## Automated coverage

CI/Playwright verifies:

- every share page remains HTML under `/p/:slug`;
- original bytes remain under `/raw/:slug`;
- mobile layout at a 390px viewport;
- HTML iframe sandboxing;
- PDF byte-range delivery;
- Markdown server rendering and TOC output;
- Viewer 2.0 controls;
- the fixed `/share-card.png` asset on the public hostname;
- other admin static assets remain unavailable from the public hostname;
- Open Graph/Twitter image selection:
  - JPEG/PNG/WebP -> original raw image;
  - HTML/Markdown/PDF/SVG -> static PageVault fallback PNG.

## Manual release smoke test

Before a release that changes public viewer markup or metadata, publish one representative HTML page, Markdown document, PDF, raster image, and SVG. Test the resulting `/p/:slug` links in:

- WeChat on iOS;
- WeChat on Android when available;
- iOS Safari;
- Android Chrome;
- Telegram;
- Slack;
- Discord.

For each link confirm:

1. the link opens without an administrator login;
2. the title and description are readable;
3. the viewer fits a phone-width screen without horizontal page overflow;
4. **Copy link** and **Open original** remain usable;
5. HTML/PDF fullscreen controls appear where supported;
6. image fit/background controls work without uploading or generating another asset;
7. the raw file remains behind PageVault visibility/status/expiry checks;
8. the preview card uses the original raster image only for JPEG/PNG/WebP and otherwise uses the PageVault fallback image.

Messaging platforms cache link previews aggressively. When verifying changed metadata, use a newly published slug rather than assuming an old preview will refresh immediately.

## Intentional non-features

PageVault does not add server-side screenshots, PDF thumbnails, SVG rasterization, document conversion, or crawler-specific rendering services for share previews. Those features would add CPU cost and operational complexity that conflict with the project's personal-first and Cloudflare-Free-first goals.
