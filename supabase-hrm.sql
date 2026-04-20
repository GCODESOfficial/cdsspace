-- ============================================
-- CDS Space: HRM (Open Roles + Certification)
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Open roles
CREATE TABLE IF NOT EXISTS public.open_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('full-time', 'part-time', 'contract', 'intern', 'freelance')),
  location TEXT,
  description TEXT NOT NULL,
  requirements TEXT NOT NULL,
  perks TEXT,
  application_link TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.open_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on open_roles" ON public.open_roles;
CREATE POLICY "Allow public read on open_roles"
  ON public.open_roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated write on open_roles" ON public.open_roles;
CREATE POLICY "Allow authenticated write on open_roles"
  ON public.open_roles FOR ALL USING (true) WITH CHECK (true);

-- 2. Open role applications (works submitted as LINKS)
CREATE TABLE IF NOT EXISTS public.role_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id UUID REFERENCES public.open_roles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  cover_letter TEXT,
  portfolio_link TEXT,
  resume_link TEXT,
  work_links TEXT[],          -- array of additional work links
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'shortlisted', 'rejected', 'hired')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.role_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert on role_applications" ON public.role_applications;
CREATE POLICY "Allow insert on role_applications"
  ON public.role_applications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read on role_applications" ON public.role_applications;
CREATE POLICY "Allow read on role_applications"
  ON public.role_applications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow write on role_applications" ON public.role_applications;
CREATE POLICY "Allow write on role_applications"
  ON public.role_applications FOR ALL USING (true) WITH CHECK (true);

-- 3. Internship certification requests
CREATE TABLE IF NOT EXISTS public.cert_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  intern_role TEXT NOT NULL,
  internship_start DATE,
  internship_end DATE,
  supervisor_name TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'issued', 'rejected')),
  certificate_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.cert_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert on cert_requests" ON public.cert_requests;
CREATE POLICY "Allow insert on cert_requests"
  ON public.cert_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read on cert_requests" ON public.cert_requests;
CREATE POLICY "Allow read on cert_requests"
  ON public.cert_requests FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow write on cert_requests" ON public.cert_requests;
CREATE POLICY "Allow write on cert_requests"
  ON public.cert_requests FOR ALL USING (true) WITH CHECK (true);
