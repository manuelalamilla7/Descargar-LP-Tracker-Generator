# LP Tracker Auto Setup V1

Esta entrega agrega una página nueva al proyecto existente sin reemplazar `index.html`, `app.js` ni `styles.css`.

## Archivos que debes subir a la raíz del repositorio

- `auto-setup.html`
- `auto-setup.css`
- `auto-setup.js`

Después del deploy podrás abrir:

`https://tracker-generator.vercel.app/auto-setup.html`

## Qué hace

1. Acepta un repositorio público de GitHub, un ZIP o una carpeta local.
2. Lee todos los archivos del proyecto en el navegador.
3. Busca archivos `.html`.
4. Busca todos los `<form>` dentro de esos HTML.
5. Agrega `lead-form`.
6. Agrega `data-lp-form-id` y `data-lp-form-origin` cuando faltan.
7. Agrega `name` a `input`, `select` y `textarea` cuando falta.
8. Genera `assets/js/lp-tracker.js` con el webhook, GTM y redirect configurados.
9. Inserta el `<script>` correcto en cada HTML, calculando la ruta relativa según la carpeta del archivo.
10. Descarga un ZIP nuevo con el proyecto completo preparado.

## Dependencia

`auto-setup.html` carga JSZip 3.10.1 desde jsDelivr para leer y crear ZIPs desde el navegador.

## Alcance de esta V1

Está diseñada para landing pages de HTML/CSS/JavaScript estático.

Si detecta `.jsx`, `.tsx`, `.vue`, `.svelte` o `.astro`, los conserva pero no modifica formularios definidos dentro de esos componentes. Eso sería la siguiente fase con transformadores específicos por framework.

## Opcional: enlace desde el menú principal

Si quieres enlazar la nueva pantalla desde `index.html`, dentro de `<nav class="topbar-nav">` agrega:

```html
<a class="topbar-link" href="./auto-setup.html">Automatizar landing</a>
```

No es obligatorio. La pantalla funciona directamente visitando `/auto-setup.html`.
