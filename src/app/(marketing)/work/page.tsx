import { WorkPageClient } from "@/components/marketing/WorkPageClient";
import type { Work } from "@/components/marketing/WorkGallery";
import { glashQuery } from "@/lib/glashdb/postgres";

export const dynamic = "force-dynamic";

async function loadPublicWorks() {
  try {
    const works = await glashQuery<Work>(
      `select id, title, category, cover_image, created_at
         from public.works
        order by created_at desc
        limit 200`,
    );
    return { works, loadError: false };
  } catch {
    return { works: [] as Work[], loadError: true };
  }
}

export default async function WorkPage() {
  const { works, loadError } = await loadPublicWorks();
  return <WorkPageClient initialWorks={works} loadError={loadError} />;
}
