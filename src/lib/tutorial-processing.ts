import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { TUTORIAL_BUCKET, TUTORIAL_LANGUAGES } from "@/lib/tutorials";

type Segment = { start: number; end: number; text: string };

function openAIHeaders(json = false) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Automatic tutorial captions require OPENAI_API_KEY.");
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (json) headers["Content-Type"] = "application/json";
  if (process.env.OPENAI_ORGANIZATION) headers["OpenAI-Organization"] = process.env.OPENAI_ORGANIZATION;
  return headers;
}

function runFfmpeg(args: string[]) {
  const executable = ffmpegPath;
  if (!executable) throw new Error("The video processing service is unavailable.");
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += String(chunk).slice(-20_000); });
    child.on("error", reject);
    child.on("close", (code: number | null) => code === 0 ? resolve(stderr) : reject(new Error(`Video processing failed (${code}): ${stderr.slice(-600)}`)));
  });
}

async function mediaDuration(file: string) {
  try {
    const output = await runFfmpeg(["-i", file, "-f", "null", "-"]);
    const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const match = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
  }
}

function vttTime(value: number) {
  const ms = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function toVtt(segments: Segment[]) {
  return `WEBVTT\n\n${segments.map((segment, index) => `${index + 1}\n${vttTime(segment.start)} --> ${vttTime(Math.max(segment.end, segment.start + 0.2))}\n${segment.text.replace(/\r?\n/g, " ").trim()}\n`).join("\n")}`;
}

async function transcribeChunk(filePath: string, sourceLanguage: string, offset: number): Promise<Segment[]> {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "audio/mpeg" }), path.basename(filePath));
  form.set("model", "whisper-1");
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.set("language", sourceLanguage);
  form.set("prompt", "CDS Space product tutorial. Preserve product names such as CDS Space, cDrive, cMeet, cSign and Create Studio.");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: openAIHeaders(), body: form });
  if (!response.ok) throw new Error(`Caption generation failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  const result = await response.json() as { text?: string; duration?: number; segments?: Array<{ start?: number; end?: number; text?: string }> };
  const segments = Array.isArray(result.segments) ? result.segments.map((segment) => ({
    start: offset + Number(segment.start || 0),
    end: offset + Number(segment.end || segment.start || 0),
    text: String(segment.text || "").trim(),
  })).filter((segment) => segment.text) : [];
  if (segments.length) return segments;
  return result.text?.trim() ? [{ start: offset, end: offset + Number(result.duration || 10), text: result.text.trim() }] : [];
}

async function transcribeAudio(audioPath: string, sourceLanguage: string, workingDirectory: string) {
  const bytes = await readFile(audioPath);
  if (bytes.byteLength <= 24 * 1024 * 1024) return transcribeChunk(audioPath, sourceLanguage, 0);
  const pattern = path.join(workingDirectory, "speech-%03d.mp3");
  await runFfmpeg(["-y", "-i", audioPath, "-f", "segment", "-segment_time", "600", "-c", "copy", pattern]);
  const chunks = (await readdir(workingDirectory)).filter((name) => /^speech-\d+\.mp3$/.test(name)).sort();
  const output: Segment[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    output.push(...await transcribeChunk(path.join(workingDirectory, chunks[index]), sourceLanguage, index * 600));
  }
  return output;
}

async function translateSegments(segments: Segment[], languageName: string) {
  const translated: string[] = [];
  for (let start = 0; start < segments.length; start += 80) {
    const source = segments.slice(start, start + 80).map((segment) => segment.text);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: openAIHeaders(true),
      body: JSON.stringify({
        model: process.env.OPENAI_DEFAULT_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `Translate each subtitle naturally into ${languageName}. Preserve names, URLs, numbers, and meaning. Return only JSON with a translations array of exactly the same length and order.` },
          { role: "user", content: JSON.stringify({ subtitles: source }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Translation to ${languageName} failed (${response.status}).`);
    const payload = await response.json();
    const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || "{}");
    if (!Array.isArray(parsed.translations) || parsed.translations.length !== source.length) throw new Error(`Translation to ${languageName} returned incomplete subtitles.`);
    translated.push(...parsed.translations.map((value: unknown) => String(value || "").trim()));
  }
  return segments.map((segment, index) => ({ ...segment, text: translated[index] || segment.text }));
}

function textChunks(text: string, maximum = 3500) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > maximum) { chunks.push(current); current = word; }
    else current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);
  return chunks;
}

function atempoChain(ratio: number) {
  const filters: string[] = [];
  let remaining = Math.max(0.05, ratio);
  while (remaining > 2) { filters.push("atempo=2"); remaining /= 2; }
  while (remaining < 0.5) { filters.push("atempo=0.5"); remaining /= 0.5; }
  filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters.join(",");
}

async function generateDub(text: string, languageName: string, targetDuration: number, workingDirectory: string) {
  const pieces = textChunks(text);
  const files: string[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: openAIHeaders(true),
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: pieces[index],
        instructions: `Speak naturally and clearly in ${languageName}, as a calm professional software tutorial narrator.`,
        response_format: "mp3",
      }),
    });
    if (!response.ok) throw new Error(`Audio generation for ${languageName} failed (${response.status}).`);
    const output = path.join(workingDirectory, `dub-${languageName}-${index}.mp3`.replace(/[^a-z0-9._-]/gi, "-"));
    await writeFile(output, Buffer.from(await response.arrayBuffer()));
    files.push(output);
  }
  if (!files.length) throw new Error(`No speech was generated for ${languageName}.`);
  const concatList = path.join(workingDirectory, `concat-${languageName}.txt`.replace(/[^a-z0-9._-]/gi, "-"));
  await writeFile(concatList, files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"));
  const joined = path.join(workingDirectory, `joined-${languageName}.mp3`.replace(/[^a-z0-9._-]/gi, "-"));
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c:a", "libmp3lame", "-b:a", "96k", joined]);
  const generatedDuration = await mediaDuration(joined);
  if (!targetDuration || !generatedDuration) return readFile(joined);
  const fitted = path.join(workingDirectory, `fitted-${languageName}.mp3`.replace(/[^a-z0-9._-]/gi, "-"));
  const ratio = generatedDuration / targetDuration;
  await runFfmpeg(["-y", "-i", joined, "-af", `${atempoChain(ratio)},apad,atrim=duration=${targetDuration.toFixed(3)}`, "-c:a", "libmp3lame", "-b:a", "96k", fitted]);
  return readFile(fitted);
}

async function uploadAsset(storage: any, storagePath: string, bytes: Buffer, contentType: string) {
  const { error } = await storage.upload(storagePath, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);
}

export async function processTutorialLocalisation(tutorialId: string) {
  const work = await mkdtemp(path.join(tmpdir(), "cds-tutorial-"));
  const generatedPaths: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getGlashDbAdmin() as any;
  const storage = db.storage.from(TUTORIAL_BUCKET);
  try {
    /** Records which step this tutorial is on so the admin screen can name it. */
    const setStage = async (stage: string, progress = 0) => {
      await glashQuery(
        `update public.dashboard_tutorials set processing_stage=$2, processing_progress=$3 where id=$1::uuid`,
        [tutorialId, stage, Math.max(0, Math.min(100, Math.round(progress)))],
      ).catch(() => undefined);
    };

    await glashQuery(`update public.dashboard_tutorials set processing_status='processing', processing_error=null, processing_started_at=now() where id=$1::uuid`, [tutorialId]);
    await setStage("preparing");
    const source = await glashMaybeOne<{ id: string; language_code: string; language_name: string; video_path: string; video_name: string; video_mime: string }>(
      `select m.id, m.language_code, m.language_name, m.video_path, m.video_name, m.video_mime
       from public.dashboard_tutorial_media m where m.tutorial_id=$1::uuid and m.is_original limit 1`, [tutorialId],
    );
    const previousGenerated = await glashQuery<{ audio_path: string | null; captions_path: string | null }>(
      `select audio_path, captions_path from public.dashboard_tutorial_media where tutorial_id=$1::uuid`, [tutorialId],
    );
    if (!source?.video_path) throw new Error("The original tutorial video is missing.");
    const downloaded = await storage.download(source.video_path);
    if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message || "The original tutorial could not be read.");
    const extension = path.extname(source.video_name || source.video_path) || ".mp4";
    const inputPath = path.join(work, `original${extension}`);
    const audioPath = path.join(work, "speech.mp3");
    await writeFile(inputPath, Buffer.from(await downloaded.data.arrayBuffer()));
    await runFfmpeg(["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audioPath]);
    const duration = await mediaDuration(inputPath);
    await setStage("transcribing");
    const sourceSegments = await transcribeAudio(audioPath, source.language_code, work);
    if (!sourceSegments.length) throw new Error("No spoken words were detected in this tutorial.");

    const sourceCaptions = Buffer.from(toVtt(sourceSegments), "utf8");
    const sourceCaptionPath = `tutorials/${tutorialId}/${source.language_code}/captions-${crypto.randomUUID()}.vtt`;
    await uploadAsset(storage, sourceCaptionPath, sourceCaptions, "text/vtt; charset=utf-8");
    generatedPaths.push(sourceCaptionPath);
    await glashQuery(
      `update public.dashboard_tutorial_media set captions_path=$2, captions_name=$3, captions_size_bytes=$4, generated_by='openai-whisper-1'
       where id=$1::uuid`, [source.id, sourceCaptionPath, `${source.language_code}-captions.vtt`, sourceCaptions.byteLength],
    );

    const failures: string[] = [];
    // Translation is the long stage and the only one with a countable total,
    // so its progress is real: languages finished out of languages to do.
    const targets = TUTORIAL_LANGUAGES.filter((item) => item.code !== source.language_code);
    let completedLanguages = 0;
    await setStage("translating", 0);
    for (const language of targets) {
      try {
        const translated = await translateSegments(sourceSegments, language.name);
        const captions = Buffer.from(toVtt(translated), "utf8");
        const narration = await generateDub(translated.map((segment) => segment.text).join(" "), language.name, duration, work);
        const prefix = `tutorials/${tutorialId}/${language.code}`;
        const captionPath = `${prefix}/captions-${crypto.randomUUID()}.vtt`;
        const audioStoragePath = `${prefix}/audio-${crypto.randomUUID()}.mp3`;
        await uploadAsset(storage, captionPath, captions, "text/vtt; charset=utf-8");
        await uploadAsset(storage, audioStoragePath, narration, "audio/mpeg");
        generatedPaths.push(captionPath, audioStoragePath);
        await glashQuery(
          `insert into public.dashboard_tutorial_media
            (tutorial_id, language_code, language_name, is_original, audio_path, audio_name, audio_mime, audio_size_bytes,
             captions_path, captions_name, captions_size_bytes, generated_by)
           values ($1::uuid,$2,$3,false,$4,$5,'audio/mpeg',$6,$7,$8,$9,'openai-gpt-4o-mini-tts')
           on conflict (tutorial_id, language_code) do update set
             language_name=excluded.language_name, audio_path=excluded.audio_path, audio_name=excluded.audio_name,
             audio_mime=excluded.audio_mime, audio_size_bytes=excluded.audio_size_bytes,
             captions_path=excluded.captions_path, captions_name=excluded.captions_name,
             captions_size_bytes=excluded.captions_size_bytes, generated_by=excluded.generated_by`,
          [tutorialId, language.code, language.name, audioStoragePath, `${language.code}-audio.mp3`, narration.byteLength,
            captionPath, `${language.code}-captions.vtt`, captions.byteLength],
        );
      } catch (error) {
        failures.push(`${language.name}: ${error instanceof Error ? error.message : "generation failed"}`);
      }
      completedLanguages += 1;
      await setStage("translating", (completedLanguages / targets.length) * 100);
    }
    await glashQuery(
      `update public.dashboard_tutorials set processing_status=$2, processing_stage=$2, processing_progress=100, processing_error=$3, processed_at=now() where id=$1::uuid`,
      [tutorialId, failures.length ? "failed" : "ready", failures.length ? failures.join(" | ").slice(0, 4000) : null],
    );
    if (!failures.length) {
      const stalePaths = previousGenerated
        .flatMap((item) => [item.audio_path, item.captions_path])
        .filter((item): item is string => Boolean(item) && !generatedPaths.includes(item as string));
      if (stalePaths.length) await storage.remove(stalePaths).catch(() => undefined);
    }
  } catch (error) {
    await glashQuery(
      `update public.dashboard_tutorials set processing_status='failed', processing_stage='failed', processing_error=$2, processed_at=now() where id=$1::uuid`,
      [tutorialId, (error instanceof Error ? error.message : "Tutorial processing failed.").slice(0, 4000)],
    ).catch(() => undefined);
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
