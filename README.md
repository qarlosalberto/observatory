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
