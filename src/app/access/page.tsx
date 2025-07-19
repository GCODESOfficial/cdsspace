"use client";

import { useRouter } from "next/navigation"; // add this at the top
import { useRef, useState } from "react";

export default function AccessPage() {
  const [code, setCode] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const router = useRouter(); // inside your component


  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleStart = () => {
    setHasInteracted(true);
    videoRef.current?.play();
  };

  const handleSubmit = async () => {
    setLoading(true);
  
    // ✅ Basic phone validation on client before sending
    const isValidPhone = /^\+?[0-9]{7,15}$/.test(whatsapp);
    if (!isValidPhone) {
      setError("Enter a valid contact number, e.g., +2349012345678.");
      setLoading(false);
      return;
    }
  
    const res = await fetch("/api/verify-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, whatsapp }),
    });
  
    const data = await res.json();
    setLoading(false);
  
    if (data.success) {
      router.push("/logofolio");
    } else {
      setError(data.message);
    }
  };
  
  

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-black bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url('/images/Start.svg')` }}>
      {/* 🎬 Fullscreen Video */}
      <video
        ref={videoRef}
        src="/CDS Space Branding Agency.mp4"
        playsInline
        controls={false}
        onEnded={() => setShowForm(true)}
        className={`absolute top-0 left-0 w-full h-full object-cover z-0 transition-all duration-[2000ms] ease-in-out ${
          showForm ? "scale-125 opacity-0" : "scale-100 opacity-100"
        }`}
      />

      {/* ▶️ Initial Play Button */}
      {!hasInteracted && (
        <div className="absolute inset-0 z-10 bg-cover bg-center bg-no-repeat flex items-center justify-center" style={{ backgroundImage: `url('/images/Start.svg')` }}>
          <button
            onClick={handleStart}
            className=" text-lg font-bold bg-blue-700 px-6 py-3 rounded-full hover:bg-blue-800 transition-all"
          >
            Your Journey Begins Now!
          </button>
        </div>
      )}

      {/* 📄 Show Form after Video Ends */}
      {showForm && (
        <div
          className={`transition-opacity duration-1000 ease-in-out opacity-100 relative z-10 flex items-center justify-center min-h-screen`}
        >
          <div className="bg-white/95 rounded-xl shadow-lg p-8 w-[90%] max-w-md">
            <h2 className="text-center text-xl font-bold text-gray-800 mb-6">
              Enter your Project Code
            </h2>

            <div className="space-y-4">
              <label>Project Code Given upon Payment</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Project Code..."
                className="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />

<label>WhatsApp Contact</label>
<input
  type="tel"
  value={whatsapp}
  onChange={(e) => setWhatsapp(e.target.value)}
  placeholder="e.g. +1234567890"
  pattern="^\+?[0-9\s\-]{7,15}$"
  className="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
/>


              {error && <p className="text-red-600 text-sm">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-blue-800 text-white py-2 rounded font-semibold hover:bg-blue-900 transition-all duration-200"
              >
                {loading ? "Verifying..." : "Let’s Get Started"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
