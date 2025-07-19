"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface AccessCode {
  id: number;
  code: string;
  whatsapp_contact: string;
  expires_at: string;
  created_at: string;
}

export default function ViewCodesPage() {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("access_codes")
      .select("id, code, whatsapp_contact, expires_at, created_at")
      .order("created_at", { ascending: false });

    if (!error && data) setCodes(data as AccessCode[]);
    setLoading(false);
  };

  const handleCopyCode = async (code: string, id: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleResendWhatsApp = (contact: string, code: string) => {
    const message = `Hi! Your project access code is: ${code}%0AVisit: https://yourdomain.com/access%0AEnter the code to access your page.`;
    window.open(
      `https://wa.me/${contact.replace(/\D/g, "")}?text=${message}`,
      "_blank"
    );
  };

  const handleDeleteCode = async (id: number) => {
    if (!confirm("Are you sure you want to delete this code?")) return;
    const { error } = await supabase.from("access_codes").delete().eq("id", id);
    if (!error) {
      setCodes((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // ✅ Filter codes based on search input
  const filteredCodes = codes.filter(
    (item) =>
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.whatsapp_contact.includes(search)
  );

  // ✅ Pagination logic
  const totalPages = Math.ceil(filteredCodes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCodes = filteredCodes.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  return (
    <div className="min-h-screen bg-[#151D48] text-white flex items-center justify-center p-6">
      <div className="bg-white text-black rounded-lg shadow-lg p-6 w-full max-w-4xl">
        <h2 className="text-2xl font-bold mb-4">Generated Codes (Admin View)</h2>

        {/* ✅ Search Input */}
        <input
          type="text"
          placeholder="Search by code or WhatsApp number..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full border px-4 py-2 rounded mb-4"
        />

        {loading ? (
          <p className="text-gray-600">Loading codes...</p>
        ) : filteredCodes.length === 0 ? (
          <p className="text-gray-600">No matching codes found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-3 py-2 border">Code</th>
                    <th className="px-3 py-2 border">WhatsApp</th>
                    <th className="px-3 py-2 border">Expires</th>
                    <th className="px-3 py-2 border text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCodes.map((item) => (
                    <tr key={item.id} className="odd:bg-white even:bg-gray-50">
                      <td className="px-3 py-2 border font-mono flex items-center gap-2">
                        {item.code}
                        <button
                          onClick={() => handleCopyCode(item.code, item.id)}
                          className="text-xs bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-600"
                        >
                          {copiedCode === item.id ? "✅ Copied" : "Copy"}
                        </button>
                      </td>
                      <td className="px-3 py-2 border">{item.whatsapp_contact}</td>
                      <td className="px-3 py-2 border">
                        {new Date(item.expires_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 border text-center space-x-2">
                        <button
                          onClick={() =>
                            handleResendWhatsApp(
                              item.whatsapp_contact,
                              item.code
                            )
                          }
                          className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                        >
                          Resend
                        </button>
                        <button
                          onClick={() => handleDeleteCode(item.id)}
                          className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ✅ Pagination Controls */}
            <div className="flex justify-between items-center mt-4 text-sm">
              <p>
                Page {currentPage} of {totalPages}
              </p>
              <div className="space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className={`px-3 py-1 rounded ${
                    currentPage === 1
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Prev
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className={`px-3 py-1 rounded ${
                    currentPage === totalPages
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
