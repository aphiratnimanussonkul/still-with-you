import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const useMsw = process.env.VITE_USE_MSW === 'true';
const worker = path.join(dist, 'mockServiceWorker.js');
const sw = path.join(dist, 'sw.js');
const manifest = path.join(dist, 'manifest.webmanifest');

if (!fs.existsSync(worker)) {
  console.error('dist/mockServiceWorker.js is missing');
  process.exit(1);
}

const workerText = fs.readFileSync(worker, 'utf8');
if (workerText.includes('<!DOCTYPE html>') || !workerText.includes('Mock Service Worker')) {
  console.error('dist/mockServiceWorker.js is not the MSW worker script');
  process.exit(1);
}

if (!fs.existsSync(sw)) {
  console.error('dist/sw.js is missing');
  process.exit(1);
}

const swText = fs.readFileSync(sw, 'utf8');
if (swText.includes('<!DOCTYPE html>')) {
  console.error('dist/sw.js is HTML, not JavaScript');
  process.exit(1);
}

if (useMsw) {
  if (fs.existsSync(manifest)) {
    console.error('MSW build must not emit manifest.webmanifest');
    process.exit(1);
  }
  if (swText.includes('precacheAndRoute') || swText.includes('workbox')) {
    console.error('MSW build must not emit a Workbox sw.js');
    process.exit(1);
  }
  if (!swText.includes('unregister')) {
    console.error('MSW build sw.js must be the tombstone that unregisters itself');
    process.exit(1);
  }
}

console.log(`dist OK (VITE_USE_MSW=${useMsw})`);
