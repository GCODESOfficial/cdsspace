const { contextBridge, ipcRenderer } = require("electron");

// The portal's WorkTracker detects this bridge and switches to silent
// multi-screen capture (no getDisplayMedia picker, no sharing banner).
contextBridge.exposeInMainWorld("cdsDesktop", {
  captureScreens: () => ipcRenderer.invoke("cds:capture-screens"),
  version: () => ipcRenderer.invoke("cds:version"),
});
