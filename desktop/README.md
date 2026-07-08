# CDS Space Desktop

Electron shell around the team portal (`https://cdsspace.pro/team`). When team
members use this app instead of a browser, work-session screenshots are
captured **silently across all monitors** — no share picker, no
"sharing your screen" banner. The portal's `WorkTracker` detects the app via
`window.cdsDesktop` and switches to silent capture automatically.

## Develop / run

```bash
cd desktop
npm install
npm start                       # loads https://cdsspace.pro/team
CDS_PORTAL_URL=http://localhost:3000/team npm start   # against local dev
```

## Build installers

```bash
npm run dist:mac   # .dmg / .zip
npm run dist:win   # NSIS installer
```

## Platform notes

- **macOS** — first run needs System Settings → Privacy & Security →
  Screen Recording → enable "CDS Space" (the app opens that pane itself and
  explains this). One-time per machine; IT can pre-approve via MDM. Ship a
  signed + notarized build for real deployments (set up code signing in
  electron-builder before distributing).
- **Windows** — no OS permission needed; capture is silent immediately.
- Closing the app window ends tracking, same as closing the browser tab.
- Consent: monitoring is disclosed on the portal login screen; keep it there.
