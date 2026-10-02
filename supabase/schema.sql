-- ===========================================================================
-- AyudaEnCali — esquema de Supabase (idempotente)
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo.
-- También queda disponible en GET /api/supabase/sql con
-- `Authorization: Bearer <SQL_ADMIN_TOKEN>` (401 sin token, T3 semana 2).
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

-- Un reporte nuevo nace sin verificar: la verificación es un paso aparte que
-- da un rol con permisos (semana 2). El servidor manda `verified` de forma
-- explícita; aquí solo se alinea el valor por defecto por si algún INSERT no
-- lo trae (idempotente: no toca filas existentes).
ALTER TABLE help_points ALTER COLUMN verified SET DEFAULT false;

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

-- Autoría de la necesidad (FAL-02): el `sub` del JWT de Clerk, escrito SOLO
-- por el servidor desde la sesión verificada (nunca desde el cuerpo de la
-- petición). Idempotente: `IF NOT EXISTS` permite aplicarlo sobre una BD ya
-- creada sin romper `npm run db:setup`.
--
-- Backfill: no existe una tabla de usuarios local a la que vincular, así que
-- las necesidades heredadas (semilla y las anteriores a esta migración)
-- quedan con `NULL` = «autor desconocido». Por diseño, con `NULL` nadie puede
-- editar ni borrar la fila («solo el autor»): es la opción segura.
ALTER TABLE help_needs ADD COLUMN IF NOT EXISTS author_id TEXT;
CREATE INDEX IF NOT EXISTS idx_help_needs_author_id ON help_needs (author_id);

-- Índices de lectura frecuente (filtros del mapa y del tablón) -------------
CREATE INDEX IF NOT EXISTS idx_help_points_category ON help_points (category);
CREATE INDEX IF NOT EXISTS idx_help_points_created_at ON help_points (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_points_barrio ON help_points (barrio);
CREATE INDEX IF NOT EXISTS idx_help_needs_status ON help_needs (status);
CREATE INDEX IF NOT EXISTS idx_help_needs_urgency ON help_needs (urgency);
CREATE INDEX IF NOT EXISTS idx_help_needs_created_at ON help_needs (created_at DESC);

-- TABLA 3: Apoyos individuales (la dinámica de "likes") ---------------------
-- Fuente de verdad de *quién* apoyó *qué*: la clave primaria compuesta
-- garantiza que una misma cuenta dé exactamente un apoyo por necesidad y
-- pueda retirarlo. `help_needs.supporters_count` es solo el contador
-- *materializado* que se muestra en el tablón: la función
-- `toggle_need_support` lo recalcula con `count(*)` en la misma transacción
-- en la que inserta o borra, así que nunca se desvía de esta tabla.
CREATE TABLE IF NOT EXISTS need_supporters (
  need_id TEXT NOT NULL REFERENCES help_needs (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (need_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_need_supporters_user_id ON need_supporters (user_id);

-- TABLA 4: Comentarios de los puntos ----------------------------------------
-- Antes vivían solo en RAM y se perdían en cada despliegue. El servidor es
-- quien escribe (SERVICE ROLE KEY) con la identidad tomada del JWT de Clerk:
-- `author_id` nunca viene del cliente.
CREATE TABLE IF NOT EXISTS point_comments (
  id TEXT PRIMARY KEY,
  point_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT DEFAULT 'ciudadano',
  author_barrio TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_comments_point_id ON point_comments (point_id, created_at DESC);

-- TABLA 5: Reportes de la comunidad (cola de moderación, T28) ---------------
-- Quién reporta lo hace con la sesión ya verificada en el servidor:
-- `reporter_id` es el `sub` del JWT de Clerk (nunca del cuerpo) y solo el
-- backend escribe con la SERVICE ROLE KEY.
--
-- Postgres NO admite claves foráneas polimórficas (una tabla no puede
-- referenciar dos destinos con una sola FK), de ahí las DOS columnas FK
-- (`point_id` / `need_id`) más `entity_id`, la columna por la que se
-- consulta. Los CHECKs garantizan que cada fila apunta a UNA entidad y
-- solo a la de su tipo:
--   * `entity_type='point'` → `point_id` relleno y `need_id` NULL (y al revés)
--   * `entity_id = COALESCE(point_id, need_id)` → la columna de consulta
--     siempre coincide con la FK real.
-- El índice único `(reporter_id, entity_type, entity_id)` es el dedup: un
-- mismo ciudadano no puede acumular dos veces el mismo reporte.
CREATE TABLE IF NOT EXISTS entity_reports (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('point', 'need')),
  entity_id TEXT NOT NULL,
  point_id TEXT REFERENCES help_points (id) ON DELETE CASCADE,
  need_id TEXT REFERENCES help_needs (id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK ((entity_type = 'point') = (point_id IS NOT NULL)),
  CHECK ((entity_type = 'need') = (need_id IS NOT NULL)),
  CHECK (entity_id = COALESCE(point_id, need_id))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_reports_dedup
  ON entity_reports (reporter_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_reports_created_at ON entity_reports (created_at DESC);

-- Un comentario pertenece SIEMPRE a un punto existente (FAL-02): sin esta
-- clave foránea los comentarios podían quedar huérfanos cuando se borraba el
-- punto. `ON DELETE CASCADE` borra con él los comentarios del punto.
--
-- Idempotente (solo actúa la primera vez, cuando la restricción no existe)
-- y con limpieza documentada: los comentarios de puntos inexistentes no son
-- consultables (el filtrado es por `point_id` contra `help_points`), así que
-- se eliminan antes de crear la restricción. Si la restricción ya está, el
-- bloque no hace nada y no se borra ninguna fila.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'point_comments_point_id_fkey'
      AND conrelid = 'point_comments'::regclass
  ) THEN
    DELETE FROM point_comments
    WHERE NOT EXISTS (
      SELECT 1 FROM help_points WHERE help_points.id = point_comments.point_id
    );

    ALTER TABLE point_comments
      ADD CONSTRAINT point_comments_point_id_fkey
      FOREIGN KEY (point_id) REFERENCES help_points (id) ON DELETE CASCADE;
  END IF;
END $$;

-- Row Level Security -------------------------------------------------------
ALTER TABLE help_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE need_supporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_reports ENABLE ROW LEVEL SECURITY;

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

-- need_supporters, point_comments y entity_reports: RLS activo y SIN políticas --
-- Solo el backend accede con la SERVICE ROLE KEY (que bypasea RLS). Así ni
-- `anon` ni `authenticated` pueden descubrir qué usuario apoyó qué
-- necesidad, escribir comentarios ni leer/escribir la cola de reportes: la
-- API solo devuelve esos datos con la sesión de Clerk ya verificada en el
-- servidor (401 sin sesión y 403 sin permiso de moderación en T28).

-- Recuento atómico de apoyos ------------------------------------------------
-- `toggle_need_support` hace el INSERT/DELETE en `need_supporters` y
-- recalcula `help_needs.supporters_count` con `count(*)` **en la misma
-- transacción**, devolviendo siempre el recuento real:
--
--   * bloquea la fila de la necesidad (FOR UPDATE) para que dos apoyos
--     simultáneos se serialicen y ninguno se pierda;
--   * `add` es idempotente (ON CONFLICT DO NOTHING) y `remove` no deja el
--     contador en negativo (sale del recuento, no de un delta);
--   * devuelve NULL si la necesidad no existe.
--
-- Solo la SERVICE ROLE puede ejecutarla con éxito: `anon` y `authenticated`
-- no tienen permiso (REVOKE más abajo) y, aunque lo tuvieran, el RLS sin
-- políticas de `need_supporters` les impediría escribir.
CREATE OR REPLACE FUNCTION toggle_need_support(p_need_id TEXT, p_user_id TEXT, p_action TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_action NOT IN ('add', 'remove') THEN
    RAISE EXCEPTION 'Acción no válida: % (usa add o remove)', p_action;
  END IF;

  PERFORM 1 FROM help_needs WHERE id = p_need_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_action = 'add' THEN
    INSERT INTO need_supporters (need_id, user_id)
    VALUES (p_need_id, p_user_id)
    ON CONFLICT (need_id, user_id) DO NOTHING;
  ELSE
    DELETE FROM need_supporters WHERE need_id = p_need_id AND user_id = p_user_id;
  END IF;

  SELECT count(*) INTO v_count FROM need_supporters WHERE need_id = p_need_id;

  UPDATE help_needs SET supporters_count = v_count WHERE id = p_need_id;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION toggle_need_support(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION toggle_need_support(TEXT, TEXT, TEXT) TO service_role;
