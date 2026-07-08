-- ============================================
-- CDS Space: Branding Word of the Day
-- Run this in your Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS public.branding_words (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT NOT NULL,
  pronunciation TEXT,
  part_of_speech TEXT,
  meaning TEXT NOT NULL,
  example TEXT,
  feature_date DATE UNIQUE,        -- if set, this word is featured for that date
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.branding_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on branding_words" ON public.branding_words;
CREATE POLICY "Allow public read on branding_words"
  ON public.branding_words FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated write on branding_words" ON public.branding_words;
CREATE POLICY "Allow authenticated write on branding_words"
  ON public.branding_words FOR ALL USING (true) WITH CHECK (true);

-- Seed with starter words
INSERT INTO public.branding_words (word, pronunciation, part_of_speech, meaning, example) VALUES
  ('Brand Equity', '/brand ˈek.wɪ.ti/', 'noun', 'The value premium a company gains from a recognized brand name compared to a generic equivalent.', 'Apple''s brand equity allows it to charge a premium for its products.'),
  ('Wordmark', '/ˈwɜːd.mɑːk/', 'noun', 'A distinct text-only typographic treatment of the name of a company, institution, or product.', 'Google''s colorful wordmark is one of the most recognizable in the world.'),
  ('Brand Voice', '/brand vɔɪs/', 'noun', 'The consistent personality and style used in a brand''s communications across all channels.', 'Our brand voice is friendly, confident, and never condescending.'),
  ('Mood Board', '/muːd bɔːd/', 'noun', 'A collage of images, text, and samples that conveys the visual direction of a project.', 'The mood board helped align everyone on the campaign''s aesthetic.'),
  ('Kerning', '/ˈkɜː.nɪŋ/', 'noun', 'The process of adjusting the space between individual characters in typography.', 'Good kerning makes the difference between a polished logo and an amateur one.'),
  ('White Space', '/waɪt speɪs/', 'noun', 'The empty area around design elements, used intentionally to improve readability and focus.', 'White space is not wasted space - it gives the design room to breathe.'),
  ('Brand Identity', '/brand aɪˈden.tɪ.ti/', 'noun', 'The visible elements of a brand - color, design, logo - that distinguish it in consumers'' minds.', 'A strong brand identity makes a company instantly recognizable.'),
  ('Tagline', '/ˈtæɡ.laɪn/', 'noun', 'A memorable phrase that captures the essence of a brand or campaign.', 'Nike''s "Just Do It" is one of the greatest taglines ever written.'),
  ('Color Palette', '/ˈkʌl.ə ˈpæl.ət/', 'noun', 'A specific set of colors chosen to represent a brand consistently.', 'Tiffany & Co. owns its iconic robin''s-egg blue color palette.'),
  ('Iconography', '/ˌaɪ.kəˈnɒɡ.rə.fi/', 'noun', 'The visual language of symbols and icons used to communicate ideas in a brand system.', 'Consistent iconography ties together the entire user experience.')
ON CONFLICT DO NOTHING;

-- ============================================
-- Booking Sessions Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.booking_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  topic TEXT NOT NULL,
  preferred_date DATE NOT NULL,
  preferred_time TEXT,
  duration TEXT DEFAULT '30 min',
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.booking_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own bookings" ON public.booking_sessions;
CREATE POLICY "Users insert own bookings"
  ON public.booking_sessions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users read own bookings" ON public.booking_sessions;
CREATE POLICY "Users read own bookings"
  ON public.booking_sessions FOR SELECT USING (auth.uid() = user_id OR true);

DROP POLICY IF EXISTS "Authenticated full access on bookings" ON public.booking_sessions;
CREATE POLICY "Authenticated full access on bookings"
  ON public.booking_sessions FOR ALL USING (true) WITH CHECK (true);
