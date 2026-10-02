# Log — exportación de datos a S3 (2026-10-01)

## En qué trabajé

- Tarea nueva **no listada en los tableros** (recibida como encargo directo):
  scripts de exportación de las 4 tablas a **CSV + JSON** para un futuro
  dashboard/análisis, subidos a un **cluster S3-compatible** (los datos del
  cluster los dará el usuario → todo por variables de entorno).
- Sin tocar tableros ni auditorías (reparto de áreas de `AGENTS.md`).

## Cambios realizados

- **`scripts/export-s3.ts`** (nuevo, ~900 líneas) → el script completo:
  - **Fuente**: Supabase REST (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
    con paginación real: `limit/offset` + cabecera `Range` (páginas de 1000)
    y orden total y estable por tabla (`id.asc`, o `need_id.asc,user_id.asc`
    en `need_supporters`) hasta agotar filas. Sin BD configurada →
    mensaje claro y **exit 1**.
  - **Salida**: por cada tabla un CSV (cabecera, RFC 4180: comillas dobles
    escapadas, comas/saltos de línea entrecomillados, `null`/`undefined` →
    celda vacía, fechas ISO, JSONB serializado y entrecomillado, fin de línea
    CRLF) y un JSON (array de objetos), más un `manifest.json` con timestamp,
    tablas, nº de filas, bytes y `sha256` por fichero + `dump_sha256` del
    volcado completo. Cabecera del CSV = columnas de `supabase/schema.sql` +
    cualquier columna extra que aparezca (así el CSV de una tabla vacía
    también lleva cabecera).
  - **Destino**: PUT firmado con **AWS Signature V4 implementado a mano**
    (`createHash`/`createHmac` de `node:crypto` + `fetch` global; **sin
    @aws-sdk ni dependencias nuevas**). Firmas `host`, `content-type`,
    `x-amz-content-sha256` (hash real del cuerpo) y `x-amz-date`; re-firma en
    cada reintento.
  - **CLI**: `--dry-run` · `--tables=a,b` · `--format=csv|json|both`
    (default `both`) · `--date=YYYY-MM-DD` · `--self-test` · `--help`.
    Sin argumentos → exporta todo y sube. Códigos: **0** OK · **1** fallo ·
    **2** error de uso. Logger propio con `process.stdout/stderr.write`
    (sin `console.*`).
  - **Robustez**: timeout por petición (30 s lectura / 60 s subida,
    `AbortSignal.timeout`), hasta 3 intentos **solo** en fallos transitorios
    (red, timeout, 429, 5xx) con backoff 300/600 ms, resumen final
    tabla → filas → bytes → OK/FALLO y `exit != 0` si algo falló a medias.
    El `manifest.json` se sube **el último**: si existe, el volcado está
    completo.
- **`.env.example`** → bloque «S3 compatible» con las variables **vacías**:
  `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_PREFIX` (opcional), `S3_FORCE_PATH_STYLE`
  (opcional, por defecto `true` = path-style) + ejemplos de uso de
  `npm run export:s3` con `--dry-run`. Ningún valor real.
- **`package.json`** → solo el script nuevo:
  `"export:s3": "node --import tsx scripts/export-s3.ts"`.

## Variables de entorno

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `SUPABASE_URL` | sí | base de datos (lectura) |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | `need_supporters` y `point_comments` están **sin políticas RLS**: solo la service role puede leerlas |
| `S3_ENDPOINT` | sí\* | URL del cluster, p. ej. `https://<cluster>` (sin barra final) |
| `S3_REGION` | sí\* | región (los compatibles suelen aceptar `auto`) |
| `S3_BUCKET` | sí\* | bucket destino |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | sí\* | credenciales de firma |
| `S3_PREFIX` | no | carpeta dentro del bucket (p. ej. `ayudaencali`) |
| `S3_FORCE_PATH_STYLE` | no | `true` (default) path-style, `false` virtual-hosted |

\* obligatorias salvo con `--dry-run` (que solo necesita las de Supabase).

## Estructura remota

```
<S3_PREFIX>/YYYY-MM-DD/help_points.csv      (y .json)
<S3_PREFIX>/YYYY-MM-DD/help_needs.csv       (y .json)
<S3_PREFIX>/YYYY-MM-DD/need_supporters.csv  (y .json)
<S3_PREFIX>/YYYY-MM-DD/point_comments.csv   (y .json)
<S3_PREFIX>/YYYY-MM-DD/manifest.json        ← se sube el último
```

Carpeta fechada → histórico versionable para el dashboard. Sin `S3_PREFIX`,
lo mismo a raíz del bucket.

## Cómo se probó

1. **Firma SigV4 contra vectores oficiales de AWS** (`aws4_testsuite`):
   los valores esperados se reprodujeron **primero de forma independiente con
   openssl** ( HMAC en 4 pasos ) y solo entonces se incrustaron en el script.
   El auto-test corre **siempre al inicio** de cada ejecución (y solo con
   `--self-test`): `get-vanilla` → `…Signature=5fa00fa3…` idéntico al vector
   oficial, `post-x-www-form-urlencoded` → `…ff118979…`, y un tercer check
   del formato de `Authorization` en un PUT de S3.
2. **Dry-run real contra Supabase de `.env`**: 4 tablas → **8 volcados +
   manifest = 9 ficheros** en `exports-local/2026-10-01/` (5+4+1+1 = 11
   filas), exit 0.
3. **CSV verificado con un parser RFC 4180 independiente** (script aparte en
   `/tmp`): todas las filas con el mismo nº de columnas que la cabecera
   (20/14/3/8), recuento de filas = filas del JSON, y comparación
   celda a celda CSV ↔ JSON: **idéntico** (JSONB con comillas duplicadas,
   `null` → vacío, CRLF correcto).
4. **Subida end-to-end contra un mock S3 local que re-valida la firma**
   (reconstruye el canonical request desde la petición recibida con otra
   implementación y compara; verifica también `x-amz-content-sha256` contra
   el cuerpo): **9/9 PUT aceptados**, rutas y bytes exactos, `manifest` el
   último, content-types correctos. Con clave incorrecta → 403 del mock y
   **exit 1** con resumen FALLO.
5. **Reintentos**: servidor que devuelve 503 en la primera petición de cada
   URL → el script reintenta (attempt 1 = 503, attempt 2 = 200) y termina
   exit 0.
6. **Códigos de salida**: 0 (OK/`--help`/`--self-test`), 1 (sin credenciales
   Supabase, subida sin S3 configurado), 2 (`--format` inválido,
   `--tables` desconocida, `--date` inválido, bandera desconocida).

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ exit 0 |
| `npx vite build` | ✅ `✓ built in 526ms` |
| `npm run test:ui` | ✅ **40/40** «TODO OK» |
| `npm run test:server` | ✅ **84/84** «TODO OK» |
| `npm run smoke:vercel` | ✅ **43/43** comprobaciones, 0 fallos |
| `npm run verify:rls` | n/a (no se tocó `supabase/schema.sql`) |
| `npm run export:s3 -- --self-test` | ✅ 3/3 checks |
| `npm run export:s3 -- --dry-run` | ✅ 9/9 ficheros, exit 0 |
| subida contra mock S3 con validación SigV4 | ✅ 9/9 PUT, exit 0 |
| subida con clave mala | ✅ 403 reportado, exit 1 |
| reintento ante 503 | ✅ exit 0 |

## Decisiones tomadas (y por qué)

- **Sin SDK de AWS**: la firma va con `node:crypto` a mano (dependencia cero,
  requisito del encargo) y se valida con vectores oficiales en cada corrida.
- **`S3_FORCE_PATH_STYLE` por defecto `true`**: los clusters compatibles
  genéricos (MinIO, Ceph, R2…) casi siempre exigen path-style;
  `false` deja el modo virtual-hosted.
- **Manifest el último**: un lector del bucket solo verá el manifest si el
  volcado se completó.
- **`exports-local/` se auto-ignora**: el script escribe un `.gitignore` con
  `*` dentro de `exports-local/` → los volcados (¡contienen teléfonos y
  nombres!) no pueden acabar en el repo sin querer. No hizo falta tocar el
  `.gitignore` raíz (fuera de mi área).
- **Auto-test de firma siempre**: si la firma estuviera mal, el primer
  contacto con el cluster sería un 403 masivo; preferible fallar en 0,2 s en
  local.

## Riesgos y deuda que dejo

- **Falta el cluster real del usuario** (`S3_*` en `.env`): la subida está
  probada contra un mock que valida SigV4, pero no contra un bucket real →
  primer `npm run export:s3` con las credenciales verdaderas = prueba
  definitiva. Si el cluster exige algo no estándar (p. ej. regiones con
  firma distinta, session tokens STS), tocaría `putObject`/`loadS3Config`.
- **Modo virtual-hosted (`S3_FORCE_PATH_STYLE=false`) no probado en vivo**
  (con `localhost` no resuelve `<bucket>.<host>`); el camino por defecto
  (path-style) sí.
- **Sin programación**: el script es manual; si se quiere un volcado
  diario automático habrá que añadir un cron/GitHub Action (área de
  infra/datos, este fichero no).
- **Paginación sin `Prefer: count=exact`**: no valida el total contra un
  contador; corta cuando una página viene corta. correcto salvo que cambien
  filas *mientras* se pagina (ventana pequeña, aceptada).
- Los datos exportados contienen **datos personales** (teléfonos, nombres,
  `user_id` de Clerk): el bucket debe ser **privado** y no publicar
  `exports-local/` nunca.

## Para el siguiente agente

- Uso:

  ```bash
  npm run export:s3 -- --dry-run          # sin subir: escribe en exports-local/
  npm run export:s3                       # exporta todo y sube
  npm run export:s3 -- --tables=help_needs --format=csv --date=2026-09-30
  npm run export:s3 -- --self-test        # solo valida la firma SigV4
  ```

- El usuario solo tiene que rellenar en `.env` el bloque `S3_*` (ver
  `.env.example`) y ejecutar `npm run export:s3`; sin credenciales S3 solo
  vale `--dry-run`.
- El dashboard puede leer `<prefix>/<fecha>/manifest.json` para saber qué
  hay (`total_rows`, `sha256` por fichero, `dump_sha256`).
- Próxima mejora natural: subir también un `latest/` sin fecha o un CSV
  consolidado por si al dashboard le resulta más cómodo (pendiente de
  confirmar con quien consuma los datos).
