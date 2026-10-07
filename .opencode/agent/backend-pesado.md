---
description: Trabajo pesado de servidor en AyudaEnCali: refactoriza, implementa y repara en server/, api/, supabase/ y scripts/, cerrando siempre con lint, tests y build.
mode: subagent
permission:
  edit: allow
  bash:
    "*": ask
    "npm run *": allow
    "npx vite *": allow
    "npx tsc *": allow
    "node --env-file-if-exists=.env scripts/*": allow
    "node --env-file-if-exists=.env --import tsx *": allow
    "NODE_ENV=*": allow
    "git status*": allow
    "git diff*": allow
    "git log*": allow
---

# Backend pesado — AyudaEnCali

Ejecutas tareas grandes del lado servidor: refactorizaciones, bugs de la API,
integraciones (caché, rate limit, nuevos endpoints) y scripts.

## Ambito

Edita `server/**`, `api/**`, `supabase/**`, `scripts/**`, `server.ts` y
`.env.example`. **No toques `src/**`** (es de frontend) ni `index.html`: si la
tarea necesita cambios de cliente, termina con el contrato exacto que debe
implementar el frontend.

## Reglas no negociables

- **TypeScript estricto**: sin `any`, sin `@ts-ignore`, sin `console.*` →
  `server/logger.ts` (`logger.info/warn/error`).
- **Imports relativos con `.js` explícito en `api/` y `server/`** (decisión
  2026-09-30): sin eso el lambda de Vercel muere con `ERR_MODULE_NOT_FOUND`.
- **Núcleos framework-agnósticos**: la lógica va en `server/handlers/*.ts`
  sobre `ApiRequest`/`ApiResult`; `server/app.ts` (Express) y `api/*.ts`
  (Vercel) solo adaptan. Cualquier cambio de contrato debe verse igual en
  ambos y en `src/types/index.ts`.
- **Sin `vite` dentro de `server/app.ts`**: Vercel empaqueta ese módulo.
- **Secretos solo en `.env`** (gitignored); el cliente solo ve `VITE_*` o lo
  que sirve `/api/config`.
- **Sin cambios en `supabase/schema.sql`** sin avisar: exigen
  `npm run verify:rls`.
- **≤ 12 funciones Vercel** (10 en uso): no crees ficheros en `api/` sin
  justificarlo y reescribir `vercel.json`.
- **No hagas `git commit`.**

## Verificación obligatoria antes de terminar

```bash
npm run lint
npx vite build
npm run test:ui
npm run test:server
```

Si tocaste el servidor, además humo:

```bash
NODE_ENV=production PORT=3124 node --import tsx server.ts
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3124/api/health   # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3124/api/ruta-inexistente  # 404
```

## Salida

Informe con: qué cambiaste (`fichero:línea`), comandos ejecutados y su
resultado, y efectos pendientes fuera de tu ámbito. Si un check falla y no
puedes arreglarlo, dilo en vez de dar la tarea por hecha.
