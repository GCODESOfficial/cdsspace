'use client';

import { useRouter } from 'next/navigation';

export default function MobileBlockedPage() {
  const router = useRouter();

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#151D48] text-white px-6 text-center">
      <h1 className="text-3xl font-bold">Desktop Required</h1>
      <p className="mt-4 text-lg">
        The admin panel is only accessible on a desktop. Please switch to a larger screen to continue.
      </p>

      <button
        onClick={() => router.push('/')}
        className="mt-8 px-6 py-2 bg-white text-black font-semibold rounded hover:bg-gray-200 transition"
      >
        Go Back Home
      </button>
    </div>
  );
}