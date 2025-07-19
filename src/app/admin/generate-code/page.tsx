"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function GenerateCodePage() {
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  };

  const handleGenerate = async () => {
    if (!contact) return setMessage("Enter WhatsApp contact first.");
  
    // ✅ Validate contact format (basic phone number)
    const isValidPhone = /^\+?[0-9]{7,15}$/.test(contact);
    if (!isValidPhone) {
      return setMessage("❌ Invalid contact number format. Use e.g. 2349012345678");
    }
  
    const newCode = generateCode();
    setCode(newCode);
  
    const { error } = await supabase.from("access_codes").insert([
      {
        code: newCode,
        whatsapp_contact: contact,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    ]);
  
    if (error) {
      console.error(error);
      return setMessage("❌ Error saving code to database.");
    }
  
    setMessage("✅ Code generated and saved successfully.");
  };
  

  const whatsappText = `Hi! Your project access code is: ${code}\nVisit: https://cdsspace.com/access\nEnter the code to access your brand identity design page.`;

  const handleSendWhatsApp = () => {
    if (!contact || !code) return;
    const urlText = encodeURIComponent(whatsappText);
    const url = `https://wa.me/${contact.replace(/\D/g, "")}?text=${urlText}`;
    window.open(url, "_blank");
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#151D48] px-4 text-black">
      <div className="bg-white shadow-lg rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Generate Project Access Code</h2>

        <input
  id="contact"
  type="tel"
  inputMode="tel"
  pattern="^\+?[0-9]{7,15}$"
  value={contact}
  onChange={(e) => setContact(e.target.value)}
  placeholder="e.g. 2349012345678"
  className="w-full border px-4 py-2 rounded mb-3"
/>


        <button
          onClick={handleGenerate}
          className="w-full bg-blue-700 text-white py-2 rounded hover:bg-blue-800"
        >
          Generate & Save to Supabase
        </button>

        {message && <p className="mt-3 text-sm text-gray-600">{message}</p>}

        {code && (
          <div className="mt-4 border-t pt-4">
            <p className="font-semibold">Generated Code:</p>
            <div className="mt-1 bg-[#2847f7] text-white text-center py-2 rounded font-mono text-lg">
              {code}
            </div>

            <div className="mt-3 text-sm">
              WhatsApp Message to send:
              <div className="mt-2 bg-[#151D48] text-white p-3 rounded text-sm relative whitespace-pre-line">
                {whatsappText}
                <button
                  onClick={handleCopyMessage}
                  className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
                >
                  {copied ? "✅ Copied" : "Copy"}
                </button>
              </div>

              <button
                onClick={handleSendWhatsApp}
                className="mt-3 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                ✅ Send to WhatsApp
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
