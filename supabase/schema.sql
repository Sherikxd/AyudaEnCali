-- ===========================================================================
-- AyudaEnCali — esquema de Supabase (idempotente)
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo.
-- También queda disponible en GET /api/supabase/sql mientras corre el server.
--
-- Nota sobre permisos:
--   * Lectura pública (cualquiera puede consultar el mapa/tablón).
--   * Escritura solo para usuarios autenticados en Supabase (rol
--     `authenticated`). El backend escribe con la SERVICE ROLE KEY, que
--     bypasea RLS; si solo configuras la ANON KEY, los INSERT serán
--     bloqueados por diseño.
-- ===========================================================================

-- TABLA 1: Puntos de ayuda y centros en Cali -------------------------------
CREATE TABLE IF NOT EXISTS help_points (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  address TEXT NOT NULL,
  barrio TEXT NOT NULL,
  comuna TEXT,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  contact_person TEXT,
  description TEXT,
  schedule TEXT,
  status TEXT DEFAULT 'abierto',
  urgent_items JSONB DEFAULT '[]'::jsonb,
  capacity TEXT,
  verified BOOLEAN DEFAULT true,
  author_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA 2: Necesidades comunitarias y reportes -----------------------------
CREATE TABLE IF NOT EXISTS help_needs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  urgency TEXT DEFAULT 'alta',
  barrio TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'activa',
  supporters_count INTEGER DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de lectura frecuente (filtros del mapa y del tablón) -------------
CREATE INDEX IF NOT EXISTS idx_help_points_category ON help_points (category);
CREATE INDEX IF NOT EXISTS idx_help_points_created_at ON help_points (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_points_barrio ON help_points (barrio);
CREATE INDEX IF NOT EXISTS idx_help_needs_status ON help_needs (status);
CREATE INDEX IF NOT EXISTS idx_help_needs_urgency ON help_needs (urgency);
CREATE INDEX IF NOT EXISTS idx_help_needs_created_at ON help_needs (created_at DESC);

-- Row Level Security -------------------------------------------------------
ALTER TABLE help_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_needs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Lectura pública -------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'help_points'
      AND policyname = 'Lectura publica de centros'
  ) THEN
    CREATE POLICY "Lectura publica de centros" ON help_points
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'help_needs'
      AND policyname = 'Lectura publica de necesidades'
  ) THEN
    CREATE POLICY "Lectura publica de necesidades" ON help_needs
      FOR SELECT USING (true);
  END IF;

  -- Escritura solo autenticada -------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'help_points'
      AND policyname = 'Insercion autenticada de centros'
  ) THEN
    CREATE POLICY "Insercion autenticada de centros" ON help_points
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'help_needs'
      AND policyname = 'Insercion autenticada de necesidades'
  ) THEN
    CREATE POLICY "Insercion autenticada de necesidades" ON help_needs
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  -- Actualización de apoyos/estado solo autenticada -----------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'help_needs'
      AND policyname = 'Actualizacion autenticada de necesidades'
  ) THEN
    CREATE POLICY "Actualizacion autenticada de necesidades" ON help_needs
      FOR UPDATE TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'help_points'
      AND policyname = 'Actualizacion autenticada de centros'
  ) THEN
    CREATE POLICY "Actualizacion autenticada de centros" ON help_points
      FOR UPDATE TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Eliminaciones: sin políticas (nadie puede borrar desde la API con anon) --
