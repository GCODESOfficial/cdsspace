# CDS Space - ZKTeco Time Machine Bridge

A small local agent that lets the admin **Time Machine** portal use a USB ZKTeco
fingerprint reader (ZK4500 / ZK9500 / SLK20R). Browsers can't read USB scanners
directly, so this service runs on the kiosk PC and exposes the reader over
`http://127.0.0.1:8787`.

It ships with a **simulator** so the portal is fully usable for setup and demos
before any hardware arrives.

## Windows kiosk setup (production)

The reader is a USB ZKTeco fingerprint scanner (ZK4500 / ZK9500 / SLK20R) on a
**Windows** PC. The bridge auto-detects it once the ZKTeco SDK is installed.

1. **Install Node.js LTS (64-bit)** on the kiosk PC - https://nodejs.org
2. **Install the ZKFinger SDK** from the ZKTeco download centre:
   https://www.zkteco.com/en/download_center → *Software / SDK* → **"ZKFinger SDK"**
   (a.k.a. *Fingerprint Reader SDK* / *Standalone SDK*). This installs the device
   driver and `libzkfp.dll`. Plug the reader in **after** installing.
   - Use the **64-bit** SDK to match 64-bit Node (arch must match the DLL).
   - If `libzkfp.dll` isn't on the system PATH, point the bridge at it:
     `set ZKFINGER_DLL=C:\Program Files\ZKFinger SDK\lib\x64\libzkfp.dll`
3. **Start the bridge:**
   ```bat
   cd zkteco-bridge
   npm install
   npm start
   ```
   On boot it prints `active="zkfinger"` when the reader is found, or
   `active="simulator"` with the reason if not.
4. Open **Admin → HRM → Time Machine** on that PC. The device bar shows the
   reader as connected. Enroll a finger, then run Check-in / Check-out.

> Auto-start on login: wrap `npm start` in a `.bat` and add it to Task Scheduler
> (or use NSSM to run it as a Windows service).

### Driver modes (`ZK_DRIVER`)

| Value       | Behaviour |
|-------------|-----------|
| `auto` (default) | Use the reader if the SDK + device are present; else simulator. |
| `zkfinger`  | Force hardware; capture/identify error if no reader. |
| `simulator` | Force the simulator (no hardware). |

```bat
:: examples
npm start                         :: auto-detect
set ZK_DRIVER=zkfinger&& npm start :: force hardware
set ZK_DRIVER=simulator&& npm start:: force simulator
```

The portal also has a **Simulator mode** toggle in its device bar, so you can
exercise the full flow even before the reader/SDK are installed.

## How it fits together

```
Time Machine portal (browser)
   |  http://127.0.0.1:8787  (this agent)
   v
ZKTeco bridge ── ZKFinger SDK / WebAPI ── USB reader
   ^
   |  templates synced from:
Next.js server  /api/admin/biometric   ──  Postgres (source of truth)
```

- **Enrollment**: portal calls `/capture`, gets a template, and saves it to the
  server DB (`team_fingerprints`).
- **Check-in/out (1:N)**: the portal periodically pushes all enrolled templates
  to `/sync`; on a scan it calls `/identify`, the bridge matches the live finger
  against the synced templates and returns the `memberId`; the portal then posts
  the attendance to the server.

Templates are compact ZKTeco minutiae blobs (base64) - **never raw fingerprint
images**.

## HTTP contract

| Method | Path        | Body                                   | Returns |
|--------|-------------|----------------------------------------|---------|
| GET    | `/health`   | -                                      | `{ ok, device:{connected,model,serial}, enrolledCount, mode, version }` |
| POST   | `/sync`     | `{ templates:[{id,memberId,finger,template,format}] }` | `{ ok, loaded }` |
| POST   | `/capture`  | -                                      | `{ ok, template, format, quality }` |
| POST   | `/identify` | -                                      | `{ ok, matched, memberId?, finger?, score?, quality? }` |

## How the hardware driver works

The `zkfinger` driver in `index.mjs` calls `libzkfp.dll` directly through
[`koffi`](https://koffi.dev) (a prebuilt FFI - no C/C++ compiler needed). The
binding lives in `zkfinger-sdk.mjs`. Flow:

- **Enroll** (`/capture`): three presses → `ZKFPM_DBMerge` → one registration
  template (base64), saved to the server DB.
- **Sync** (`/sync`): each enrolled template is `ZKFPM_DBAdd`-ed into the SDK's
  in-memory cache, mapped to its `memberId`.
- **Identify** (`/identify`): one press → `ZKFPM_DBIdentify` → matched `memberId`
  + score (1:N).

Tuning, if your SDK build differs:

- **Template size / image size** - `TEMPLATE_MAX`, `IMAGE_MAX` in `zkfinger-sdk.mjs`.
- **Match strictness** - the portal rejects matches below `MATCH_SCORE_THRESHOLD`
  in `src/lib/biometric/constants.ts`. Raise/lower to fit your reader's score scale.

> After switching from simulator to a real reader, **re-enroll** members - old
> `SIM:` templates aren't valid hardware templates and are skipped on sync.

## Env vars

| Var                | Default       | Purpose |
|--------------------|---------------|---------|
| `ZK_BRIDGE_PORT`   | `8787`        | Local port this agent listens on |
| `ZK_DRIVER`        | `auto`        | `auto`, `zkfinger`, or `simulator` |
| `ZKFINGER_DLL`     | `libzkfp.dll` | Full path to `libzkfp.dll` if not on PATH |
| `ZK_DEVICE_SERIAL` | `auto`        | Optional serial shown in `/health` |
