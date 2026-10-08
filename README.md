# Asistente virtual de Punto de Fuga

Chat flotante para la web (https://puntodefugavr.site.je) que responde con la base de conocimiento del equipo y captura leads.

```
Web (widget JS)  ──POST {message, sessionId, page}──▶  n8n (webhook)  ──▶  Google Sheets (lee Base_conocimiento)
                 ◀────────── {reply} ───────────────        │             Claude (responde)
                                                            └──────────▶  Google Sheets (escribe en Leads)
```

| Carpeta | Contenido |
|---|---|
| `widget/punto-de-fuga-chat.js` | El chat. Un archivo, sin dependencias, aislado con Shadow DOM. |
| `widget/demo.html` | Página de prueba (usa `data-endpoint="mock"`, sin backend). |
| `n8n/asistente-web.workflow.ts` | Código fuente del workflow de n8n «Punto de Fuga · Asistente virtual web». |

## Cómo funciona el conocimiento

El workflow lee la pestaña **Base_conocimiento** de la hoja *Punto de Fuga · Base de conocimiento del asistente* en cada mensaje. Por eso, **editar la hoja actualiza el asistente al instante**, sin tocar código.

- Filas con `Estado = Validado` → el asistente las usa.
- Filas con `Estado = Revisar` → **no** se usan. Si alguien pregunta por ese tema, el asistente dice que lo confirma una persona y ofrece contacto.
- La columna `Fuente` (TFM, etc.) nunca se muestra al visitante.

Los leads se guardan en la pestaña **Leads** (`Canal = Web`, `Estado = Nuevo`), solo cuando la persona ha dado su conformidad.

## Instalar en la web

1. Sube `widget/punto-de-fuga-chat.js` al hosting (por ejemplo a `/wp-content/uploads/`) o pega su contenido dentro de un bloque `<script>` en el pie del sitio.
2. Añade en el pie de todas las páginas (en WordPress: plugin *WPCode* / *Insert Headers and Footers*, sección Footer):

```html
<script src="https://puntodefugavr.site.je/wp-content/uploads/punto-de-fuga-chat.js"
        data-endpoint="https://lelesofia.app.n8n.cloud/webhook/punto-de-fuga-asistente"
        data-demo-url="https://puntodefugavr.site.je/agendar-demo/"
        data-privacy-url="https://puntodefugavr.site.je/privacidad/"
        defer></script>
```

Opciones: `data-accent` (color principal), `data-ink` (color de cabecera), `data-position` (`right`/`left`), `data-title`, `data-auto-open`.

Para abrir el chat desde un botón de la web: `PuntoDeFugaChat.open()`.

### Analítica (Meta Pixel / GA)

El widget lanza eventos en `window`: `pdf-chat:open`, `pdf-chat:message`, `pdf-chat:demo-click`, `pdf-chat:link`, `pdf-chat:error`. Ejemplo:

```js
window.addEventListener('pdf-chat:demo-click', () => fbq('track', 'Lead'));
```

## Activar el backend (n8n)

El workflow está creado como **borrador, sin publicar**. Antes de publicarlo:

1. Restringe `allowedOrigins` del nodo *Mensaje desde la web* al dominio de la web (ahora está en `*`).
2. Publícalo. La URL de producción será `…/webhook/punto-de-fuga-asistente`.
3. Prueba con `curl -X POST <url> -H 'Content-Type: application/json' -d '{"message":"¿Qué es Punto de Fuga?","sessionId":"test"}'`.

Es un endpoint público que llama a un modelo de pago. Ya limita el mensaje a 1000 caracteres, 700 tokens de salida y 4 iteraciones; el widget limita a 30 mensajes por conversación. Si hay abuso, añade límite de peticiones por IP (Cloudflare) delante.

## Pendientes de negocio (de la pestaña *Pendientes* de la hoja)

Mientras estas filas estén en `Revisar`, el asistente **no** da el dato y deriva a una persona. Validarlas mejora mucho al bot:

- **PF-020 / PF-021** precio del Plan Evento (49 € vs 50 € por 3 locaciones).
- **PF-024** alcance del código BIENVENIDA50.
- **PF-016** nivel de verificación (documental para todos; in situ no siempre).
- **PF-010** ficha técnica descargable.
- **PF-030** email / teléfono / WhatsApp y horario de contacto.
