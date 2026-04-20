"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export default function LetsBuildYourBrand() {
  const [openQuote, setOpenQuote] = useState(false);
  const [openConsult, setOpenConsult] = useState(false);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (openQuote || openConsult) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    // Cleanup function to restore scroll when component unmounts
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [openQuote, openConsult]);

  // Quote Form State
  const [quoteForm, setQuoteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    country: "",
    time: "",
    company: "",
    interest: "",
    description: "",
  });
  console.log("🚀 ~ LetsBuildYourBrand ~ quoteForm:", quoteForm)

  const handleQuoteChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setQuoteForm(prev => ({ ...prev, [name]: value }));
  };

const handleQuoteSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    const res = await fetch("/api/send-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quoteForm),
    });

    const data = await res.json();

    if (data.success) {
      alert("Quote request sent!");
      setOpenQuote(false);
      setQuoteForm({
        firstName: "",
        lastName: "",
        email: "",
        country: "",
        time: "",
        company: "",
        interest: "",
        description: "",
      });
    } else {
      alert("Failed to send form.");
    }
  } catch (err) {
    console.error("Error sending quote:", err);
    alert("Something went wrong.");
  }
};


  // Consult Form State
  const [consultForm, setConsultForm] = useState({
    projectName: "",
    email: "",
    country: "",
    phone: "",
    website: "",
    interest: "",
    description: "",
    firstName: "",
    lastName: "",
    contactEmail: "",
    contactPhone: "",
  });

  const handleConsultChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setConsultForm(prev => ({ ...prev, [name]: value }));
  };

 const handleConsultSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    const res = await fetch("/api/send-consult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(consultForm),
    });

    const data = await res.json();

    if (data.success) {
      alert("Consultation request sent!");
      setOpenConsult(false);
      setConsultForm({
        projectName: "",
        email: "",
        country: "",
        phone: "",
        website: "",
        interest: "",
        description: "",
        firstName: "",
        lastName: "",
        contactEmail: "",
        contactPhone: "",
      });
    } else {
      alert("Failed to send form.");
    }
  } catch (err) {
    console.error("Error sending form:", err);
    alert("Something went wrong.");
  }
};


  return (
    <>
      {/* MAIN SECTION */}
      <section className="bg-[#F7F9FC] py-28 px-5 md:px-16 w-full">
        <div className="flex flex-col max-w-7xl mx-auto md:flex-row items-center justify-between">
          {/* LEFT SIDE */}
          <div className="w-full md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left space-y-2">
            <h2 className="text-2xl md:text-4xl font-semibold text-[#0B0B0C] leading-none">
              Let’s build your{" "}
              <span className="text-[#2458E8] text-3xl md:text-5xl font-[MonotypeCorsivaRegular]">
                Brand
              </span>
            </h2>
            <p className="text-[#121212] text-sm md:text-xl mb-4 ">
              Your brand deserves more than just a logo or a website. It deserves
              a presence that inspires trust, tells your story, and drives results.{" "}
              <span className="text-[#2458E8] font-medium">
                At CDS Space, we operate 24/7
              </span>{" "}
              to build brands that don’t just look good, but feel right and perform
              even better. Let’s help you build that brand today!
            </p>

            <div className="flex w-full flex-col md:flex-row text-center justify-center md:justify-start gap-2 md:gap-4">
              {/* OPEN MODAL BUTTON */}
              <button
                onClick={() => setOpenQuote(true)}
                className="w-full md:w-auto px-2 py-4 md:px-6 md:py-4 bg-[#1C4ED1] hover:bg-[#304da7] text-white text-sm md:text-base font-medium rounded-full transition-all"
              >
                Request a Quote
              </button>

              <Link
                href="#"
                onClick={() => setOpenConsult(true)}
                className="w-full md:w-auto px-2 py-4 md:px-6 md:py-4 border border-[#1C4ED1] hover:bg-[#1C4ED1] hover:text-white 
                text-[#1C4ED1] text-sm md:text-base font-medium rounded-full transition-all"
              >
                Book a Consultation
              </Link>
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div className="flex justify-center mt-4 md:mt-0 items-end w-full md:w-1/2">
            <div className="relative z-10 ">
              <Image
                src="/images/laptop-brand.svg"
                alt="Brand Strategy"
                width={400}
                height={450}
                className="object-contain w-full md:w-auto h-full md:h-80"
              />
              <div className="absolute -bottom-10 right-0 md:-right-5 z-20 translate-x-1/4 translate-y-1/4 md:translate-x-1/3 md:translate-y-1/3">
                <Image
                  src="/images/arrow-icon.svg"
                  alt="Arrow Icon"
                  width={20}
                  height={20}
                  className="object-contain h-10 w-10 animate-bounce"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
 
      {/* QUOTE MODAL */}
      {openQuote && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm bg-opacity-60 flex justify-center items-center z-200 p-4 overflow-y-auto"
          onClick={() => setOpenQuote(false)}
        >
          <div 
            className="w-full max-w-2xl bg-[#0C0C1C] rounded-2xl p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpenQuote(false)}
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>

            <h2 className="text-3xl font-semibold text-center text-white mb-2">
              Consultation Form
            </h2>
            <p className="text-center text-base text-[#B3B3B3] mb-6">
              Connect with an expert about building your Brand
            </p>

            <form className="space-y-4" onSubmit={handleQuoteSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  name="firstName"
                  value={quoteForm.firstName}
                  onChange={handleQuoteChange}
                  placeholder="First name"
                  required
                  className="w-full px-4 py-3 rounded-lg border placeholder-[#05050D] border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] outline-none"
                />
                <input
                  type="text"
                  name="lastName"
                  value={quoteForm.lastName}
                  onChange={handleQuoteChange}
                  placeholder="Last name"
                  required
                  className="w-full px-4 py-3 placeholder-[#05050D]  rounded-md bg-[#EFF3FA] outline-none"
                />
              </div>

              <input
                type="email"
                name="email"
                value={quoteForm.email}
                onChange={handleQuoteChange}
                placeholder="Enter your email"
                required
                className="w-full px-4 py-3 rounded-lg border placeholder-[#05050D] border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] outline-none"
              />

              <input
                type="text"
                name="country"
                value={quoteForm.country}
                onChange={handleQuoteChange}
                placeholder="Country"
                required
                className="w-full px-4 py-3 placeholder-[#05050D] rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] outline-none"
              />

              <input
                type="text"
                name="time"
                value={quoteForm.time}
                onChange={handleQuoteChange}
                placeholder="Pick a suitable time (UTC +1)"
                required
                className="w-full px-4 py-3 placeholder-[#05050D] rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] outline-none"
              />

              <input
                type="text"
                name="company"
                value={quoteForm.company}
                onChange={handleQuoteChange}
                placeholder="Company / Project Name"
                required
                className="w-full px-4 py-3 placeholder-[#05050D] rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] outline-none"
              />

              <select
                name="interest"
                value={quoteForm.interest}
                onChange={handleQuoteChange}
                required
                className="w-full px-4 placeholder-[#05050D] py-3 rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] outline-none"
              >
                <option value="">Select an interest field</option>
                <option>Brand Strategy</option>
                <option>Product Design</option>
                <option>Event Branding</option>
                <option>3D Modelling</option>
                <option>Graphic Design</option>
                <option>Packaging</option>
              </select>

              <textarea
                name="description"
                value={quoteForm.description}
                onChange={handleQuoteChange}
                placeholder="Project Description"
                rows={4}
                required
                className="w-full px-4 py-3 placeholder-[#05050D] rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] outline-none"
              ></textarea>

              <button
                type="submit"
                className="w-full md:w-1/2 mx-auto block mt-2 py-3 bg-[#2458E8] text-white rounded-full hover:bg-[#1E47C5] transition-all"
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CONSULT MODAL */}
      {openConsult && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-start overflow-y-auto py-10 z-200 px-4"
          onClick={() => setOpenConsult(false)}
        >
          <div 
            className="w-full max-w-2xl bg-[#0C0C1C] rounded-2xl p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              
              onClick={() => setOpenConsult(false)}
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-200 text-2xl"
            >
              ×
            </button>

            <h2 className="text-3xl font-semibold text-white text-center mb-1">
              Request a Quote
            </h2>

            <p className="text-center text-gray-400 text-sm md:text-base mb-10">
              Please fill out the form with accurate information.
            </p>

            <h3 className="text-white font-medium mb-3 text-sm  md:text-base tracking-wide">
              Project Information
            </h3>

            <form className="space-y-5" onSubmit={handleConsultSubmit}>
              <input
                name="projectName"
                value={consultForm.projectName}
                onChange={handleConsultChange}
                required
                className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D]"
                placeholder="Company / Project Name"
              />

              <input
                name="email"
                value={consultForm.email}
                onChange={handleConsultChange}
                required
                className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D]"
                placeholder="Enter your email"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  name="country"
                  value={consultForm.country}
                  onChange={handleConsultChange}
                  required
                  className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D]"
                  placeholder="Country"
                />
                <input
                  name="phone"
                  value={consultForm.phone}
                  onChange={handleConsultChange}
                  required
                  className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D]"
                  placeholder="Phone Number"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  name="website"
                  value={consultForm.website}
                  onChange={handleConsultChange}
                  className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D]"
                  placeholder="Website (if any available)"
                />
                <select
                  name="interest"
                  value={consultForm.interest}
                  onChange={handleConsultChange}
                  required
                  className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D]"
                >
                  <option value="">Select an interest field</option>
                  <option>Graphic Design</option>
                  <option>Product Design</option>
                  <option>3D Modelling AR / VR</option>
                  <option>Brand Development</option>
                  <option>Brand Communication</option>
                  <option>Brand Launching</option>
                  <option>Merch Printing</option>
                  <option>Packaging</option>
                </select>
              </div>

              <textarea
                name="description"
                value={consultForm.description}
                onChange={handleConsultChange}
                placeholder="Project Description"
                rows={6}
                required
                className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D] resize-y"
              />

              <h3 className="text-white font-medium mt-8 text-sm tracking-wide">
                Contact
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  name="firstName"
                  value={consultForm.firstName}
                  onChange={handleConsultChange}
                  required
                  className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5  placeholder:text-[#05050D]"
                  placeholder="First name"
                />
                <input
                  name="lastName"
                  value={consultForm.lastName}
                  onChange={handleConsultChange}
                  required
                  className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D]"
                  placeholder="Last name"
                />
              </div>

              <input
                name="contactEmail"
                value={consultForm.contactEmail}
                onChange={handleConsultChange}
                required
                className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D]"
                placeholder="Enter your email"
              />

              <input
                name="contactPhone"
                value={consultForm.contactPhone}
                onChange={handleConsultChange}
                required
                className="w-full rounded-lg border border-[#292929] bg-linear-to-r from-white to-[#DFEAF8] text-[#0B0B0C] px-3 py-3.5 placeholder:text-[#05050D]"
                placeholder="Phone Number"
              />

              <button
                type="submit"
                className="w-40 mx-auto block py-3 mt-4 bg-[#2458E8] rounded-full text-white hover:bg-[#1E47C5] transition-all text-sm"
              >
                Submit
              </button>
            </form>

            <p className="text-center text-[#B3B3B3] text-[11px] mt-6 leading-relaxed">
              <span className="text-[#B3B3B3] mb-2">Your Data. Reviewed by the Right</span>  Teams. <br />
              CDS Labs is monitored by several different teams. The data you submit
              on this form will be shared with one or more relevant teams.
            </p>
          </div>
        </div>
      )}
    </>
  );
}