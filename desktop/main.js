/**
 * CDS Space Desktop — an Electron shell around the team portal.
 *
 * Why this exists: browsers refuse to capture the screen without a picker
 * dialog and a persistent "sharing your screen" banner. This app has OS-level
 * screen access, so the portal's WorkTracker (which detects `window.cdsDesktop`
 * from preload.js) can capture ALL monitors silently at the configured
 * interval — no prompts, no banner. Monitoring is disclosed to members on the
 * portal login screen.
 *
 * macOS note: the FIRST capture on a machine requires enabling
 * System Settings → Privacy & Security → Screen Recording for "CDS Space".
 * The app detects this and opens that settings pane automatically.
 */

const { app, BrowserWindow, ipcMain, desktopCapturer, shell, systemPreferences, dialog, nativeImage } = require("electron");
const path = require("path");

const PORTAL_URL = process.env.CDS_PORTAL_URL || "https://cdsspace.pro/team";
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
const MAX_CAPTURE_WIDTH = 1600;

const APP_ICON = path.join(__dirname, "build", "icon.png");

// Force the app name everywhere (dev menu bar, About panel, notifications).
// Packaged builds get this from productName; setName covers `npm start` too.
app.setName("CDS Space");
app.setAboutPanelOptions({
  applicationName: "CDS Space",
  applicationVersion: app.getVersion(),
  copyright: "© CDS Space",
});

let mainWindow = null;
let macPermissionPromptShown = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "CDS Space",
    icon: APP_ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(PORTAL_URL);

  // Keep the app locked to the portal; open anything external in the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(PORTAL_ORIGIN)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(PORTAL_ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

function macScreenPermissionGranted() {
  if (process.platform !== "darwin") return true;
  return systemPreferences.getMediaAccessStatus("screen") === "granted";
}

async function promptMacScreenPermission() {
  if (macPermissionPromptShown || !mainWindow) return;
  macPermissionPromptShown = true;
  await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Screen Recording permission needed",
    message: "CDS Space needs Screen Recording permission for work-session reporting.",
    detail: "System Settings will open — enable \"CDS Space\" under Privacy & Security → Screen Recording, then quit and reopen the app.",
    buttons: ["Open System Settings"],
  });
  shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
}

// Renderer bridge: capture every attached display as a JPEG data URL.
ipcMain.handle("cds:capture-screens", async () => {
  if (!macScreenPermissionGranted()) {
    void promptMacScreenPermission();
    return { ok: false, error: "screen_permission_required", screens: [] };
  }
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: MAX_CAPTURE_WIDTH, height: Math.round(MAX_CAPTURE_WIDTH * 0.75) },
    });
    const screens = sources
      .filter((source) => !source.thumbnail.isEmpty())
      .map((source, index) => ({
        label: source.name || `Screen ${index + 1}`,
        dataUrl: `data:image/jpeg;base64,${source.thumbnail.toJPEG(60).toString("base64")}`,
      }));
    return { ok: true, screens };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : "capture_failed", screens: [] };
  }
});

ipcMain.handle("cds:version", () => app.getVersion());

app.whenReady().then(() => {
  // macOS dock icon in dev (unpackaged) — packaged builds use build/icon.png.
  if (process.platform === "darwin" && app.dock) {
    try {
      const image = nativeImage.createFromPath(APP_ICON);
      if (!image.isEmpty()) app.dock.setIcon(image);
    } catch { /* dev-only nicety */ }
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Closing the window ends the session (same as closing the browser tab).
  app.quit();
});
