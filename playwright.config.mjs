import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'**/*.e2e.spec.mjs',timeout:60000,
 expect:{timeout:20000},
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'mobile',use:{...devices['Pixel 7']}},{name:'small-mobile',use:{...devices['Pixel 5'],viewport:{width:320,height:720}}}],
 webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1 --directory site',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:30000}
});
