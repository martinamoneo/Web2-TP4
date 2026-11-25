// ============================================================
// Generador automático de evidencia completa (Capturas + GIF)
// ============================================================
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import puppeteer from 'puppeteer';
import { spawn, execSync } from 'node:child_process';
import { createCanvas, loadImage } from 'canvas';
import GIFEncoder from 'gif-encoder-2';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const BASE = 'http://localhost:3000';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function killPort3000() {
  try {
    execSync('powershell -Command "try { Get-NetTCPConnection -LocalPort 3000 -ErrorAction Stop | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } } catch { exit 0 }"', { stdio: 'ignore' });
  } catch {}
}

async function waitForServer(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${BASE}/pantalla`);
      if (res.ok) return true;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Servidor no respondió en ${timeout}ms`);
}

function startServer(envExtra = {}) {
  killPort3000();
  const child = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: ROOT,
    shell: true,
    env: { ...process.env, NODE_OPTIONS: '--dns-result-order=ipv4first', ...envExtra },
    stdio: 'ignore',
  });
  return child;
}

async function capture(page, name) {
  await page.bringToFront();
  await sleep(350);
  const outPath = path.join(DOCS, name);
  await page.screenshot({ path: outPath });
  console.log(`  ✅ ${name}`);
}

async function main() {
  if (!fs.existsSync(DOCS)) fs.mkdirSync(DOCS, { recursive: true });
  console.log('Directorio docs:', DOCS);

  // ============================================================
  // FASE 1: Servidor Normal (delay = 0)
  // ============================================================
  console.log('\n🚀 Iniciando servidor para Fase 1 (delay = 0)...');
  let server = startServer({ CATALOG_DELAY_MS: '0' });
  await waitForServer();
  console.log('✅ Servidor listo.');

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60000,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  console.log('\n📸 Capturando flujo con 3 participantes y pantalla...');
  const pantalla = await browser.newPage();
  await pantalla.goto(`${BASE}/pantalla`, { waitUntil: 'domcontentloaded' });
  await sleep(600);
  await capture(pantalla, '01-pantalla-vacia.png');

  // Martina se une
  const p1 = await browser.newPage();
  await p1.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(400);
  await p1.evaluate(() => {
    document.querySelector('#name-input').value = 'Martina';
    joinRoom();
  });
  await sleep(800);
  await capture(p1, '02-martina-unida.png');

  // Lucas se une
  const p2 = await browser.newPage();
  await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(400);
  await p2.evaluate(() => {
    document.querySelector('#name-input').value = 'Lucas';
    joinRoom();
  });
  await sleep(800);
  await capture(p2, '03-lucas-unido.png');

  // Sofi se une
  const p3 = await browser.newPage();
  await p3.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(400);
  await p3.evaluate(() => {
    document.querySelector('#name-input').value = 'Sofi';
    joinRoom();
  });
  await sleep(800);
  await capture(pantalla, '04-pantalla-3-participantes.png');

  // Martina propone productos 1, 2, 3
  await p1.evaluate(() => {
    document.querySelector('#product-ids-input').value = '1, 2, 3';
    proposeProducts();
  });
  await sleep(2000);
  await capture(p1, '05-martina-propuso.png');

  // Pantalla con productos
  await capture(pantalla, '06-pantalla-con-productos.png');

  // Lucas ve los productos en tiempo real
  await capture(p2, '07-lucas-ve-productos.png');

  // Lucas vota producto #1
  await p2.evaluate(() => { voteProduct(1); });
  await sleep(600);
  await capture(p2, '08-lucas-voto.png');

  // Sofi y Martina votan producto #2 (pasa al primer lugar)
  await p3.evaluate(() => { voteProduct(2); });
  await sleep(400);
  await p1.evaluate(() => { voteProduct(2); });
  await sleep(700);
  await capture(pantalla, '09-pantalla-ranking-actualizado.png');

  // Sofi cierra pestaña -> Pantalla refleja desconexión
  await p3.close();
  await sleep(800);
  await capture(pantalla, '10-pantalla-sofi-se-fue.png');

  // Fallos parciales: Martina propone 4 (válido), 99999 (no existe), 1 (ya en lista)
  console.log('\n📸 Capturando propuesta con fallos parciales...');
  await p1.evaluate(() => {
    document.querySelector('#product-ids-input').value = '4, 99999, 1';
    proposeProducts();
  });
  await sleep(2500);
  await capture(p1, '11-fallos-parciales.png');

  // Lucas ve producto 4 agregado, pero NO ve los errores ajenos
  await capture(p2, '12-lucas-no-ve-errores.png');

  // Mensajes inválidos desde consola: texto plano (no es JSON)
  console.log('\n📸 Capturando respuestas a mensajes inválidos...');
  await p2.evaluate(() => { ws.send('esto no es un JSON'); });
  await sleep(600);
  await capture(p2, '13-mensaje-invalido-no-json.png');

  // Tipo desconocido
  await p2.evaluate(() => { ws.send(JSON.stringify({ type: 'accion_desconocida', val: 99 })); });
  await sleep(600);
  await capture(p2, '14-mensaje-tipo-desconocido.png');

  // Servidor sigue vivo y funcional (Lucas vota producto 3)
  await p2.evaluate(() => { voteProduct(3); });
  await sleep(600);
  await capture(p2, '15-servidor-sigue-vivo.png');

  await browser.close();
  killPort3000();

  // ============================================================
  // FASE 2: Servidor con Catálogo Lento (delay = 3000ms)
  // ============================================================
  console.log('\n🚀 Iniciando servidor para Fase 2 (CATALOG_DELAY_MS = 3000)...');
  server = startServer({ CATALOG_DELAY_MS: '3000' });
  await waitForServer();
  console.log('✅ Servidor con delay listo.');

  const browserSlow = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60000,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const slowMartina = await browserSlow.newPage();
  const slowLucas = await browserSlow.newPage();

  await slowMartina.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(400);
  await slowMartina.evaluate(() => {
    document.querySelector('#name-input').value = 'Martina';
    joinRoom();
  });
  await sleep(800);

  await slowLucas.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(400);
  await slowLucas.evaluate(() => {
    document.querySelector('#name-input').value = 'Lucas';
    joinRoom();
  });
  await sleep(800);

  // Martina propone productos 5, 6 con delay de 3s
  console.log('\n📸 Capturando comportamiento con catálogo lento...');
  await slowMartina.evaluate(() => {
    document.querySelector('#product-ids-input').value = '5, 6';
    proposeProducts();
  });
  await sleep(400); // estado esperando activo
  await capture(slowMartina, '16-catalogo-lento-esperando.png');

  // Lucas usa la app normalmente mientras Martina espera
  await capture(slowLucas, '17-catalogo-lento-lucas-usa-app.png');

  // Esperar a que lleguen los productos del catálogo
  await sleep(4000);
  await capture(slowMartina, '18-catalogo-lento-productos-llegaron.png');

  await browserSlow.close();
  killPort3000();

  // ============================================================
  // FASE 3: Generación de GIF animado optimizado
  // ============================================================
  console.log('\n🎬 Generando demo.gif optimizado (800x500)...');

  const GIF_FRAMES = [
    '01-pantalla-vacia.png',
    '02-martina-unida.png',
    '04-pantalla-3-participantes.png',
    '05-martina-propuso.png',
    '06-pantalla-con-productos.png',
    '08-lucas-voto.png',
    '09-pantalla-ranking-actualizado.png',
    '10-pantalla-sofi-se-fue.png',
    '11-fallos-parciales.png',
    '14-mensaje-tipo-desconocido.png',
    '15-servidor-sigue-vivo.png',
    '16-catalogo-lento-esperando.png',
    '18-catalogo-lento-productos-llegaron.png',
  ];

  const targetWidth = 800;
  const targetHeight = 500;
  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');

  const encoder = new GIFEncoder(targetWidth, targetHeight, 'neuquant', false);
  encoder.setDelay(2200); // 2.2 segundos por frame
  encoder.setRepeat(0);   // loop infinito
  encoder.setQuality(15);
  encoder.start();

  for (const frameName of GIF_FRAMES) {
    const filePath = path.join(DOCS, frameName);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠️ Saltando ${frameName} (no encontrado)`);
      continue;
    }
    const img = await loadImage(filePath);
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    encoder.addFrame(ctx);
    console.log(`  ➕ Frame agregado: ${frameName}`);
  }

  encoder.finish();
  const gifBuffer = encoder.out.getData();
  const gifPath = path.join(DOCS, 'demo.gif');
  fs.writeFileSync(gifPath, gifBuffer);

  const gifSizeMb = (gifBuffer.length / (1024 * 1024)).toFixed(2);
  console.log(`\n🎉 demo.gif generado con éxito: ${gifPath} (${gifSizeMb} MB)`);

  // Resumen final de archivos
  const allFiles = fs.readdirSync(DOCS).sort();
  console.log(`\n📁 Total de archivos generados en docs/ (${allFiles.length}):`);
  allFiles.forEach(f => {
    const sz = (fs.statSync(path.join(DOCS, f)).size / 1024).toFixed(0);
    console.log(`   - ${f} (${sz} KB)`);
  });
}

main().catch(err => {
  console.error('\n❌ Error en generación de evidencia:', err);
  killPort3000();
  process.exit(1);
});
