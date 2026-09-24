import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Download, File, FolderOpen, HardDrive } from "lucide-react";
import { notFound } from "next/navigation";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { PlatformMediaViewer } from "@/components/media/PlatformMediaViewer";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function sharedDrive(token: string) {
  if (!UUID.test(token)) return null;
  return glashMaybeOne<{ id: string; name: string; description: string | null; updated_at: string }>(
    `select id, name, description, updated_at
       from public.client_drives
      where public_token = $1::uuid and status = 'active'
      limit 1`,
    [token],
  );
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const drive = await sharedDrive(token);
  return {
    title: drive ? `${drive.name} | CDS Space cDrive` : "Shared cDrive | CDS Space",
    description: drive?.description || "Files shared securely from CDS Space cDrive.",
    robots: { index: false, follow: false },
  };
}

function fileSize(bytes: string) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export default async function SharedDrivePage({ params }: { params: Params }) {
  const { token } = await params;
  const drive = await sharedDrive(token);
  if (!drive) notFound();

  const [folders, files] = await Promise.all([
    glashQuery<{ id: string; name: string }>(
      `select id, name from public.client_drive_folders where drive_id = $1::uuid order by name`,
      [drive.id],
    ),
    glashQuery<{ public_token: string; folder_id: string | null; file_name: string; mime_type: string | null; file_size: string }>(
      `select public_token, folder_id, file_name, mime_type, file_size::text
         from public.client_drive_files
        where drive_id = $1::uuid
        order by created_at desc`,
      [drive.id],
    ),
  ]);
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));

  return (
    <main className="min-h-screen bg-[#F3F6FB] px-4 py-8 text-[#07133B] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" aria-label="CDS Space home" className="inline-flex items-center">
            <Image src="/images/cds-logo.svg" alt="CDS Space" width={112} height={40} className="h-9 w-auto" priority />
          </Link>
          <span className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-[#0A4FE8]">Shared cDrive</span>
        </header>

        <section className="overflow-hidden rounded-3xl border border-[#DFE6F1] bg-white shadow-[0_20px_60px_rgba(7,19,59,0.08)]">
          <div className="border-b border-[#E9EEF6] px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><HardDrive className="h-6 w-6" /></span>
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-semibold sm:text-3xl">{drive.name}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{drive.description || "Files shared securely through CDS Space."}</p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            {files.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {files.map((file) => {
                  const fileUrl = `/api/drive/${token}/files/${file.public_token}`;
                  const content = <>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-500 group-hover:bg-white group-hover:text-[#0A4FE8]"><File className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{file.file_name}</span>
                      <span className="mt-1 block truncate text-[11px] text-slate-400">{file.folder_id ? folderNames.get(file.folder_id) || "Folder" : "Drive files"} · {fileSize(file.file_size)}</span>
                    </span>
                  </>;
                  return file.mime_type?.startsWith("image/") ? (
                    <PlatformMediaViewer key={file.public_token} url={fileUrl} title={file.file_name} detail={fileSize(file.file_size)} triggerClassName="group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-[#E1E7F2] p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40">
                      {content}
                    </PlatformMediaViewer>
                  ) : (
                    <a key={file.public_token} href={fileUrl} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-[#E1E7F2] p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
                      {content}<Download className="h-4 w-4 shrink-0 text-[#0A4FE8]" />
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 px-6 text-center">
                <div><FolderOpen className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm text-slate-500">This shared drive does not contain any files yet.</p></div>
              </div>
            )}
          </div>
        </section>
        <p className="mt-5 text-center text-xs text-slate-400">Shared securely with CDS Space cDrive</p>
      </div>
    </main>
  );
}
