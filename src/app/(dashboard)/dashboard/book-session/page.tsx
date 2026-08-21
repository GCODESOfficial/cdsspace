"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, CheckCircle2, Loader2 } from "lucide-react";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";
import { supabase } from "@/lib/supabase";

export default function BookSessionPage() {
  const router = useRouter();
  const { account, dashboardPath } = useClientAccount();
  const [fullName, setFullName] = useState(account.fullName || account.email.split("@")[0] || "");
  const [email, setEmail] = useState(account.email);
  const [phone, setPhone] = useState(account.phoneNumber || "");
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30 min");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const returnToPreviousPage = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(dashboardPath());
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fullName.trim() || !email.trim() || !topic.trim() || !date) return;

    setSubmitting(true);
    setErrorMessage(null);
    // The browser query bridge binds user_id to the authenticated first-party
    // client session, even if a stale value is supplied by the browser.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("booking_sessions").insert({
      user_id: account.userId,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      topic: topic.trim(),
      preferred_date: date,
      preferred_time: time || null,
      duration,
      notes: notes.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      setErrorMessage(error.message || "Your session request could not be submitted. Please try again.");
      return;
    }

    try {
      window.localStorage.removeItem(`cds.dashboard.autosave.v1:client:${window.location.pathname}`);
    } catch {
      // Browser storage can be unavailable; the submitted booking is already saved.
    }
    setSubmitted(true);
  }

  return (
    <div className="mx-auto w-full max-w-5xl pb-12">
      <button
        type="button"
        onClick={returnToPreviousPage}
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-stroke/40 bg-white px-4 text-[13px] font-semibold text-brand-navy shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0A4FE8]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to previous page
      </button>

      <section className="overflow-hidden rounded-2xl border border-brand-stroke/30 bg-white shadow-[0_14px_44px_rgba(15,40,90,0.08)]">
        <header className="border-b border-brand-stroke/20 px-5 py-5 sm:px-7 lg:px-9">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]">
              <Calendar className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-brand-navy sm:text-[28px]">Book a session</h1>
              <p className="mt-1 text-[13px] leading-6 text-brand-body/65">
                Tell us what you would like to discuss and choose your preferred date and time.
              </p>
            </div>
          </div>
        </header>

        {submitted ? (
          <div className="px-5 py-14 text-center sm:px-8">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-brand-navy">Session requested</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-brand-body/65">
              We received your request and will confirm the session details by email shortly.
            </p>
            <button
              type="button"
              onClick={returnToPreviousPage}
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white transition hover:bg-[#083FC0]"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to previous page
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
            <div className="grid gap-5 md:grid-cols-2">
              <SessionInput name="booking_full_name" label="Full name" required value={fullName} onChange={setFullName} autoComplete="name" />
              <SessionInput name="booking_email" label="Email" required value={email} onChange={setEmail} type="email" autoComplete="email" />
              <SessionInput name="booking_phone" label="Phone" value={phone} onChange={setPhone} type="tel" autoComplete="tel" />
              <div>
                <label htmlFor="booking_duration" className="mb-2 block text-[13px] font-medium text-brand-body">Duration</label>
                <select
                  id="booking_duration"
                  name="booking_duration"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-brand-stroke/50 bg-white px-4 text-sm text-brand-navy outline-none transition focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100"
                >
                  <option>15 min</option>
                  <option>30 min</option>
                  <option>60 min</option>
                </select>
              </div>
            </div>

            <SessionInput name="booking_topic" label="Topic" required value={topic} onChange={setTopic} placeholder="What do you want to discuss?" />

            <div className="grid gap-5 md:grid-cols-2">
              <SessionInput name="booking_date" label="Preferred date" required value={date} onChange={setDate} type="date" min={new Date().toISOString().slice(0, 10)} />
              <SessionInput name="booking_time" label="Preferred time" value={time} onChange={setTime} type="time" />
            </div>

            <div>
              <label htmlFor="booking_notes" className="mb-2 block text-[13px] font-medium text-brand-body">Notes</label>
              <textarea
                id="booking_notes"
                name="booking_notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={5}
                placeholder="Add any context that will help us prepare."
                className="w-full resize-y rounded-xl border border-brand-stroke/50 bg-white px-4 py-3 text-sm text-brand-navy outline-none transition placeholder:text-brand-mute focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100"
              />
            </div>

            {errorMessage && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] leading-5 text-rose-700" role="alert">
                {errorMessage}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-brand-stroke/20 pt-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={returnToPreviousPage}
                className="min-h-12 rounded-xl border border-brand-stroke/50 bg-white px-5 text-sm font-semibold text-brand-navy transition hover:bg-brand-bg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !fullName.trim() || !email.trim() || !topic.trim() || !date}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-6 text-sm font-semibold text-white transition hover:bg-[#083FC0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                {submitting ? "Submitting request…" : "Book session"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function SessionInput({
  name,
  label,
  value,
  onChange,
  required = false,
  placeholder,
  type = "text",
  autoComplete,
  min,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  min?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-[13px] font-medium text-brand-body">
        {label}{required ? " *" : ""}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        className="min-h-12 w-full rounded-xl border border-brand-stroke/50 bg-white px-4 text-sm text-brand-navy outline-none transition placeholder:text-brand-mute focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100"
      />
    </div>
  );
}
