/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import Navbar from '@/components/navbar';
import { useState } from 'react';

/* ===================== Shared UI ===================== */

const INPUT_CLASS =
  'w-full rounded-[6px] border border-[#E1E6EB] bg-white px-3 py-2 text-[13px] text-black outline-none focus:ring-2 focus:ring-[#0B5FFF]/20';

const BTN_PRIMARY =
  'inline-flex items-center justify-center rounded-md bg-[#0B1F6A] px-6 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 transition';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full grid grid-cols-1 md:grid-cols-[600px_1fr]">
      <aside
        className="hidden md:block relative"
        style={{
          backgroundImage: "url('/images/Start.svg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <img src="/images/cds-logo.svg" alt="Logo" className="absolute top-8 left-8 w-[80px] h-auto z-50" />
      </aside>
      <main className="bg-white">
        <div className="max-w-[580px] mx-auto px-6 py-10">{children}</div>
      </main>
    </div>
  );
}

function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11.5px] font-medium text-[#3A3A3A]">{label}</label>
      {children}
    </div>
  );
}

const ROLES = [
  'Creative Designer',
  'UI/UX Designer',
  'Customer Relations Personnel',
  'Office Cleaner',
  'Print Production Assistant',
  'Administrative Assistant',
];

function SelectRole({
  value,
  onChange,
  open,
  setOpen,
  roles = ROLES,
}: {
  value: string;
  onChange: (r: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  roles?: string[];
}) {
  return (
    <div
      className="mt-1 overflow-hidden rounded-[10px] border"
      style={{ borderColor: '#B9C3CF', background: '#EFF4F8', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)' }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-[13px] font-medium text-black"
        style={{ background: 'linear-gradient(180deg, #F7FAFD 0%, #E7EDF3 100%)' }}
      >
        <span className="truncate">{value}</span>
        <svg className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
        </svg>
      </button>

      {open && (
        <div className="pb-1">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
              className="block w-full text-left px-5 py-3.5 text-[13px]"
              style={{
                color: '#000',
                background: 'linear-gradient(180deg, #F2F5F8 0%, #DEE4EA 100%)',
                borderTop: '1px solid #B9C3CF',
                fontWeight: r === value ? 600 : 500,
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================== Page ===================== */

type Stage =
  | 'intro'
  | 'bio'
  | 'mindset'
  | 'stay'
  | 'spirit'
  | 'trusted'
  | 'location'
  | 'rolefit'
  | 'thankyou'; // 👈 NEW

const ROLEFIT_SPEC: Record<string, { qs: [string, string, string]; wantsPortfolio?: boolean }> = {
  'Creative Designer': {
    qs: [
      'What design software are you most comfortable using and why?',
      'Share a design project you’re proud of and what made it unique.',
      'What makes a design truly “creative” in your opinion?',
    ],
    wantsPortfolio: true,
  },
  'UI/UX Designer': {
    qs: [
      'What is the difference between UI and UX?',
      'How do you approach user research before starting a new design?',
      'What’s one app or website you think has poor UX, and how would you improve it?',
    ],
    wantsPortfolio: true,
  },
  'Customer Relations Personnel': {
    qs: [
      'How would you handle an unhappy client who says we didn’t meet their expectations?',
      'What does excellent customer service mean to you?',
      'Have you used any CRM tool before? If yes, which?',
    ],
  },
  'Office Cleaner': {
    qs: [
      'What do you think makes a workspace clean and welcoming?',
      'How do you organize your cleaning routine for daily office upkeep?',
      'Are you comfortable working early mornings or after work hours?',
    ],
  },
  'Print Production Assistant': {
    qs: [
      'Have you worked with any print machines or finishing tools before?',
      'How do you ensure accuracy and quality before final print production?',
      'What steps would you take if a client’s print job has an error post-production?',
    ],
  },
  'Administrative Assistant': {
    qs: [
      'Are you familiar with tools like Microsoft Excel or Google Sheets?',
      'What do you consider most important when handling internal staff communication?',
      'How do you prioritize tasks when managing multiple administrative duties?',
    ],
  },
};

export default function CareerFormPage() {
  const [stage, setStage] = useState<Stage>('intro');

  // Intro
  const [legalName, setLegalName] = useState('');
  const [roleOpen, setRoleOpen] = useState(true);
  const [role, setRole] = useState(ROLES[0]);

  // Step states …
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState('');
  const [nationality, setNationality] = useState('');
  const [stateOfOrigin, setStateOfOrigin] = useState('');
  const [lga, setLga] = useState('');
  const [education, setEducation] = useState('');
  const [teamDescribe, setTeamDescribe] = useState('');
  const [coreValue, setCoreValue] = useState('');
  const [whyLongTerm, setWhyLongTerm] = useState('');
  const [twoYearPlan, setTwoYearPlan] = useState('');
  const [prayerWillingness, setPrayerWillingness] = useState('');
  const [religionView, setReligionView] = useState('');
  const [famName, setFamName] = useState('');
  const [famPhone, setFamPhone] = useState('');
  const [famRelation, setFamRelation] = useState('');
  const [nonName, setNonName] = useState('');
  const [nonPhone, setNonPhone] = useState('');
  const [nonRelation, setNonRelation] = useState('');
  const [nonOccupation, setNonOccupation] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [commuteMins, setCommuteMins] = useState('');
  const [transportCost, setTransportCost] = useState('');
  const [rf1, setRf1] = useState('');
  const [rf2, setRf2] = useState('');
  const [rf3, setRf3] = useState('');
  const [portfolioLink, setPortfolioLink] = useState('');
  const [portfolioFile, setPortfolioFile] = useState<File | null>(null);

  // submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // === FINAL SUBMIT (wired to last step) ===
  async function handleFinalSubmit() {
  const payload = {
    // Intro
    legal_name: legalName,
    role,

    // Bio
    email,
    date_of_birth: dob,
    sex,
    nationality,
    state_of_origin: stateOfOrigin,
    local_government_area: lga,
    education_level: education,

    // Mindset
    team_description: teamDescribe,
    core_value: coreValue,

    // Stay
    reason_for_long_term: whyLongTerm,
    two_year_plan: twoYearPlan,

    // Spirit
    prayer_willingness: prayerWillingness,
    religion_view: religionView,

    // Trusted Circle - Family Contact
    family_name: famName,
    family_phone: famPhone,
    family_relationship: famRelation,

    // Trusted Circle - Non-family Contact
    non_family_name: nonName,
    non_family_phone: nonPhone,
    non_family_relationship: nonRelation,
    non_family_occupation: nonOccupation,

    // Location
    home_address: homeAddress,
    commute_minutes: commuteMins,
    transport_cost: transportCost,

    // Role Fit
    role_fit_question_1: rf1,
    role_fit_question_2: rf2,
    role_fit_question_3: rf3,
    portfolio_link: portfolioLink,
    // portfolio_file: portfolioFile ? portfolioFile.name : null,
  };

  try {
    setSubmitting(true);
    setSubmitError(null);

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Request failed with ${res.status}`);
    }

    setStage('thankyou');
  } catch (err: any) {
    setSubmitError(err?.message ?? 'Submission failed');
  } finally {
    setSubmitting(false);
  }
}


  /* ---------- Intro (0/8) ---------- */
  if (stage === 'intro') {
    return (
      <div
        className="min-h-screen w-full relative"
        style={{ backgroundImage: "url('/images/Start.svg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <Navbar />

        <main className="h-full mx-auto max-w-[1200px] px-4 pt-56 pb-20">
          <div className="flex items-center justify-center h-full">
            <form
              className="w-[420px] rounded-md bg-white/95 shadow-[0_6px_24px_rgba(0,0,0,0.25)] p-4"
              onSubmit={(e) => {
                e.preventDefault();
                setStage('bio');
              }}
            >
              <div className="text-[18px] leading-tight text-[#1c1c1c] font-bold">
                <div>Start your Journey to becoming</div>
                <div className="-mt-[1px]">a CDS Space Team Member</div>
              </div>

              <label className="mt-4 block text-[12px] text-[#122033] font-medium">Enter your Legal Name (E.g Mike Hugo Sam)</label>
              <input required value={legalName} onChange={(e) => setLegalName(e.target.value)} className={INPUT_CLASS} />

              <label className="mt-3 block text-[12px] text-[#122033] font-medium">Select Interested Role</label>
              <SelectRole value={role} onChange={setRole} open={roleOpen} setOpen={setRoleOpen} />

              <button type="submit" className={`${BTN_PRIMARY} w-full mt-4`}>Let’s Get Started</button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  /* ---------- Bio (1/8) ---------- */
  if (stage === 'bio') {
    return (
      <Shell>
        <div className="space-y-1">
          <div className="text-[14px] font-semibold text-[#0F1A2A]">BioFrame</div>
          <p className="text-[12px] leading-5 text-[#7A8699]">This section gathers your basic information - we want to know the person behind the profile.</p>
        </div>
        <div className="mt-8 mb-5 flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-[#0F1A2A]">Tell us who you are</h2>
          <span className="inline-flex items-center justify-center rounded-full border border-[#E1E6EB] bg-[#F8FAFC] px-2 py-[2px] text-[11px] text-[#4B5563]">1/8</span>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setStage('mindset');
          }}
        >
          <LabeledInput label="Email Address">
            <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS} required />
          </LabeledInput>

          <LabeledInput label="Date of Birth"><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="Sex"><input value={sex} onChange={(e) => setSex(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="Nationality"><input value={nationality} onChange={(e) => setNationality(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="State of Origin"><input value={stateOfOrigin} onChange={(e) => setStateOfOrigin(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="Local Government Area (LGA)"><input value={lga} onChange={(e) => setLga(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="Educational Qualification (SSCE, Diploma, OND, HND, BSc, MSc, etc)"><input value={education} onChange={(e) => setEducation(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>

          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={() => setStage('intro')} className={BTN_PRIMARY}>Previous</button>
            <button type="submit" className={BTN_PRIMARY}>Next</button>
          </div>
        </form>
      </Shell>
    );
  }

  /* ---------- Mindset (2/8) ---------- */
  if (stage === 'mindset') {
    return (
      <Shell>
        <div className="space-y-1">
          <div className="text-[14px] font-semibold text-[#0F1A2A]">Mindset Mirror</div>
          <p className="text-[12px] leading-5 text-[#7A8699]">We want to know how you perceive yourself and what values drive your decision-making.</p>
        </div>
        <div className="mt-8 mb-5 flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-[#0F1A2A]">How you think. Who you are</h2>
          <span className="inline-flex items-center justify-center rounded-full border bg-[#F8FAFC] px-2 py-[2px] text-[11px] text-[#4B5563]">2/8</span>
        </div>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setStage('stay'); }}>
          <LabeledInput label="In your own words, how would your previous team describe you?">
            <textarea value={teamDescribe} onChange={(e) => setTeamDescribe(e.target.value)} className={`${INPUT_CLASS} min-h-[120px] resize-none`} required />
          </LabeledInput>
          <LabeledInput label="What personal value do you never compromise on - even at work?">
            <textarea value={coreValue} onChange={(e) => setCoreValue(e.target.value)} className={`${INPUT_CLASS} min-h-[120px] resize-none`} required />
          </LabeledInput>

          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={() => setStage('bio')} className={BTN_PRIMARY}>Previous</button>
            <button type="submit" className={BTN_PRIMARY}>Next</button>
          </div>
        </form>
      </Shell>
    );
  }

  /* ---------- Stay (3/8) ---------- */
  if (stage === 'stay') {
    return (
      <Shell>
        <div className="space-y-1">
          <div className="text-[14px] font-semibold text-[#0F1A2A]">Stay Power</div>
          <p className="text-[12px] leading-5 text-[#7A8699]">We’re looking for committed minds, not placeholders. Tell us where your compass points.</p>
        </div>
        <div className="mt-8 mb-5 flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-[#0F1A2A]">Are you building with us or just visiting?</h2>
          <span className="inline-flex items-center justify-center rounded-full border bg-[#F8FAFC] px-2 py-[2px] text-[11px] text-[#4B5563]">3/8</span>
        </div>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setStage('spirit'); }}>
          <LabeledInput label="Why do you want to work with CDS Space long-term?">
            <textarea value={whyLongTerm} onChange={(e) => setWhyLongTerm(e.target.value)} className={`${INPUT_CLASS} min-h-[120px] resize-none`} required />
          </LabeledInput>
          <LabeledInput label="Where do you see yourself in the next 2 years, and how does this role fit in?">
            <textarea value={twoYearPlan} onChange={(e) => setTwoYearPlan(e.target.value)} className={`${INPUT_CLASS} min-h-[120px] resize-none`} required />
          </LabeledInput>

          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={() => setStage('mindset')} className={BTN_PRIMARY}>Previous</button>
            <button type="submit" className={BTN_PRIMARY}>Next</button>
          </div>
        </form>
      </Shell>
    );
  }

  /* ---------- Spirit (4/8) ---------- */
  if (stage === 'spirit') {
    return (
      <Shell>
        <div className="space-y-1">
          <div className="text-[14px] font-semibold text-[#0F1A2A]">Spirit Sync</div>
          <p className="text-[12px] leading-5 text-[#7A8699]">We value unity and shared energy. Let us know where you stand.</p>
        </div>
        <div className="mt-8 mb-5 flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-[#0F1A2A]">Faith. Culture. Alignment.</h2>
          <span className="inline-flex items-center justify-center rounded-full border bg-[#F8FAFC] px-2 py-[2px] text-[11px] text-[#4B5563]">4/8</span>
        </div>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setStage('trusted'); }}>
          <LabeledInput label="Are you open to joining our daily 10–15 mins corporate team prayer each morning before work starts? (Yes/No)">
            <input value={prayerWillingness} onChange={(e) => setPrayerWillingness(e.target.value)} className={INPUT_CLASS} required />
          </LabeledInput>
          <LabeledInput label="What is your religion and your personal view on incorporating prayer into work culture?">
            <textarea value={religionView} onChange={(e) => setReligionView(e.target.value)} className={`${INPUT_CLASS} min-h-[120px] resize-none`} required />
          </LabeledInput>

          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={() => setStage('stay')} className={BTN_PRIMARY}>Previous</button>
            <button type="submit" className={BTN_PRIMARY}>Next</button>
          </div>
        </form>
      </Shell>
    );
  }

  /* ---------- Trusted (5/8) ---------- */
  if (stage === 'trusted') {
    return (
      <Shell>
        <div className="space-y-1">
          <div className="text-[14px] font-semibold text-[#0F1A2A]">Trusted Circle</div>
          <p className="text-[12px] leading-5 text-[#7A8699]">Every great hire comes with strong backing. Tell us who vouches for your character.</p>
        </div>
        <div className="mt-8 mb-5 flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-[#0F1A2A]">Who speaks for you?</h2>
          <span className="inline-flex items-center justify-center rounded-full border bg-[#F8FAFC] px-2 py-[2px] text-[11px] text-[#4B5563]">5/8</span>
        </div>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setStage('location'); }}>
          <div className="mb-2 text-[11.5px] font-semibold text-[#0F1A2A]">Family Guarantor</div>
          <LabeledInput label="Name"><input value={famName} onChange={(e) => setFamName(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="Phone Number"><input value={famPhone} onChange={(e) => setFamPhone(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="Relationship"><input value={famRelation} onChange={(e) => setFamRelation(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>

          <div className="pt-2 text-[11.5px] font-semibold text-[#0F1A2A]">Non-Family Guarantor</div>
          <LabeledInput label="Name"><input value={nonName} onChange={(e) => setNonName(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="Phone Number"><input value={nonPhone} onChange={(e) => setNonPhone(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="Relationship"><input value={nonRelation} onChange={(e) => setNonRelation(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="Occupation"><input value={nonOccupation} onChange={(e) => setNonOccupation(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>

          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={() => setStage('spirit')} className={BTN_PRIMARY}>Previous</button>
            <button type="submit" className={BTN_PRIMARY}>Next</button>
          </div>
        </form>
      </Shell>
    );
  }

  /* ---------- Location (6/8) ---------- */
  if (stage === 'location') {
    return (
      <Shell>
        <div className="space-y-1">
          <div className="text-[14px] font-semibold text-[#0F1A2A]">Location Log</div>
          <p className="text-[12px] leading-5 text-[#7A8699]">We’d love to understand your proximity to our workspaces and how you move.</p>
        </div>
        <div className="mt-8 mb-5 flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-[#0F1A2A]">Where do you operate from?</h2>
          <span className="inline-flex items-center justify-center rounded-full border bg-[#F8FAFC] px-2 py-[2px] text-[11px] text-[#4B5563]">6/8</span>
        </div>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setStage('rolefit'); }}>
          <LabeledInput label="Full House Address"><input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="How long is your daily commute to the office (in minutes)?"><input inputMode="numeric" value={commuteMins} onChange={(e) => setCommuteMins(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>
          <LabeledInput label="What is your estimated cost for daily transportation"><input value={transportCost} onChange={(e) => setTransportCost(e.target.value)} className={INPUT_CLASS} required /></LabeledInput>

          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={() => setStage('trusted')} className={BTN_PRIMARY}>Previous</button>
            <button type="submit" className={BTN_PRIMARY}>Next</button>
          </div>
        </form>
      </Shell>
    );
  }

  /* ---------- Rolefit (7/8) ---------- */
  if (stage === 'rolefit') {
    const spec = ROLEFIT_SPEC[role] ?? ROLEFIT_SPEC['Administrative Assistant'];

    return (
      <Shell>
        <div className="space-y-1">
          <div className="text-[14px] font-semibold text-[#0F1A2A]">Rolefit Check</div>
          <p className="text-[12px] leading-5 text-[#7A8699]">
            We tailor this section to <span className="font-semibold">{role}</span>. Share short, clear answers (3–6 lines each).
          </p>
        </div>
        <div className="mt-8 mb-5 flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-[#0F1A2A]">Your fit for the role</h2>
          <span className="inline-flex items-center justify-center rounded-full border bg-[#F8FAFC] px-2 py-[2px] text-[11px] text-[#4B5563]">7/8</span>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await handleFinalSubmit();
          }}
        >
          <LabeledInput label={spec.qs[0]}>
            <textarea value={rf1} onChange={(e) => setRf1(e.target.value)} className={`${INPUT_CLASS} min-h-[120px] resize-none`} required />
          </LabeledInput>
          <LabeledInput label={spec.qs[1]}>
            <textarea value={rf2} onChange={(e) => setRf2(e.target.value)} className={`${INPUT_CLASS} min-h-[120px] resize-none`} required />
          </LabeledInput>
          <LabeledInput label={spec.qs[2]}>
            <textarea value={rf3} onChange={(e) => setRf3(e.target.value)} className={`${INPUT_CLASS} min-h-[120px] resize-none`} required />
          </LabeledInput>

          {spec.wantsPortfolio && (
            <>
              <LabeledInput label="Portfolio link (URL)">
                <input type="url" placeholder="https://…" value={portfolioLink} onChange={(e) => setPortfolioLink(e.target.value)} className={INPUT_CLASS} required />
              </LabeledInput>
              <LabeledInput label="Or upload a portfolio file (optional)">
                <input type="file" onChange={(e) => setPortfolioFile(e.target.files?.[0] ?? null)} className="block w-full text-[12px]" accept=".pdf,.png,.jpg,.jpeg,.zip,.fig" required />
              </LabeledInput>
            </>
          )}

          {submitError && (
            <p className="text-[12px] text-red-600">{submitError}</p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={() => setStage('location')} className={BTN_PRIMARY} disabled={submitting}>
              Previous
            </button>
            <button
              type="submit"
              className={BTN_PRIMARY}
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </form>
      </Shell>
    );
  }

  /* ---------- Thank You (8/8) ---------- */
  return (
    <div
      className="min-h-screen w-full relative"
      style={{ backgroundImage: "url('/images/Start.svg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* logo (matches screenshot) */}
      <img src="/images/cds-logo.svg" alt="Logo" className="absolute top-6 left-6 w-[80px] h-auto" />

      <div className="min-h-screen flex items-center justify-center px-4 py-16">
        <div className="w-[420px] rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] p-5 text-center">
          <h1 className="text-[15px] font-semibold text-[#0F1A2A]">Thank You</h1>
          <p className="mt-2 text-[12px] leading-5 text-[#5A6573]">
            Thanks for shooting your shot with CDS Space. We’ve received your application 
            and will reach out if you’re shortlisted. Keep creating greatness.
             </p>

          <button
            onClick={() => setStage('intro')}
            className="mt-4 w-full rounded-md bg-[#0B1F6A] py-2 text-[12.5px] font-semibold text-white hover:opacity-90 transition"
          >
            Return Home
          </button>
        </div>
      </div>
    </div>
  );
}
