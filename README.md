# Worth

A standalone, browser-local finance dashboard hosted on GitHub Pages. No account, AI service, backend, database subscription, API key, analytics, or external JavaScript dependency.

## Open and restore

Open the GitHub Pages address shown in this repository’s Settings → Pages. On a new device, choose **Import full backup** and select your private Worth backup JSON from Files. The public site contains no financial records. Each browser/device stores its own copy in IndexedDB.

Use **Add data** for JSON/CSV balance snapshots, a manual snapshot, or monthly spending imports. Changes are previewed before saving. Imports preserve earlier dates and months; corrections require confirmation. **Export backup** saves both charts and confirmed cash corrections in one file. Keep that file privately; never commit it here. Clearing website data or using private browsing can lose local records. There is no automatic bank refresh or cross-device sync.

## Features

- Net-worth timeline excluding retirement, with 1W / 1M / 1Y / All, pinch zoom, pan below the line, and exact daily cursor values on/above it.
- Monthly spending categories, expandable rows, and green-to-blue composition bars.
- Daily cumulative spending versus another month or three complete prior months; refunds may lower the line.
- Light/dark toggle, remembered choice, and device appearance mode.
- Atomic local saves, revision checks, and backup before changes.

## Hosting

GitHub Pages publishes **main /docs**. `docs/` contains only the static app and icon. All financial data is browser-local. Source and site code are public; financial records and exported backups must remain private.

## Build

Node 24+, no dependencies:

```
npm run build
npm test
```

Edit `src/`, rebuild, and commit `docs/` along with source. There is no deploy server or platform-specific runtime. The app can also be served by any ordinary static HTTPS host.
