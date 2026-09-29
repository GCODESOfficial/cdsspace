import { ClientTutorialLibrary } from "@/components/tutorials/ClientTutorialLibrary";

export const dynamic = "force-dynamic";

export default function TutorialsPage() {
  return (
    <div className="min-h-full bg-[#F5F8FF] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        <p className="text-[12px] font-semibold text-[#0A4FE8]">Learning centre</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#07133B] sm:text-3xl">Video tutorials</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#667085]">Learn each CDS Space tool in your preferred language. The player follows your accessibility language and lets you switch to any available audio track.</p>
        <div className="mt-7"><ClientTutorialLibrary /></div>
      </div>
    </div>
  );
}
