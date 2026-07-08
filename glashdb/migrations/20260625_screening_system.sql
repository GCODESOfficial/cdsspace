-- CDS Space: Applicant Screening Portal (/screening)
-- ---------------------------------------------------------------------------
-- Shortlisted career applicants log in at /screening with their email + the
-- CDS-XXXXXX tracking code they received when applying. They then see their
-- role, scheduled screening date, location, and what to bring, and on the day
-- they sit three assessments:
--   1. Objective test  - auto-graded on this portal (10 Qs / 10 mins, 60s each)
--   2. Practical test   - rated by an admin from the admin dashboard
--   3. Interview / Oral - rated by an admin from the admin dashboard
--
-- Migrations here are MANUAL (no runner) - apply this SQL by hand against
-- GlashDB. Everything is idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ---------------------------------------------------------------------------

-- ── 1. Objective question bank (per role) ──────────────────────────────────
-- Each open role carries up to 10 multiple-choice questions. Correct answers
-- live ONLY here and are never sent to the applicant's browser.
create table if not exists public.screening_questions (
  id          uuid primary key default gen_random_uuid(),
  role_id     uuid not null references public.open_roles(id) on delete cascade,
  position    int  not null,                       -- 1..10, ordering within the role
  prompt      text not null,
  options     text[] not null default '{}',        -- answer choices (2-6)
  correct_index int not null default 0,            -- 0-based index into options
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists screening_questions_role_position_idx
  on public.screening_questions (role_id, position);

-- ── 2. Screening candidates (one per shortlisted application) ───────────────
create table if not exists public.screening_candidates (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null unique references public.role_applications(id) on delete cascade,
  role_id         uuid references public.open_roles(id) on delete set null,
  email           text not null,                   -- denormalised, lower-cased
  full_name       text not null,

  -- Logistics the admin sets for the screening day
  scheduled_at    timestamptz,
  location        text,
  bring_items     text,                            -- "what to come with"
  instructions    text,                            -- extra notes from admin

  -- Objective test state
  objective_status   text not null default 'not_started'
    check (objective_status in ('not_started','in_progress','submitted','terminated')),
  objective_score    int,
  objective_total    int,
  objective_started_at   timestamptz,
  objective_deadline     timestamptz,              -- started_at + 10 minutes
  objective_submitted_at timestamptz,
  termination_reason text,
  warning_count      int not null default 0,       -- anti-cheat: 1 warning, then terminate

  -- Practical test (admin-rated)
  practical_status   text not null default 'pending'
    check (practical_status in ('pending','rated')),
  practical_score    int,                          -- 0..100
  practical_feedback text,

  -- Interview / oral (admin-rated)
  interview_status   text not null default 'pending'
    check (interview_status in ('pending','rated')),
  interview_score    int,                          -- 0..100
  interview_feedback text,

  -- Overall outcome
  decision        text not null default 'in_progress'
    check (decision in ('in_progress','passed','failed')),

  -- Portal session (email + tracking code login issues a token cookie)
  session_token      text,
  session_expires_at timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists screening_candidates_email_idx
  on public.screening_candidates (lower(email));
create index if not exists screening_candidates_session_idx
  on public.screening_candidates (session_token);
create index if not exists screening_candidates_role_idx
  on public.screening_candidates (role_id);

-- ── 3. Objective answers (one row per question per candidate) ───────────────
create table if not exists public.screening_answers (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.screening_candidates(id) on delete cascade,
  question_id   uuid not null references public.screening_questions(id) on delete cascade,
  selected_index int,                              -- null = unanswered / timed out
  is_correct    boolean not null default false,
  answered_at   timestamptz not null default now(),
  unique (candidate_id, question_id)
);

-- ── 4. Activity / anti-cheat event log ─────────────────────────────────────
create table if not exists public.screening_events (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.screening_candidates(id) on delete cascade,
  kind          text not null,                     -- started | answered | tab_blur |
                                                   -- visibility_hidden | fullscreen_exit |
                                                   -- warning | terminated | submitted
  detail        text,
  question_position int,
  created_at    timestamptz not null default now()
);

create index if not exists screening_events_candidate_idx
  on public.screening_events (candidate_id, created_at);

-- ── 5. Keep updated_at fresh ────────────────────────────────────────────────
create or replace function public.screening_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists screening_candidates_touch on public.screening_candidates;
create trigger screening_candidates_touch
  before update on public.screening_candidates
  for each row execute function public.screening_touch_updated_at();

drop trigger if exists screening_questions_touch on public.screening_questions;
create trigger screening_questions_touch
  before update on public.screening_questions
  for each row execute function public.screening_touch_updated_at();
