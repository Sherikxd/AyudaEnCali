# Log — backend / RLS auditoría A1+A2 (2026-10-11)

## En qué trabajé

- Corrección de las **2 vulnerabilidades ALTAS** de la auditoría de
  seguridad, en mi área (`supabase/**` y `scripts/**`):
  - **A1** · RLS: `UPDATE` a cualquier fila para cualquier autenticado
    (`USING (true) WITH CHECK (true)` en `help_points`/`help_needs`).
  - **A2** · RLS: `INSERT` abierto a cualquier autenticado
    (`WITH CHECK (auth.uid() IS NOT NULL)`).

## Cambios realizados

- `supabase/schema.sql:9-16` → la nota de permisos del cabecera ya no dice
  «escritura solo para usuarios autenticados»: documenta que **solo el
  backend escribe con `service_role`** y que `anon`/`authenticated` no
  pueden INSERTar ni UPDATEar estas tablas (los INSERT se rechazan y los
  UPDATE no afectan ninguna fila).
- `supabase/schema.sql:206-226` → las 4 políticas de escritura
  (`Insercion autenticada de centros/necesidades`,
  `Actualizacion autenticada de necesidades/centros`) se **eliminan** y se
  reemplazan por 4 `DROP POLICY IF EXISTS` idempotentes (el bloque DO
  conserva la creación de las 2 políticas de lectura pública). El `DROP`
  es imprescindible: las BDs ya desplegadas siguen teniendo las políticas
  vulnerables y sin él `npm run db:setup` no las removería.
- `supabase/schema.sql:228-229` → comentario de DELETE actualizado (tampoco
  `authenticated` puede borrar).
- `scripts/verify-rls.sh:10-26` → el resumen del script refleja el nuevo
  contrato (authenticated ya **no** inserta).
- `scripts/verify-rls.sh:91-100` → el recuento de políticas pasa de esperar
  **6 → 2** y se añade un check explícito de que **no queda ninguna
  política `INSERT`/`UPDATE`** (regresión directa de A1/A2).
- `scripts/verify-rls.sh:149-169` (paso 4) → el caso «authenticated CON
  token **sí** puede insertar» se invierte: ahora **espera fallo**
  (error `row-level security`) tanto en `help_needs` como en `help_points`
  (incluye el ataque de publicar un centro con `verified: true`).
- `scripts/verify-rls.sh:171-179` (paso 5) → se mantiene el caso
  «authenticated SIN token no inserta».
- `scripts/verify-rls.sh:181-223` (pasos 6 y 7, **nuevos**) → test de
  **UPDATE autenticado que espera fallo** en `help_needs` (p. ej.
  `supporters_count=999`, robo de `author_id`) y en `help_points`
  (`verified=true`, `phone`, `author_id`). Como un UPDATE sin políticas RLS
  **no lanza error sino 0 filas afectadas** (vacío en PostgREST), el test
  comprueba dos cosas: `RETURNING id` no devuelve la fila **y** el valor
  real de la BD no cambia.
- `scripts/verify-rls.sh:225-348` → renumeración de los pasos antiguos
  6-13 → 8-15 (sin cambiar su contenido).

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ exit 0, sin errores |
| `npx vite build` | ✅ `✓ built in 540ms` |
| `npm run test:ui` | ✅ «TODO OK» |
| `npm run test:server` | ✅ «TODO OK» (no toqué `server/**`, corrido por si acaso) |
| `npm run verify:rls` | ✅ **15 pasos, RESULTADO [OK]** |
| Humo (`server.ts` en :3124) | ✅ `/api/health` 200 · `/api/ruta-inexistente` 404 |

Notas sobre la ejecución:

- `verify:rls` **no** se pudo correr con el Postgres del sistema (solo hay
  cliente `psql`; faltan `initdb`/`pg_ctl` y Docker exige root). Se usó un
  PostgreSQL 17.10 portátil descargado fuera del repo
  (`/tmp/opencode/pg`, paquete npm `@embedded-postgres/linux-x64`) y el
  script corrió **sin modificar** con ese `PATH`. En la CI (que instala
  PostgreSQL) corre igual que siempre.
- **Sabotaje en rojo verificado**: el script nuevo aplicado al esquema
  vulnerable (HEAD) marca `FALLO` en 6 comprobaciones — conteo de
  políticas (6≠2), 4 políticas de escritura presentes, INSERT autenticado
  que **pasó** en ambas tablas (A2) y UPDATE autenticado que **modificó**
  `x1` (`999|<uid invasor>`) y `p1` (`true|000|<uid invasor>`) (A1).
- **Remediación verificada**: sobre una BD con el esquema viejo (6
  políticas), aplicar el nuevo `schema.sql` deja **2** políticas (solo
  SELECT público) y el mismo ataque de UPDATE posterior afecta **0** filas.
- `verify:rls` imprime 4 `NOTICE: … does not exist, skipping` en la pasada
  1: son los `DROP POLICY IF EXISTS` sobre una BD limpia — informativos,
  no rompen nada (idempotencia en verde).

## Decisiones tomadas (y por qué)

- **Eliminar** las políticas en vez de condicionarlas
  (`author_id = auth.uid()`): verificado en el repo que **no existe ningún
  uso legítimo con sesión Supabase**. El cliente no tiene cliente Supabase
  (habla con la API, `src/**` ni siquiera importa `@supabase/supabase-js`)
  y el servidor escribe con `service_role` (`server/handlers/*`);
  `scripts/seed-db.ts:28` y `server/supabase.ts:395` pueden caer a la ANON
  KEY solo como respaldo, y esas escrituras ya quedaban bloqueadas por RLS
  antes del cambio (las políticas eran `TO authenticated`, no `anon`).
  Condiciones `author_id = auth.uid()` seguirían exponiendo PostgREST al
  signup abierto y complicarían el backend (que autoriza en
  `server/handlers/*`); la decisión de la auditoría (solo `service_role`
  escribe) es la más segura.
- No se tocaron `need_supporters`, `point_comments`, `entity_reports` ni
  `toggle_need_support` (ya estaban bien).
- Los cambios solo afectan a `supabase/**` y `scripts/**`.

## Riesgos y deuda que dejo

- **Despliegue**: la corrección en producción se aplica ejecutando el
  `schema.sql` nuevo contra el proyecto Supabase (`npm run db:setup` o el
  SQL Editor). **Hasta entonces las BDs desplegadas siguen vulnerables**
  (los `CREATE POLICY IF NOT EXISTS` antiguos solo creaban; los
  `DROP POLICY IF EXISTS` nuevos son los que remedian).
- **Fuera de mi área** (no tocado, queda anotado para su dueño):
  - `README.md:376-377,389` describe todavía las políticas de
    INSERT/UPDATE autenticadas → agente-calidad/docs debe actualizarlo.
  - `docs/legible/03-tecnologia-infraestructura.md:98`
    («insertar/editar solo con sesión autenticada») → igual.
  - `docs/agentes/decisiones.md`: conviene registrar la decisión (solo
    `service_role` escribe; nada de políticas de escritura para roles de
    API) — no la escribo yo por la regla de consenso.
- Si en el futuro alguien necesita escritura directa desde el cliente
  (p. ej. Supabase Realtime con escrituras, FEAT-10), tendrá que añadir
  políticas nuevas y condicionadas, con tests en `verify-rls.sh`.

## Para el siguiente agente

- `verify:rls` ahora espera **2** políticas y **15** pasos; cualquier
  política nueva de INSERT/UPDATE sobre `help_points`/`help_needs` lo
  pondrá en rojo a propósito (check `writen=0`).
- El test de UPDATE es silencioso-por-diseño: no busques un 403 de SQL,
  comprueba `RETURNING` + valor en BD (PostgREST devolvería una lista
  vacía, no un error, ante un UPDATE sin políticas).
- Detalle del ataque y de la verificación en este log; tablero actualizado
  en `docs/agentes/tareas-semana-1.md` (sección A1/A2).
