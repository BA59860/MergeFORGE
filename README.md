# MergeFORGE v0.1

A simple student tool for turning notebook photos, scans, and typed work into one correctly ordered PDF for submission. All file processing stays in the browser. No accounts, uploads, backend, tracking, or API keys.

The interface uses the approved charcoal, electric-blue, and orange design, including a metallic wordmark, outlined step buttons, a fire-and-ice Word reminder, and a glassy Continue to merge button. No external fonts or graphics are needed.

## Use it

1. Add PDF, JPG/JPEG, and PNG files. Save Word documents as PDF first.
2. Order whole files with their drag handles or Move up / Move down buttons.
3. Arrange individual pages in the contact sheet. Drag a handle, or use Earlier, Later, To start, and To end. Rotate either direction and delete unwanted pages. Use Undo to restore the most recently deleted page. To start and To end are under More moves.
4. Preview the actual assembled PDF and move through its pages.
5. Choose a filename, select **MERGE INTO ONE PDF**, then **Download PDF**. Upload the downloaded file to your assignment.

Adding more files appends their pages without changing existing page edits. Returning to Arrange files alone leaves page order intact. **Moving a file regroups all remaining pages into the displayed file order**, retaining their relative order within each file, rotations, and deletions. Arrange pages is the final authority on output order.

Files with identical names are separate imports, with unique internal IDs and visible copy labels. Start over clears the current tab after confirmation. Undo remains available for the most recent page deletion until you delete another page, import or remove a file, or start over. No session is saved; download before closing or refreshing.

## Deploy on GitHub Pages

No build or package installation is needed.

1. Create a repository, such as `MergeFORGE`.
2. Put the **contents of this folder** at the repository root, including `vendor/` and `.nojekyll`. Commit to `main`. Do not upload student files.
3. In the repository, open **Settings → Pages**.
4. Select **Deploy from a branch**, then **main** and **/(root)**. Save.
5. Open the published URL shown on that page once deployment completes. A typical project URL is `https://YOUR-USERNAME.github.io/MergeFORGE/`.

All runtime paths are relative, so this also works inside an existing Pages site's `MergeFORGE/` folder. Keep the whole folder together and preserve case. If your repository already has a Pages workflow, follow its existing publishing convention instead of replacing it.

[GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Preview locally

From this folder, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`. On Windows, `py -m http.server 8000 --bind 127.0.0.1` works when Python is installed. Serve the folder over HTTP or HTTPS; double-clicking `index.html` is not supported because the app uses browser modules and workers.

## What's included

- `index.html`, `styles.css`, `app.js`: responsive interface and local imports.
- `model.js`: deterministic page ordering and filename handling.
- `pdf-worker.js`: PDF assembly in a background browser worker.
- `vendor/`: pinned browser libraries, fonts, codecs, and licenses. No CDN requests.
- `tests/core.test.mjs`: dependency-free Node test runner for ordering and PDF output.
- `TESTING.md`: verification results and a repeatable browser checklist.

Pinned dependencies: [pdf-lib 1.17.1](https://pdf-lib.js.org/) (MIT), [PDF.js 6.3.289](https://mozilla.github.io/pdf.js/) (Apache-2.0, legacy browser build), and [SortableJS 1.15.7](https://github.com/SortableJS/Sortable) (MIT). Individual font/codec licenses are included alongside those assets. `vendor/SHA256SUMS` records the bundled files. The app has no production package-manager dependency; `package.json` only names the app and test command.

## Image and PDF behavior

PDF pages retain their original dimensions, text, graphics, and existing rotation. Saved standard form appearances are flattened before copying. The preview and download use the **same PDF bytes**; edits invalidate the old preview and download.

Photos use their decoded camera orientation, keep their aspect ratio, and are centered on portrait or landscape US Letter pages with an 18-point margin. PNG transparency is placed on white. JPEGs are normalized at quality 0.96. Images with an edge above 6,000 pixels are reduced to that edge length; images above 60 megapixels are rejected. This is a readability-focused limit, not an optional compression mode. No OCR, image cropping, or DOCX/HEIC conversion is included.

## Limits and privacy

Use a current Chrome, Edge, Firefox, or Safari browser with JavaScript, Web Workers, and ES modules. The app caps each session at 300 remaining pages and 250 MB of accepted source files. Available device memory may require a smaller submission, especially on phones. Thumbnails render sequentially with progress, while PDF assembly runs off the main UI thread.

Password-protected and XFA PDFs require an unlocked or printed-to-PDF copy. Damaged files are rejected individually. This tool is intended for ordinary homework, not preserving digital signatures, bookmarks, document attachments, interactive forms, or document-level accessibility structure. Review the final preview before submitting unusual PDFs.

Student file bytes exist only in browser memory and the PDF they choose to download. The site host serves app assets and may record ordinary page visits; it receives no imported documents. The app does not use browser storage, analytics, cloud APIs, or student identities. A restrictive Content Security Policy limits resources to the app's own origin and local blob/data URLs.

A feature-detected, read-only WebMCP tool can report the filenames and page order already in the tab to a supporting browser agent. It does not expose page contents, import files, or trigger downloads. Browsers without that feature use the same normal interface.

## Run the tests

With Node.js 20 or newer:

```sh
node --test tests/core.test.mjs
```

No `npm install` is required. See `TESTING.md` for browser coverage and limitations.
