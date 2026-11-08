# Observatory — Zaragoza

Observatorio independiente de servicios públicos de Zaragoza: tiempos de próxima llegada por línea y disponibilidad Bizi, con estadísticas Chart.js y mapa Leaflet.

**Sitio previsto:** https://qarlosalberto.github.io/observatory/

## Ejecutar localmente
```sh
npm install
python3 -m http.server 4173 --directory site
npm test
npm run test:e2e
```

El workflow de GitHub Actions comprueba unitarias y E2E antes del despliegue a GitHub Pages. Configura **Settings → Pages → Build and deployment → GitHub Actions** si todavía no está seleccionado.

Las estadísticas reflejan instantáneas del estado recibido en la sesión. **Más de 15 minutos de espera no demuestra retraso respecto al horario**. Las averías de Bizi solo cuentan cuando el proveedor entrega ese dato, y los errores/tiempos desconocidos no se equiparan con cero.

My Places mantiene en su propio repositorio la gestión de lugares personales.

## Histórico automático
El workflow `.github/workflows/history.yml` intenta recoger datos cada 30 minutos (minutos 07 y 37 UTC) y admite ejecución manual desde GitHub Actions. El script `scripts/capture-history.mjs` escribe instantáneas en `site/history/snapshots.json`, que se conservan durante 90 días. Requiere permisos de escritura del `GITHUB_TOKEN` para guardar los commits en `main`; la programación de GitHub Actions puede sufrir retrasos o suspensiones.

Bizi: número de estaciones con disponibilidad conocida, vacías, bicicletas disponibles y unidades deshabilitadas cuando la fuente lo informa. Autobús: muestra rotatoria de hasta 60 paradas por ejecución, con predicciones conocidas, respuestas sin predicción, errores y esperas superiores a 15 minutos. **No es un censo completo de paradas ni una medición de puntualidad**. Los fallos de API no se consideran fallos del servicio. Los porcentajes de autobús se calculan sobre predicciones conocidas; no se deben comparar muestras sin comprobar su cobertura.

Para ejecutar manualmente desde una copia local: `node scripts/capture-history.mjs`. El histórico empieza vacío hasta que se ejecute una captura válida.
