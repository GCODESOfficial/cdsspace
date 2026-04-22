"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { KeyRound, Send, Copy, Check, MessageSquare, Info, Eye } from "lucide-react";

export default function GenerateCodePage() {
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error" | "">("");
  const [copied, setCopied] = useState(false);

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const handleGenerate = async () => {
    if (!contact) { setMessage("Enter WhatsApp contact first."); setMsgType("error"); return; }
    if (!/^\+?[0-9]{7,15}$/.test(contact)) { setMessage("Invalid format. Use e.g. 2349012345678"); setMsgType("error"); return; }

    const newCode = generateCode();
    setCode(newCode);

    const { error } = await supabase.from("access_codes").insert([{
      code: newCode,
      whatsapp_contact: contact,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }]);

    if (error) { setMessage("Error saving code to database."); setMsgType("error"); return; }
    setMessage("Code generated and saved successfully."); setMsgType("success");
  };

  const whatsappText = `Hi! Your project access code is: ${code}\nVisit: https://cdsspace.pro/access\nEnter the code to access your brand identity design page.`;

  const handleSendWhatsApp = () => {
    if (!contact || !code) return;
    window.open(`https://wa.me/${contact.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappText)}`, "_blank");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(whatsappText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-[700px]">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[#0A4FE8] text-sm font-semibold">Access Management</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Generate Access Code</h1>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 rounded-2xl p-4 mb-6 flex gap-3">
        <Info className="w-5 h-5 text-[#0A4FE8] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-medium text-[#0D1B39]">What are access codes?</p>
          <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
            Access codes are unique 6-character keys generated for clients to securely view their brand identity work.
            Each code is linked to a client&apos;s WhatsApp number, expires after 7 days, and grants access to their
            dedicated brand identity design page at <span className="font-medium text-[#0A4FE8]">cdsspace.pro/access</span>.
          </p>
        </div>
      </div>

      {/* Generate Form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-[15px] font-semibold text-[#0D1B39] mb-5 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#0A4FE8]" />
          New Code
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Client WhatsApp Number</label>
            <input
              type="tel"
              inputMode="tel"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. 2349012345678"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition font-mono"
            />
            <p className="text-[11px] text-gray-400 mt-1.5">Include country code without + sign</p>
          </div>

          <button
            onClick={handleGenerate}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition"
          >
            <KeyRound className="w-4 h-4" />
            Generate Code
          </button>

          {message && (
            <div className={`px-4 py-3 rounded-xl text-sm font-medium ${
              msgType === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
            }`}>
              {message}
            </div>
          )}
          <div className="pt-4 mt-4 border-t border-gray-50 flex items-center justify-between">
            <p className="text-[12px] text-gray-400">Need to see existing codes?</p>
            <Link
              href="/admin/viewcodes"
              className="flex items-center gap-1.5 text-[12px] font-medium text-[#0A4FE8] hover:underline"
            >
              <Eye className="w-3.5 h-3.5" />
              View Codes List
            </Link>
          </div>
        </div>
      </div>

      {/* Generated Code Result */}
      {code && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-[15px] font-semibold text-[#0D1B39] mb-4">Generated Code</h2>

          {/* Code display */}
          <div className="bg-[#0D1B39] rounded-xl p-5 text-center mb-5">
            <p className="text-3xl font-mono font-bold text-white tracking-[0.3em]">{code}</p>
            <p className="text-[11px] text-gray-400 mt-2">Expires in 7 days</p>
          </div>

          {/* WhatsApp Message */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Message to send</label>
            <div className="relative bg-gray-50 rounded-xl p-4 text-[13px] text-gray-700 whitespace-pre-line border border-gray-200">
              {whatsappText}
              <button
                onClick={handleCopy}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-[#0A4FE8] hover:border-blue-200 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-4">
            <button onClick={handleSendWhatsApp}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition">
              <Send className="w-4 h-4" /> Send via WhatsApp
            </button>
            <button onClick={handleCopy}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-600 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition">
              <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy Message"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
