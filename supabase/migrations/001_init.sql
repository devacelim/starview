-- StarView: Star catalog table
-- Run in Supabase SQL editor or via supabase db push

CREATE TABLE IF NOT EXISTS public.stars (
  id            TEXT PRIMARY KEY,
  name          TEXT        NOT NULL,
  name_ko       TEXT,
  ra            DOUBLE PRECISION NOT NULL,   -- Right Ascension (degrees)
  dec           DOUBLE PRECISION NOT NULL,   -- Declination (degrees)
  mag           REAL        NOT NULL,        -- Apparent magnitude (lower = brighter)
  constellation TEXT
);

-- Allow anonymous read (anon key)
ALTER TABLE public.stars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stars_public_read" ON public.stars
  FOR SELECT USING (true);

-- Index for fast sorting by brightness
CREATE INDEX IF NOT EXISTS idx_stars_mag ON public.stars (mag ASC);
