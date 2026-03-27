import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createFileStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const app = createApp(createFileStore());
const port = Number(process.env.PORT || 3001);

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api')) {
      next();
      return;
    }
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Tapau GTM API listening on http://0.0.0.0:${port}`);
});
