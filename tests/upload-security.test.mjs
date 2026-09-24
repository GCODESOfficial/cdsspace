import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import net from "node:net";
import { build } from "esbuild";
import JSZip from "jszip";

const root = process.cwd();
const work = await mkdtemp(path.join(root, "node_modules/.cache/cds-upload-security-"));
const bundle = path.join(work, "upload-security.mjs");
const outboundBundle = path.join(work, "safe-outbound-url.mjs");

await build({
  entryPoints: [path.join(root, "src/lib/upload-security.ts")],
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "node",
  alias: {
    "@": path.join(root, "src"),
    "server-only": path.join(root, "scripts/server-only-stub.js"),
  },
  external: ["sharp"],
  logLevel: "silent",
});
await build({
  entryPoints: [path.join(root, "src/lib/safe-outbound-url.ts")],
  outfile: outboundBundle,
  bundle: true,
  format: "esm",
  platform: "node",
  alias: { "server-only": path.join(root, "scripts/server-only-stub.js") },
  logLevel: "silent",
});

const security = await import(pathToFileURL(bundle).href);
const outbound = await import(pathToFileURL(outboundBundle).href);
process.env.UPLOAD_MALWARE_SCAN_MODE = "disabled";

function upload(name, buffer, type = "application/octet-stream") {
  return {
    name,
    type,
    size: buffer.length,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

test.after(async () => {
  await rm(work, { recursive: true, force: true });
});

test("blocks executable and antivirus test signatures", async () => {
  await assert.rejects(
    security.assertSecureBuffer(Buffer.from([0x4d, 0x5a, 0x90, 0x00])),
    /Windows executable/,
  );
  const eicar = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR", "-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("");
  await assert.rejects(security.assertSecureBuffer(Buffer.from(eicar)), /EICAR/);
});

test("blocks active PDFs, encrypted PDFs, and trailing payloads", async () => {
  await assert.rejects(
    security.assertSafeUpload(upload("active.pdf", Buffer.from("%PDF-1.7\n1 0 obj <</OpenAction 2 0 R>>\n%%EOF")), { allow: ["pdf"] }),
    /active content/,
  );
  await assert.rejects(
    security.assertSafeUpload(upload("locked.pdf", Buffer.from("%PDF-1.7\n/Encrypt 4 0 R\n%%EOF")), { allow: ["pdf"] }),
    /Encrypted PDFs/,
  );
  await assert.rejects(
    security.assertSafeUpload(upload("polyglot.pdf", Buffer.from("%PDF-1.7\n%%EOF\nMZpayload")), { allow: ["pdf"] }),
    /appended/,
  );
});

test("inspects ZIP contents and rejects embedded executables and compression bombs", async () => {
  const dangerous = new JSZip();
  dangerous.file("assets/installer.exe", Buffer.from("not-even-a-real-exe"));
  const dangerousBytes = await dangerous.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await assert.rejects(
    security.assertSafeUpload(upload("assets.zip", dangerousBytes), { allow: ["zip"], maxBytes: 5 * 1024 * 1024 }),
    /blocked executable/,
  );

  const bomb = new JSZip();
  bomb.file("zeros.txt", Buffer.alloc(2 * 1024 * 1024));
  const bombBytes = await bomb.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  await assert.rejects(
    security.assertSafeUpload(upload("bomb.zip", bombBytes), { allow: ["zip"], maxBytes: 5 * 1024 * 1024 }),
    /decompression bomb|compression ratio/,
  );
});

test("accepts a structurally safe ZIP and rejects double-extension names", async () => {
  const zip = new JSZip();
  zip.file("brief/readme.txt", "hello");
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const safe = await security.assertSafeUpload(upload("brief.zip", bytes), { allow: ["zip"] });
  assert.equal(safe.kind, "zip");
  await assert.rejects(
    security.assertSafeUpload(upload("invoice.exe.pdf", Buffer.from("%PDF-1.7\n%%EOF")), { allow: ["pdf"] }),
    /Double-extension/,
  );
});

test("streams uploads to ClamAV and fails closed on a malware detection", async () => {
  const server = net.createServer((socket) => {
    let received = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.length >= 4 && received.subarray(-4).equals(Buffer.alloc(4))) {
        socket.end("stream: test-signature FOUND\0");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  process.env.UPLOAD_MALWARE_SCAN_MODE = "required";
  process.env.CLAMAV_HOST = "127.0.0.1";
  process.env.CLAMAV_PORT = String(address.port);
  try {
    await assert.rejects(security.assertSecureBuffer(Buffer.from("ordinary bytes")), /Malware was detected/);
  } finally {
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
    process.env.UPLOAD_MALWARE_SCAN_MODE = "disabled";
    await new Promise((resolve) => server.close(resolve));
  }
});

test("blocks loopback, private, link-local, mapped, and credentialed outbound URLs", async () => {
  const blocked = [
    "http://127.0.0.1/admin",
    "http://10.0.0.2/metadata",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "https://user:password@example.com/",
    "https://example.com:8443/",
  ];
  for (const url of blocked) await assert.rejects(outbound.assertPublicHttpUrl(url));
});

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await routeFiles(full));
    else if (entry.name === "route.ts") files.push(full);
  }
  return files;
}

test("every API upload route reaches the central security gate", async () => {
  const securityTokens = [
    "assertSafeUpload", "assertSafeImage", "assertSecureBuffer", "uploadDriveFile",
    "uploadClientDeliveryFiles", "completeClientDeliveryChunkUpload", "uploadContentHubFile",
    "uploadSopMedia", "videoToGifSticker", "uploadDeliveryCover",
  ];
  const unguarded = [];
  for (const file of await routeFiles(path.join(root, "src/app/api"))) {
    const source = await readFile(file, "utf8");
    const receivesFile = source.includes("formData()") || source.includes("instanceof File") || source.includes("instanceof Blob");
    const storesFile = /\.upload\s*\(|arrayBuffer\s*\(\)/.test(source);
    if (receivesFile && storesFile && !securityTokens.some((token) => source.includes(token))) {
      unguarded.push(path.relative(root, file));
    }
  }
  assert.deepEqual(unguarded, []);
});

test("public forms store attachments privately behind an admin download route", async () => {
  const consultation = await readFile(path.join(root, "src/app/api/consultation/route.ts"), "utf8");
  const applications = await readFile(path.join(root, "src/app/api/forms/applications/route.ts"), "utf8");
  const download = await readFile(path.join(root, "src/app/api/admin/form-uploads/[token]/route.ts"), "utf8");
  assert.match(consultation, /SECURE_FORM_UPLOAD_BUCKET/);
  assert.match(applications, /SECURE_FORM_UPLOAD_BUCKET/);
  assert.doesNotMatch(consultation, /getPublicUrl/);
  assert.doesNotMatch(applications, /getPublicUrl/);
  assert.match(download, /getAdminSession/);
  assert.match(download, /Content-Disposition/);
  assert.match(download, /X-Content-Type-Options/);
});
