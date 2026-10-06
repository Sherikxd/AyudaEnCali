# AyudaEnCali — documentación para personas

Esta carpeta explica el proyecto **sin jerga innecesaria**, pensada para que
cualquier persona (técnicas, colaboradores o alguien que llega por primera
vez) entienda cómo funciona.

| Fichero | Responde a la pregunta |
| --- | --- |
| [`01-flujo-app.md`](01-flujo-app.md) | **¿Qué ve y qué hace una persona al usar la app?** Pestañas, registro, reportes, chat y qué pasa si se cae internet o la base de datos. |
| [`02-flujo-despliegue.md`](02-flujo-despliegue.md) | **¿Cómo pasa el código de mi ordenador a producción?** Desarrollo local, pruebas, integración continua y los tres caminos de despliegue. |
| [`03-tecnologia-infraestructura.md`](03-tecnologia-infraestructura.md) | **¿Con qué está hecha y dónde vive?** Lenguajes, servicios externos (Supabase, Clerk, Gemini…), bases de datos, seguridad y rendimiento. |

## Resumen en 30 segundos

**AyudaEnCali** es una plataforma comunitaria de emergencias para Santiago de
Cali. Cualquier persona puede consultar un mapa con centros de ayuda
(acopio, veterinarias, albergues, salud), publicar lo que su barrio necesita,
apoyar a otros con un «me gusta» y preguntar a un asistente de IA.

- **Frontend:** React + TypeScript, servido como página estática.
- **Backend:** una API que corre en Node (Express) o, en producción, como
  funciones sueltas en Vercel.
- **Base de datos:** PostgreSQL alojado en Supabase.
- **Identidad:** cuentas de usuario con Clerk.
- **Producción:** [https://ayuda-en-cali.vercel.app](https://ayuda-en-cali.vercel.app)
  (redirige a `https://www.ayudaencali.lat`).

Lectura sugerida: empieza por el **flujo de la app**, luego **despliegue** y
deja la **infraestructura** para cuando quieras el detalle técnico.

> Esta carpeta es documentación legible. El detalle operativo (tareas,
> decisiones, logs de agentes) sigue en [`../agentes/`](../agentes/README.md)
> y la referencia completa en el [`README.md`](../../README.md) de la raíz.
