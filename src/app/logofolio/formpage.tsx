/* eslint-disable @next/next/no-img-element */

"use client";
import { useState } from "react";
import Link from "next/link";

export default function BrandIdentityBrief() {
   

  const [step, setStep] = useState(1);
  const [isGift, setIsGift] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    addressName: "",
    email: "",
    brandName: "",
    whatYouDo: "",
    audience: "",
    inspiration: "",
    competitors: "",
    stylePreferences: "",
    finalNotes: "",
    logoStyle: "",
    logoVibes: [] as string[],
    coloursLike: "",
coloursAvoid: "",
fontStyles: [] as string[],
admiredLogos: "",
topCompetitors: "",
uniqueEdge: "",
tagline: "",
usageLocations: "",
symbolsIdeas: "",
giftRecipientName: "",
giftRecipientEmail: "",
giftDeliveryOptions: [] as string[],




  });
  

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleToggleGift = () => {
    setIsGift(!isGift);
  };

  const handleSaveGiftSettings = () => {
    setIsGift(false); // Close the gift settings form
  };
  

  const handleNext = () => setStep((prev) => prev + 1);
  const handlePrev = () => setStep((prev) => prev - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
  
    try {
      const res = await fetch("/api/send-cds-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
  
      const result = await res.json();
      if (!result.success) {
        alert("Failed to send email. Please try again.");
        return;
      }
    } catch (err) {
      console.error("Email send error:", err);
    }
  
    setSubmitted(true);
  };
  

  if (submitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat text-black"
        style={{
          backgroundImage: `url('/images/Start.svg')`, // 🔁 Replace with your actual image path
        }}
      >
        <img
  src="/images/cds-logo.svg" // 🔁 Replace with your actual logo path
  alt="Logo"
  className="absolute top-4 left-4 w-20 h-auto z-50"
/>

        <div className="bg-white text-center p-6 rounded-2xl max-w-md w-full shadow-lg">
          <h2 className="text-xl font-bold mb-2">Thank You</h2>
          <p className="text-sm text-gray-700 mb-4">
            Thank you for taking the time to fill this brief. Every detail helps
            us create a logo that reflects your brand’s essence and speaks to
            your audience with clarity and impact. We can’t wait to bring your
            vision to life.
          </p>
          <Link href="/">
  <button className="bg-[#0C1C60] hover:bg-[#05266e] text-white px-6 py-2 rounded-md w-full">
    Return Home
  </button>
</Link>
        </div>
      </div>
    );
  }
  
  

  return (
    <div
    className="min-h-screen relative flex items-center justify-end bg-cover bg-no-repeat bg-center text-black"
    style={{
      backgroundImage: `url('/images/Start.svg')`, // 🔁 Replace with your actual image path
    }}
  >

<img
  src="/images/cds-logo.svg" // 🔁 Replace with your actual logo path
  alt="Logo"
  className="absolute top-4 left-4 w-20 h-auto z-50"
/>
  
  <div className="w-full max-w-2xl bg-white p-6 space-y-6 min-h-screen shadow-lg">

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold">
            CDS Space – Brand Identity Brief
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Thank you for trusting us to design your brand identity. Kindly
            fill this brief to guide our creativity.
          </p>
        </div>

       

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* STEP 1 */}
          {step === 1 && (
            <>
              <div>
              <div className="flex items-center justify-between">
  <h2 className="font-bold">Let’s Know You</h2>
  <span className="text-xs text-gray-500">{step}/5</span>
  <div className="flex items-center gap-2">
    <span className="text-sm font-semibold">Is this a gift?</span>
    <button
      type="button" // ✅ Important to prevent form submission
      onClick={handleToggleGift}
      className={`w-10 h-5 flex items-center bg-blue-500 rounded-full p-1 ${
        isGift ? "justify-end" : "justify-start"
      }`}
    >
      <span className="w-3 h-3 bg-white rounded-full" />
    </button>
  </div>
</div>

{/* ✅ This should come AFTER the header */}
{isGift && (
  <div className="mt-6 border p-6 rounded-xl bg-white shadow space-y-4 text-sm">
    <h2 className="font-bold flex items-center gap-2">
      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
        Gift Settings
      </span>
      <span className="ml-auto">
        <button
          onClick={handleToggleGift}
          className="w-10 h-5 flex items-center bg-blue-500 rounded-full p-1"
        >
          <span className="w-3 h-3 bg-white rounded-full" />
        </button>
      </span>
    </h2>

    <div>
      <label className="block mb-1">Enter Recipient Name</label>
      <input
        type="text"
        name="giftRecipientName"
        value={formData.giftRecipientName}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <div>
      <label className="block mb-1">
        Enter Recipient Email Address for Project Delivery
      </label>
      <input
        type="email"
        name="giftRecipientEmail"
        value={formData.giftRecipientEmail}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <div>
      <p className="font-semibold mb-2">
        How do you want your Gift to be Delivered
      </p>
      {["With your name", "Stay Anonymous", "Only Country"].map((option) => (
        <label key={option} className="flex items-center gap-2 mb-1">
          <input
            type="checkbox"
            name="giftDeliveryOptions"
            value={option}
            checked={formData.giftDeliveryOptions?.includes(option)}
            onChange={(e) => {
              const checked = e.target.checked;
              let updated = formData.giftDeliveryOptions || [];
              if (checked) {
                updated = [...updated, option];
              } else {
                updated = updated.filter((val) => val !== option);
              }
              setFormData({
                ...formData,
                giftDeliveryOptions: updated,
              });
            }}
          />
          {option}
        </label>
      ))}
    </div>

    <button
  type="button"
  onClick={handleSaveGiftSettings}
  className="w-full bg-[#0C1C60] text-white py-2 rounded hover:bg-[#05266e] font-semibold"
>
  Save Gift Settings
</button>

  </div>
)}

                <label className="block text-sm mb-1">
                  How would you love us to address you?
                </label>
                <input
                  type="text"
                  name="addressName"
                  value={formData.addressName}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Email Address for Project Delivery
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">
                  What’s your brand or company name as it should appear?
                </label>
                <input
                  type="text"
                  name="brandName"
                  value={formData.brandName}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">
                  In one line, what do you do?
                </label>
                <input
                  type="text"
                  name="whatYouDo"
                  value={formData.whatYouDo}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Who are your people? (Target audience – age, location,
                  profession)
                </label>
                <input
                  type="text"
                  name="audience"
                  value={formData.audience}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="w-full bg-[#0C1C60] text-white py-2 rounded"
              >
                Proceed
              </button>
            </>
          )}

         {/* STEP 2 */}
{step === 2 && (
  <>
  <div className="hidden md:block absolute top-1/2 left-1/4  -translate-x-1/4 w-1/2 -translate-y-1/2">
  <img
    src="/images/step2.svg"
    alt="Logo Style Illustration"
    className="w-[20rem] object-contain"
  />
</div>


    <h2 className="font-bold text-lg mb-2">Your Logo Vibe</h2>
    <p className="text-xs text-gray-500 mb-4">{step}/5</p>

    <div>
      <p className="text-sm font-medium mb-2">
        Which logo style feels right for you? (Pick one)
      </p>
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="logoStyle"
            value="Wordmark"
            checked={formData.logoStyle === "Wordmark"}
            onChange={handleChange}
          />
          Wordmark (just your name stylishly)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="logoStyle"
            value="Lettermark"
            checked={formData.logoStyle === "Lettermark"}
            onChange={handleChange}
          />
          Lettermark (your initials crafted)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="logoStyle"
            value="Icon/Symbol"
            checked={formData.logoStyle === "Icon/Symbol"}
            onChange={handleChange}
          />
          Icon/Symbol (a unique symbol)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="logoStyle"
            value="Combination Mark"
            checked={formData.logoStyle === "Combination Mark"}
            onChange={handleChange}
          />
          Combination Mark (name + symbol)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="logoStyle"
            value="Emblem"
            checked={formData.logoStyle === "Emblem"}
            onChange={handleChange}
          />
          Emblem (text within a shape)
        </label>
      </div>
    </div>

    <div className="mt-4">
      <p className="text-sm font-medium mb-2">
        What vibe should your logo carry? (Pick max 2)
      </p>
      <div className="space-y-2">
        {["Minimal", "Modern", "Classic", "Bold", "Elegant", "Fun"].map(
          (vibe) => (
            <label key={vibe} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="logoVibes"
                value={vibe}
                checked={formData.logoVibes?.includes(vibe)}
                onChange={(e) => {
                  let updated = formData.logoVibes || [];
                  if (e.target.checked) {
                    if (updated.length < 2) {
                      updated = [...updated, vibe];
                    }
                  } else {
                    updated = updated.filter((val) => val !== vibe);
                  }
                  setFormData({ ...formData, logoVibes: updated });
                }}
              />
              {vibe}
            </label>
          )
        )}
      </div>
    </div>

    <div className="flex justify-between mt-6">
      <button
        type="button"
        onClick={handlePrev}
        className="bg-gray-300 text-black px-4 py-2 rounded hover:bg-gray-400"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={handleNext}
        className="bg-[#0C1C60] text-white px-4 py-2 rounded"
      >
        Next
      </button>
    </div>
  </>
)}


         {/* STEP 3 */}
{step === 3 && (
  <>
<div className="hidden md:block absolute top-1/2 left-1/4  -translate-x-1/4 w-1/2 -translate-y-1/2">
  <img
    src="/images/step3.svg"
    alt="Logo Style Illustration"
    className="w-[20rem] object-contain"
  />
</div>





    <h2 className="font-bold text-lg mb-2">Colours & Fonts</h2>
    <p className="text-xs text-gray-500 mb-4">{step}/5</p>

    <div>
      <label className="block text-sm mb-1">
        Colours you’d love to see:
      </label>
      <input
        type="text"
        name="coloursLike"
        value={formData.coloursLike}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <div>
      <label className="block text-sm mb-1 mt-4">
        Colours you’d rather avoid:
      </label>
      <input
        type="text"
        name="coloursAvoid"
        value={formData.coloursAvoid}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <div className="mt-4">
      <p className="text-sm font-medium mb-2">
        Which font style feels more “you”?
      </p>
      <div className="space-y-2">
        {[
          "Serif (traditional, classy)",
          "Sans-serif (clean, modern)",
          "Script (handwritten, elegant)",
          "No preference",
        ].map((style) => (
          <label key={style} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="fontStyles"
              value={style}
              checked={formData.fontStyles?.includes(style)}
              onChange={(e) => {
                let updated = formData.fontStyles || [];
                if (e.target.checked) {
                  updated = [...updated, style];
                } else {
                  updated = updated.filter((val) => val !== style);
                }
                setFormData({ ...formData, fontStyles: updated });
              }}
            />
            {style}
          </label>
        ))}
      </div>
    </div>

    <div className="flex justify-between mt-6">
      <button
        type="button"
        onClick={handlePrev}
        className="bg-gray-300 text-black px-4 py-2 rounded hover:bg-gray-400"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={handleNext}
        className="bg-[#0C1C60] text-white px-4 py-2 rounded"
      >
        Next
      </button>
    </div>
  </>
)}


          {/* STEP 4 */}
{step === 4 && (
  <>
    <h2 className="font-bold text-lg mb-2">Inspirations & Uniqueness</h2>
    <p className="text-xs text-gray-500 mb-4">{step}/5</p>

    <div>
      <label className="block text-sm mb-1">
        Any logos you admire? (links or names)
      </label>
      <input
        type="text"
        name="admiredLogos"
        value={formData.admiredLogos}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <div className="mt-4">
      <label className="block text-sm mb-1">
        Who are your top competitors?
      </label>
      <input
        type="text"
        name="topCompetitors"
        value={formData.topCompetitors}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <div className="mt-4">
      <label className="block text-sm mb-1">
        What makes you stand out from them?
      </label>
      <input
        type="text"
        name="uniqueEdge"
        value={formData.uniqueEdge}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <div className="flex justify-between mt-6">
      <button
        type="button"
        onClick={handlePrev}
        className="bg-gray-300 text-black px-4 py-2 rounded hover:bg-gray-400"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={handleNext}
        className="bg-[#0C1C60] text-white px-4 py-2 rounded"
      >
        Next
      </button>
    </div>
  </>
)}


          {/* STEP 5 */}
{step === 5 && (
  <>
    <h2 className="font-bold text-lg mb-2">Final Touches</h2>
    <p className="text-xs text-gray-500 mb-4">{step}/5</p>

    <div>
      <label className="block text-sm mb-1">
        Do you have a tagline to include?
      </label>
      <input
        type="text"
        name="tagline"
        value={formData.tagline}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <div className="mt-4">
      <label className="block text-sm mb-1">
        Where will your logo mostly appear? (Website, Socials, Print,
        Merchandise, etc.)
      </label>
      <input
        type="text"
        name="usageLocations"
        value={formData.usageLocations}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <div className="mt-4">
      <label className="block text-sm mb-1">
        Any symbols, ideas, or meanings you want reflected?
      </label>
      <input
        type="text"
        name="symbolsIdeas"
        value={formData.symbolsIdeas}
        onChange={handleChange}
        className="w-full border rounded px-3 py-2"
      />
    </div>

    <button
      type="submit"
      className="w-full mt-6 bg-[#0C1C60] text-white py-2 rounded hover:bg-[#05266e]"
    >
      Submit
    </button>
  </>
)}

        </form>
      </div>
    </div>
  );
}
