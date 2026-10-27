import {defineConfig} from '@playwright/test';
// Native transport tests use an explicitly supplied existing Bridge, not the web dev server.
export default defineConfig({testDir:'./ui',testMatch:'native-messaging-prototype.test.ts',timeout:45000,workers:1,reporter:'list',outputDir:'../.tmp/native-messaging-results'});
