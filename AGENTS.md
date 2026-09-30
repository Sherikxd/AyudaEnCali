# AyudaEnCali — contexto para agentes

> **Lee esto antes de tocar nada.** La memoria compartida vive en
> [`docs/agentes/`](docs/agentes/README.md): estado, tareas, decisiones y el
> log de lo que ha hecho cada agente.

## Qué es la app

Plataforma comunitaria de emergencias de Santiago de Cali: mapa Leaflet de
centros de ayuda, tablón de necesidades con apoyos (likes), asistente IA
(Gemini) y perfiles con roles. **React 19 + TypeScript estricto + Vite 8** en
el cliente, **Express (ESM vía `tsx`)** como servidor, **Supabase** (Postgres
+ RLS) como BD y **Clerk** como identidad.

## Antes de empezar

1. `docs/agentes/tareas-semana-1.md` → tablero: qué tarea tienes asignada.
2. `docs/agentes/decisiones.md` → decisiones ya tomadas (no las revises sin
   consenso: anota la propuesta en el log).
3. `docs/agentes/memoria/` → qué se ha hecho hasta ahora y qué se rompió.

## Verificación obligatoria antes de terminar

```bash
npm run lint          # tsc --noEmit (estricto, con noUnusedLocals/Parameters)
npx vite build        # build de producción
npm run test:ui       # test jsdom (debe seguir en verde: "TODO OK")
npm run verify:rls    # solo si tocaste supabase/schema.sql (requiere red)
```

Si tocas el servidor, además una prueba de humo:

```bash
NODE_ENV=production PORT=3124 node --import tsx server.ts   # en un terminal
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3124/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3124/ruta-inexistente  # 404
```

## Reglas

- **Nunca** subir secretos al repo: todo en `.env` (gitignored). El cliente
  solo puede ver lo que lleva prefijo `VITE_` o lo que sirve `/api/config`.
- TypeScript estricto: sin `any`, sin `@ts-ignore`, sin `console.*`
  (usa `src/utils/logger.ts` / `server/logger.ts`).
- **No hagas `git commit`**: el repositorio lo gestiona una persona.
- **Solo toca los ficheros de tu área** (ver reparto abajo). Si necesitas
  tocar el área de otro agente, déjalo anotado en tu log y no lo hagas.
- Al terminar: escribe tu log en `docs/agentes/memoria/<NN>-<area>.md`
  (ver `docs/agentes/memoria/plantilla.md`) y actualiza el estado de tus
  tareas en `docs/agentes/tareas-semana-1.md`.

## Reparto de propiedad (semana 1)

| Área | Ficheros | Dueño |
| --- | --- | --- |
| Backend y datos | `server.ts`, `server/**`, `supabase/**`, `scripts/**` | agente-backend |
| Frontend y UX | `src/**` | agente-frontend |
| Verificación | nada (solo reporta) | agente-verificacion |

## Comandos útiles

| Comando | Para qué |
| --- | --- |
| `npm run dev` | API + Vite en `http://localhost:3000` |
| `npm run lint` / `typecheck` | tipos estrictos |
| `npm run test:ui` | test interactivo en jsdom (sin navegador) |
| `npm run verify:rls` | valida `supabase/schema.sql` en un Postgres desechable |
| `npm run db:setup` | aplica el esquema a Supabase (CREATE IF NOT EXISTS) |
| `npm run db:seed` | siembra los datos iniciales (idempotente) |
| `npm run cdn:upload` | sube imágenes a Cloudinary |
