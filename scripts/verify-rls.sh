#!/usr/bin/env bash
# -----------------------------------------------------------------------
# Valida supabase/schema.sql en un Postgres DESECHABLE, sin tocar tu
# proyecto de Supabase:
#
#   1. Crea un clúster temporal en /tmp (lo borra al salir).
#   2. Simula los roles y funciones que Supabase trae de serie
#      (anon, authenticated y auth.uid()).
#   3. Aplica el esquema DOS veces para probar la idempotencia.
#   4. Comprueba las políticas RLS:
#        · anon      → lee, no inserta, no borra
#        · authenticated con token  → inserta
#        · authenticated sin token  → no inserta
#        · need_supporters → sin políticas (solo el backend) y con clave
#          primaria que impide apoyos duplicados
#
# Requiere: initdb, pg_ctl y psql en el PATH (PostgreSQL 14+).
# Uso:  npm run verify:rls   (o: bash scripts/verify-rls.sh)
# -----------------------------------------------------------------------
set -u

SQLFILE="$(cd "$(dirname "$0")/.." && pwd)/supabase/schema.sql"
CLUSTER="${TMPDIR:-/tmp}/ayudaencali-pgdata"
SOCK="${TMPDIR:-/tmp}/ayudaencali-pgsock"
LOG="${TMPDIR:-/tmp}/ayudaencali-pg.log"
PORT="${VERIFY_RLS_PORT:-55432}"

export PGHOST="$SOCK" PGPORT="$PORT" PGUSER=postgres

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null || { echo "Falta $bin (instala PostgreSQL)"; exit 1; }
done
[ -f "$SQLFILE" ] || { echo "No existe $SQLFILE"; exit 1; }

rm -rf "$CLUSTER"; mkdir -p "$SOCK"
cleanup() { pg_ctl -D "$CLUSTER" stop -m fast >/dev/null 2>&1 || true; }
trap cleanup EXIT

initdb -D "$CLUSTER" -U postgres --auth=trust -E UTF8 >/dev/null 2>&1 || {
  echo "No se pudo crear el clúster temporal"; exit 1; }
pg_ctl -D "$CLUSTER" -l "$LOG" -o "-k $SOCK -p $PORT -h 127.0.0.1" start >/dev/null 2>&1 || {
  echo "No se pudo arrancar Postgres (ver $LOG)"; exit 1; }
sleep 1

fail=0
step() { echo; echo "--- $1"; }

step "Versión"
psql -Atc "select version();"

step "Prerrequisitos equivalentes a un proyecto Supabase"
psql -v ON_ERROR_STOP=1 -q <<'SQL' && echo "OK"
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
  ), '')::uuid
$$;
SQL

step "Pasada 1 del esquema"
psql -v ON_ERROR_STOP=1 -q -f "$SQLFILE" && echo "OK (aplica limpio)"

step "Pasada 2 (idempotencia)"
if psql -v ON_ERROR_STOP=1 -q -f "$SQLFILE" 2>/dev/null; then
  echo "OK (re-ejecutable)"
else
  echo "FALLO: el esquema no se puede re-ejecutar"; fail=1
fi

step "Privilegios de API (como hace Supabase)"
psql -v ON_ERROR_STOP=1 -q <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
SQL

step "Políticas instaladas (esperadas: 6)"
psql -Atc "SELECT '  ' || tablename || ' | ' || policyname || ' | ' || cmd
           FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;"
count=$(psql -Atc "SELECT count(*) FROM pg_policies WHERE schemaname='public';")
[ "$count" = "6" ] || { echo "FALLO: hay $count políticas, se esperaban 6"; fail=1; }

step "RLS habilitado en las tres tablas"
rls=$(psql -Atc "SELECT relname || '=' || relrowsecurity FROM pg_class
           WHERE relname IN ('help_points','help_needs','need_supporters') ORDER BY relname;")
echo "$rls" | sed 's/^/  /'
if [ "$(echo "$rls" | grep -c '=t')" = "3" ]; then
  echo "  OK"
else
  echo "  FALLO: RLS desactivado en alguna tabla"; fail=1
fi

step "need_supporters: sin políticas (solo la SERVICE ROLE accede)"
ns_policies=$(psql -Atc "SELECT count(*) FROM pg_policies
                         WHERE schemaname='public' AND tablename='need_supporters';")
echo "  politicas: $ns_policies (esperadas: 0)"
[ "$ns_policies" = "0" ] || { echo "  FALLO: hay políticas donde no deben existir"; fail=1; }

step "Semilla mínima"
psql -v ON_ERROR_STOP=1 -q -c "
  INSERT INTO help_needs (id,title,description,category,barrio,contact_name,contact_phone)
  VALUES ('x1','Faltan cobijas','30 familias','acopio','San Antonio','Ana','300');"

step "1) anon SÍ puede leer"
psql -Atc "SET ROLE anon; SELECT '  leidas: ' || count(*) FROM help_needs; RESET ROLE;"

step "2) anon NO puede insertar (se espera ERROR por política RLS)"
if psql -Atc "SET ROLE anon;
  INSERT INTO help_needs (id,title,description,category,barrio,contact_name,contact_phone)
  VALUES ('y1','no deberia entrar','x','acopio','San Antonio','Ana','300');
  RESET ROLE;" 2>&1 | grep -q "row-level security"; then
  echo "  OK: INSERT de anon bloqueado"
else
  echo "  FALLO: el INSERT de anon pasó"; fail=1
fi

step "3) anon NO puede borrar (la fila debe seguir intacta)"
out=$(psql -Atc "SET ROLE anon; DELETE FROM help_needs WHERE id='x1'; RESET ROLE;" 2>&1)
remaining=$(psql -Atc "SET ROLE anon; SELECT count(*) FROM help_needs WHERE id='x1'; RESET ROLE;" 2>&1 | grep -E '^[0-9]+$' | head -1)
if [ "$remaining" = "1" ]; then
  echo "  OK: nada se borró"
else
  echo "  FALLO: quedan $remaining copias (borrado: $out)"; fail=1
fi

step "4) authenticated CON token sí puede insertar"
if psql -Atc "SET ROLE authenticated;
  SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  INSERT INTO help_needs (id,title,description,category,barrio,contact_name,contact_phone)
  VALUES ('x2','Insertado con sesión','ok','acopio','San Antonio','Ana','300');
  RESET ROLE;" >/dev/null 2>&1; then
  echo "  OK"
else
  echo "  FALLO: el insert autenticado fue rechazado"; fail=1
fi

step "5) authenticated SIN token no puede insertar (se espera ERROR)"
if psql -Atc "SET ROLE authenticated;
  INSERT INTO help_needs (id,title,description,category,barrio,contact_name,contact_phone)
  VALUES ('y2','sin token','x','acopio','San Antonio','Ana','300');
  RESET ROLE;" 2>&1 | grep -q "row-level security"; then
  echo "  OK: INSERT sin token bloqueado"
else
  echo "  FALLO: el INSERT sin token pasó"; fail=1
fi

step "6) need_supporters: anon ni lee ni escribe apoyos"
rows=$(psql -Atc "SET ROLE anon; SELECT count(*) FROM need_supporters; RESET ROLE;" 2>&1 | grep -E '^[0-9]+$' | head -1)
if [ "$rows" = "0" ]; then
  echo "  OK: anon ve 0 filas"
else
  echo "  FALLO: anon leyó $rows apoyos"; fail=1
fi

if psql -Atc "SET ROLE anon;
  INSERT INTO need_supporters (need_id, user_id) VALUES ('x1','user_falso');
  RESET ROLE;" >/dev/null 2>&1; then
  echo "  FALLO: el INSERT de anon en need_supporters pasó"; fail=1
else
  echo "  OK: INSERT de anon bloqueado"
fi

if psql -Atc "SET ROLE authenticated;
  INSERT INTO need_supporters (need_id, user_id) VALUES ('x1','11111111-1111-4111-8111-111111111111');
  RESET ROLE;" >/dev/null 2>&1; then
  echo "  FALLO: el INSERT autenticado pasó (solo debe escribir el backend)"; fail=1
else
  echo "  OK: solo el backend (service_role) escribe apoyos"
fi

step "7) un usuario = un apoyo (clave primaria need_id+user_id)"
psql -v ON_ERROR_STOP=1 -q -c "INSERT INTO need_supporters (need_id, user_id) VALUES ('x1','user_a');"
if psql -Atc "INSERT INTO need_supporters (need_id, user_id) VALUES ('x1','user_a');" >/dev/null 2>&1; then
  echo "  FALLO: se aceptó el apoyo duplicado"; fail=1
else
  echo "  OK: apoyo duplicado rechazado"
fi
psql -Atc "INSERT INTO need_supporters (need_id, user_id) VALUES ('x1','user_b');" >/dev/null
psql -Atc "SELECT '  apoyos de x1 registrados: ' || count(*) FROM need_supporters WHERE need_id='x1';"
[ "$(psql -Atc "SELECT count(*) FROM need_supporters WHERE need_id='x1';")" = "2" ] || { echo "  FALLO: se esperaban 2 apoyos"; fail=1; }

echo
if [ "$fail" -eq 0 ]; then echo "RESULTADO: esquema y politicas RLS correctas [OK]"; else echo "RESULTADO: hay fallos [ERROR]"; fi
exit "$fail"
