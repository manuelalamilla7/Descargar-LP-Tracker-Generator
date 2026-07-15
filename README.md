# LP Tracker Generator

Landing page estática que genera un único archivo JavaScript para:

- Capturar UTMs e identificadores publicitarios desde la URL.
- Guardarlos en `localStorage` bajo la clave `tracking_params`.
- Detectar formularios estáticos o cargados dinámicamente.
- Enviar todos los campos con atributo `name` a un webhook.
- Usar un webhook predeterminado o uno distinto por formulario.
- No interferir con el comportamiento existente cuando no hay Thank You Page.
- Redirigir opcionalmente a una Thank You Page.
- Disparar un único evento en `dataLayer` para Google Tag Manager.
- Copiar el JS completo o descargarlo como archivo.

## Ejecutar localmente

No requiere dependencias ni compilación.

```bash
python3 -m http.server 5500
```

Después abre:

```text
http://127.0.0.1:5500
```

También funciona con Live Server.

## Subir a GitHub

```bash
git init
git add .
git commit -m "Crea LP Tracker Generator"
git branch -M main
git remote add origin URL_DE_TU_REPOSITORIO
git push -u origin main
```

## Publicar en Vercel

1. Importa el repositorio desde Vercel.
2. Selecciona `Other` como framework.
3. No configures comando de build.
4. Publica.

## Uso del archivo generado

Guarda el archivo, por ejemplo, en:

```text
assets/js/lp-tracker.js
```

Agrégalo antes de cerrar el `head`:

```html
<script src="./assets/js/lp-tracker.js" defer></script>
```

Marca cada formulario:

```html
<form class="lead-form" data-lp-form-id="hero">
  <input name="nombre" required>
  <input name="correo" type="email" required>
</form>
```

Todo campo que deba enviarse al webhook necesita un atributo `name`.

## Opciones por formulario

Webhook diferente:

```html
data-lp-webhook="https://hooks.zapier.com/hooks/catch/..."
```

Thank You Page diferente:

```html
data-lp-redirect="thankyou.html"
```

Desactivar un redirect global:

```html
data-lp-redirect="none"
```

Ignorar un formulario:

```html
data-lp-ignore="true"
```

## Evento de Google Tag Manager

El archivo generado publica un objeto como este:

```javascript
{
  event: "lp_lead_submit",
  lead_id: "uuid",
  form_id: "hero",
  form_origin: "hero",
  page_path: "/index.html",
  utm_source: "facebook",
  utm_medium: "paid_social",
  utm_campaign: "campana"
}
```

No manda nombre, correo, teléfono ni respuestas personales al `dataLayer`.

En Google Tag Manager crea un activador de tipo **Evento personalizado** y utiliza el mismo nombre configurado en el generador.

## Nota sobre webhooks directos

Con Zapier directo desde el navegador, el script puede confirmar que la solicitud fue despachada, pero no leer un HTTP `200` debido a las restricciones CORS habituales. Por eso el evento representa el envío del formulario, no una confirmación interna de procesamiento en Zapier.
