# Separación de My Places y Observatory

## Observatory
- Sitio público independiente en `site/`: mapa Leaflet, llegadas por línea de autobús, disponibilidad Bizi y estadísticas Chart.js.
- `site/data.js`: parsers de las APIs y cálculos estadísticos separados de la interfaz.
- Sin Firebase, datos privados ni autentificación.
- `tests/unit.test.mjs`: cinco pruebas unitarias de formato de predicciones y recuentos.
- `tests/observatory.e2e.spec.mjs`: cinco pruebas de navegador para móviles.
- `.github/workflows/ci-pages.yml`: primero tests, después despliegue estático de `site/` a GitHub Pages.

## My Places
En el repositorio `qarlosalberto/my-places` se han quitado el botón, el panel, el código JavaScript, los estilos y la integración de pruebas específicos de Services. Se mantienen las vistas Map y List, Firebase, fotos, CSV y PDF.

## Puesta en marcha de Pages
En el repositorio nuevo abre **Settings → Pages → Build and deployment → Source → GitHub Actions**. El workflow no puede habilitar por sí solo un Pages inexistente usando el `GITHUB_TOKEN` predeterminado. Después verifica en **Actions** que el trabajo de tests y deploy finaliza correctamente.

## Interpretación
Las métricas son una instantánea de lo consultado. No hay un histórico persistido. Una espera >15 min no equivale a retraso respecto al horario, y la falta de datos de averías no significa cero unidades averiadas.
