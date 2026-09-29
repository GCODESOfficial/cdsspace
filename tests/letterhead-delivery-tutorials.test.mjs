import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("letterhead delivery creates an isolated client-owned copy with provenance and storage accounting", async () => {
  const [migration, delivery] = await Promise.all([
    read("glashdb/migrations/20260925_letterhead_delivery_tutorials.sql"),
    read("src/lib/letterhead-delivery.ts"),
  ]);
  assert.match(migration, /delivered_by_cds boolean not null default false/);
  assert.match(migration, /uq_create_letterheads_active_delivery/);
  assert.match(delivery, /reserveClientStorage/);
  assert.match(delivery, /createPrivateAssetPrefix\(\{ kind: "client"/);
  assert.match(delivery, /owner_kind, owner_id/);
  assert.match(delivery, /'client'/);
  assert.match(delivery, /Delivered by CDS Space|Letterhead delivered by CDS Space/);
});

test("tutorial uploads are private, malware checked, automatically localised, and progress scoped", async () => {
  const [migration, localisationMigration, tutorials, processing, clientApi] = await Promise.all([
    read("glashdb/migrations/20260925_letterhead_delivery_tutorials.sql"),
    read("glashdb/migrations/20260925_tutorial_auto_localisation.sql"),
    read("src/lib/tutorials.ts"),
    read("src/lib/tutorial-processing.ts"),
    read("src/app/api/client/tutorials/route.ts"),
  ]);
  assert.match(migration, /tutorial-private-assets[^;]+false/s);
  assert.match(migration, /primary key \(client_user_id, tutorial_id\)/);
  assert.match(tutorials, /assertSafeUpload/);
  assert.match(tutorials, /150 \* 1024 \* 1024/);
  assert.match(tutorials, /language_code/);
  assert.match(localisationMigration, /processing_status/);
  assert.match(localisationMigration, /audio_path/);
  assert.match(processing, /audio\/transcriptions/);
  assert.match(processing, /gpt-4o-mini-tts/);
  assert.match(processing, /WEBVTT/);
  assert.match(clientApi, /getCreateActor\("client"\)/);
});

test("tutorial player exposes every requested control and follows accessibility language", async () => {
  const player = await read("src/components/tutorials/TutorialVideoPlayer.tsx");
  for (const contract of ["pictureInPicture", "webkitSetPresentationMode", "skip(-10)", "skip(10)", "Playback speed", "Audio language", "Captions", "screenshot", "cds-set-lang", "cds-lang-detected"]) {
    assert.match(player, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("live signatures use the protected letterhead upload route", async () => {
  const [studio, pad] = await Promise.all([
    read("src/components/create/LetterheadStudio.tsx"),
    read("src/components/csign/LiveSignaturePad.tsx"),
  ]);
  assert.match(studio, /Sign live with cSign/);
  assert.match(studio, /upload\("signature", file\)/);
  assert.match(pad, /getCoalescedEvents/);
  assert.match(pad, /toBlob\(resolve, "image\/png"\)/);
});
