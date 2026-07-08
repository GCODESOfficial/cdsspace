# Desktop app installers

The team login page links here for the CDS Space desktop app downloads.
After building the app (`cd desktop && npm run dist:mac` / `npm run dist:win`),
copy the installers into this folder with these exact names:

- `CDS-Space-mac.dmg`  ← from `desktop/dist/CDS Space-<version>.dmg`
- `CDS-Space-win.exe`  ← from `desktop/dist/CDS Space Setup <version>.exe`

Or host them elsewhere (S3, GitHub Releases, etc.) and set these env vars so
the buttons point at the hosted files instead:

```
NEXT_PUBLIC_DESKTOP_APP_MAC_URL=https://.../CDS-Space-mac.dmg
NEXT_PUBLIC_DESKTOP_APP_WIN_URL=https://.../CDS-Space-win.exe
```
