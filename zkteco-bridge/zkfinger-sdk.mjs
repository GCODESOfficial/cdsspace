/**
 * Thin FFI binding to the ZKTeco ZKFinger SDK (libzkfp) for standalone USB
 * readers (ZK4500 / ZK9500 / SLK20R).
 *
 * Uses `koffi` (prebuilt, no compiler needed) to call the C API exported by
 * `libzkfp.dll`. Install the "ZKFinger SDK" from the ZKTeco download centre on
 * the Windows kiosk; the DLL must be on PATH (or point ZKFINGER_DLL at it) and
 * the Node arch must match the DLL arch (64-bit Node ↔ 64-bit DLL).
 *
 * This binds the documented libzkfp surface. If your SDK build differs (older
 * builds vary in MAX template size or the DBIdentify score scale), the two
 * constants below and the portal's MATCH_SCORE_THRESHOLD are the knobs.
 */

// Generous fixed buffers so we don't have to query device geometry up front.
export const TEMPLATE_MAX = 2048;          // libzkfp MAX_TEMPLATE_SIZE
export const IMAGE_MAX = 1024 * 1024;      // covers any single-finger image

let koffi = null;
try {
  koffi = (await import("koffi")).default;
} catch {
  // koffi unavailable (e.g. not installed yet) → caller falls back to simulator.
}

export function koffiAvailable() {
  return Boolean(koffi);
}

/**
 * Load libzkfp.dll and return the bound functions. Throws if koffi or the DLL
 * isn't available - callers treat that as "no hardware".
 */
export function loadZkfinger(dllPath) {
  if (!koffi) throw new Error("koffi FFI is not installed");
  const lib = koffi.load(dllPath || "libzkfp.dll");
  return {
    Init: lib.func("int ZKFPM_Init()"),
    Terminate: lib.func("int ZKFPM_Terminate()"),
    GetDeviceCount: lib.func("int ZKFPM_GetDeviceCount()"),
    OpenDevice: lib.func("void *ZKFPM_OpenDevice(int index)"),
    CloseDevice: lib.func("int ZKFPM_CloseDevice(void *handle)"),
    // image + template are caller-allocated Buffers (zero-copy in koffi);
    // cbTemplate is in/out (capacity in, written length out).
    Acquire: lib.func(
      "int ZKFPM_AcquireFingerprint(void *handle, uint8_t *fpImage, uint32_t cbFPImage, uint8_t *fpTemplate, _Inout_ uint32_t *cbTemplate)",
    ),
    GetParameter: lib.func(
      "int ZKFPM_GetParameters(void *handle, int code, _Out_ uint8_t *value, _Inout_ uint32_t *size)",
    ),
    DBInit: lib.func("void *ZKFPM_DBInit()"),
    DBFree: lib.func("int ZKFPM_DBFree(void *cache)"),
    DBClear: lib.func("int ZKFPM_DBClear(void *cache)"),
    DBAdd: lib.func("int ZKFPM_DBAdd(void *cache, uint32_t fid, uint8_t *fpTemplate, uint32_t cbTemplate)"),
    DBDel: lib.func("int ZKFPM_DBDel(void *cache, uint32_t fid)"),
    DBIdentify: lib.func(
      "int ZKFPM_DBIdentify(void *cache, uint8_t *fpTemplate, uint32_t cbTemplate, _Out_ uint32_t *fid, _Out_ uint32_t *score)",
    ),
    DBMerge: lib.func(
      "int ZKFPM_DBMerge(void *cache, uint8_t *t1, uint8_t *t2, uint8_t *t3, uint8_t *regTemp, _Inout_ uint32_t *cbRegTemp)",
    ),
  };
}
