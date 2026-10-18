# Share Compatibility Checklist

Phase J keeps compatibility testing lightweight: PageVault validates standards-oriented metadata automatically and uses a short manual checklist for embedded messaging browsers that cannot be reproduced reliably in CI.

## Automated coverage

CI/Playwright verifies:

- every share page remains HTML under `/p/:slug`;
- original bytes remain under `/raw/:slug`;
- mobile layout at a 390px viewport;
- HTML iframe sandboxing;
- immersive HTML layout at desktop, phone portrait, and phone landscape sizes, with scrolling confined to the original document;
- native HTML tools starting collapsed, keyboard dismissal, clipboard success/failure, and no-JavaScript/unsupported-fullscreen fallbacks;
- HTML tools remaining reachable in fullscreen, without reloading or resizing the document when toggled;
- PDF byte-range delivery;
- Markdown server rendering and TOC output;
- Viewer 2.0 controls;
- the fixed `/share-card.png` asset on the public hostname;
- other admin static assets remain unavailable from the public hostname;
- Open Graph/Twitter image selection:
  - JPEG/PNG/WebP -> original raw image;
  - HTML/Markdown/PDF/SVG -> static PageVault fallback PNG.
- upload-time HTML/Markdown title and description extraction, persisted metadata escaping, and the legacy file-type/size description fallback.

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
9. newly uploaded HTML/Markdown links use the extracted title and content description when present, while old items and files without descriptions retain their fallback metadata.

For HTML specifically, confirm that the original page fills the available viewport without the PageVault header, metadata block, frame border, or footer. Check that the **页面工具** entry remains inside the device safe area as the browser address bar expands/collapses and after rotating the phone. Open the tools to access the actions; check long titles, keyboard focus, copy feedback, and opening/closing without resetting the document's scroll position. Scroll a long original document to its end and verify its fixed navigation and scripts still work. Where fullscreen is supported, confirm the tools remain reachable and can exit fullscreen. Safari and embedded WeChat browser checks require manual validation in addition to the Chromium suite.

Messaging platforms cache link previews aggressively. When verifying changed metadata, use a newly published slug rather than assuming an old preview will refresh immediately.

## Intentional non-features

PageVault does not add server-side screenshots, PDF thumbnails, SVG rasterization, document conversion, or crawler-specific rendering services for share previews. Those features would add CPU cost and operational complexity that conflict with the project's personal-first and Cloudflare-Free-first goals.
