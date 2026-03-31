-- 002_add_satellites.sql
-- 위성 지원을 위한 스키마 변경 및 데이터 삽입
-- 위성의 RA/Dec는 항상 클라이언트/API에서 동적 계산 → DB에 저장하지 않음

-- 1. type 컬럼 추가 (기본값 'star')
ALTER TABLE public.stars
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'star';

-- 2. 위성은 동적 계산이므로 ra/dec를 nullable로 변경
ALTER TABLE public.stars
  ALTER COLUMN ra  DROP NOT NULL,
  ALTER COLUMN dec DROP NOT NULL;

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_stars_type ON public.stars (type);

-- 4. 주요 위성 삽입 (ra/dec = NULL — 항상 동적 계산)
INSERT INTO public.stars (id, name, name_ko, ra, dec, mag, constellation, type) VALUES
  -- 목성: 갈릴레이 4대 위성
  ('io',         'Io',         '이오',       NULL, NULL,  5.02, NULL, 'satellite'),
  ('europa',     'Europa',     '유로파',     NULL, NULL,  5.29, NULL, 'satellite'),
  ('ganymede',   'Ganymede',   '가니메데',   NULL, NULL,  4.61, NULL, 'satellite'),
  ('callisto',   'Callisto',   '칼리스토',   NULL, NULL,  5.65, NULL, 'satellite'),
  -- 토성 주요 위성
  ('mimas',      'Mimas',      '미마스',     NULL, NULL, 12.90, NULL, 'satellite'),
  ('enceladus',  'Enceladus',  '엔셀라두스', NULL, NULL, 11.70, NULL, 'satellite'),
  ('tethys',     'Tethys',     '테티스',     NULL, NULL, 10.30, NULL, 'satellite'),
  ('dione',      'Dione',      '디오네',     NULL, NULL, 10.40, NULL, 'satellite'),
  ('rhea',       'Rhea',       '레아',       NULL, NULL,  9.65, NULL, 'satellite'),
  ('titan',      'Titan',      '타이탄',     NULL, NULL,  8.40, NULL, 'satellite'),
  ('hyperion',   'Hyperion',   '히페리온',   NULL, NULL, 14.20, NULL, 'satellite'),
  ('iapetus',    'Iapetus',    '이아페투스', NULL, NULL, 11.00, NULL, 'satellite'),
  ('phoebe',     'Phoebe',     '포이베',     NULL, NULL, 16.50, NULL, 'satellite'),
  -- 천왕성 주요 위성
  ('miranda',    'Miranda',    '미란다',     NULL, NULL, 15.80, NULL, 'satellite'),
  ('ariel',      'Ariel',      '아리엘',     NULL, NULL, 14.40, NULL, 'satellite'),
  ('umbriel',    'Umbriel',    '움브리엘',   NULL, NULL, 15.00, NULL, 'satellite'),
  ('titania',    'Titania',    '티타니아',   NULL, NULL, 13.90, NULL, 'satellite'),
  ('oberon',     'Oberon',     '오베론',     NULL, NULL, 14.10, NULL, 'satellite'),
  -- 해왕성 위성
  ('triton',     'Triton',     '트리톤',     NULL, NULL, 13.50, NULL, 'satellite'),
  ('nereid',     'Nereid',     '네레이드',   NULL, NULL, 19.70, NULL, 'satellite'),
  -- 화성 위성
  ('phobos',     'Phobos',     '포보스',     NULL, NULL, 11.30, NULL, 'satellite'),
  ('deimos',     'Deimos',     '데이모스',   NULL, NULL, 12.40, NULL, 'satellite')

ON CONFLICT (id) DO UPDATE
  SET name          = EXCLUDED.name,
      name_ko       = EXCLUDED.name_ko,
      ra            = NULL,
      dec           = NULL,
      mag           = EXCLUDED.mag,
      constellation = NULL,
      type          = 'satellite';
