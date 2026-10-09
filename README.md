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

## Instalar en la web (WordPress)

El archivo `wordpress/snippet-footer.html` es el widget completo, ya con la URL del backend puesta. No hay que subir ningún archivo:

1. Instala el plugin gratuito **WPCode**.
2. *Code Snippets → Add Snippet → Add Your Custom Code → HTML Snippet*.
3. Pega **todo** el contenido de `wordpress/snippet-footer.html` (incluidas las etiquetas `script`).
4. Ubicación: **Site Wide Footer**. Activa y guarda.
5. Abre la web en una ventana privada y comprueba que sale el botón del chat.

Para cambiar colores o título, añade atributos a la primera línea del bloque: `data-accent`, `data-ink`, `data-position` (`right`/`left`), `data-title`, `data-privacy-url`, `data-auto-open`. El widget se regenera con la cabecera del snippet (primera línea) + `widget/punto-de-fuga-chat.js` + cierre de la etiqueta.

Para abrir el chat desde un botón de la web: `PuntoDeFugaChat.open()`.

### Analítica (Meta Pixel / GA)

El widget lanza eventos en `window`: `pdf-chat:open`, `pdf-chat:message`, `pdf-chat:demo-click`, `pdf-chat:link`, `pdf-chat:error`. Ejemplo:

```js
window.addEventListener('pdf-chat:demo-click', () => fbq('track', 'Lead'));
```

## Backend (n8n)

El workflow **Punto de Fuga · Asistente virtual web** está **publicado**. URL: `https://lelesofia.app.n8n.cloud/webhook/punto-de-fuga-asistente`. CORS limitado a `puntodefugavr.site.je` y `www.puntodefugavr.site.je`.

Prueba rápida (desde tu ordenador):

```
curl -X POST https://lelesofia.app.n8n.cloud/webhook/punto-de-fuga-asistente -H 'Content-Type: application/json' -d '{"message":"¿Qué es Punto de Fuga?","sessionId":"test"}'
```

Es un endpoint público que llama a un modelo de pago. Ya limita el mensaje a 1000 caracteres, 700 tokens de salida y 4 iteraciones; el widget limita a 30 mensajes por conversación. Revisa las ejecuciones en n8n los primeros días; si hay abuso, añade límite de peticiones por IP (por ejemplo con Cloudflare) delante.

## Pendientes de negocio (de la pestaña *Pendientes* de la hoja)

Mientras estas filas estén en `Revisar` (PF-020/021 ya validadas: Plan Evento 49 €), el asistente **no** da el dato y deriva a una persona. Validarlas mejora mucho al bot:

- **PF-024** alcance del código BIENVENIDA50.
- **PF-016** nivel de verificación (documental para todos; in situ no siempre).
- **PF-010** ficha técnica descargable.
- **PF-030** email / teléfono / WhatsApp y horario de contacto.
