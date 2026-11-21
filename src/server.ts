// ============================================================
// Servidor principal: HTTP + WebSocket + SSE
// ============================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config.js';
import { store } from './store.js';
import { validateMessage } from './validation.js';
import { fetchProducts } from './catalog.js';
import type {
  ListProduct, Participant,
  ServerMessage, ProductError,
} from './types.js';

// ---- Estado de conexiones ----

interface ConnectedParticipant {
  ws: WebSocket;
  name: string;
}

const participants = new Map<WebSocket, ConnectedParticipant>();
const sseClients = new Set<http.ServerResponse>();

// ---- Helpers de envío ----

function sendTo(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(msg: ServerMessage, exclude?: WebSocket): void {
  for (const [ws] of participants) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

function sseEvent(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

function getParticipantsList(): Participant[] {
  return [...participants.values()].map(p => ({ name: p.name }));
}

function broadcastParticipants(): void {
  const list = getParticipantsList();
  const msg: ServerMessage = { type: 'participants_updated', participants: list };
  broadcast(msg);
  sseEvent('participants_updated', { participants: list });
}

// ---- Servir archivos estáticos ----

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const publicDir = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '..', 'public');

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  let urlPath = req.url ?? '/';

  // Rutas principales
  if (urlPath === '/' || urlPath === '/index.html') urlPath = '/participante.html';
  if (urlPath === '/pantalla') urlPath = '/pantalla.html';

  // SSE endpoint
  if (urlPath === '/events') {
    handleSSE(req, res);
    return;
  }

  const filePath = path.join(publicDir, urlPath);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ---- SSE ----

function handleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Enviar estado completo al conectar
  const state = store.getState(getParticipantsList());
  res.write(`event: full_state\ndata: ${JSON.stringify(state)}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
}

// ---- Servidor HTTP ----

const server = http.createServer(serveStatic);

// ---- WebSocket ----

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] Nueva conexión');

  ws.on('message', async (rawData: Buffer | string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData.toString());
    } catch {
      sendTo(ws, { type: 'error', message: 'El mensaje no es JSON válido.' });
      return;
    }

    const validation = validateMessage(parsed);
    if (!validation.valid) {
      sendTo(ws, { type: 'error', message: validation.error });
      return;
    }

    const msg = validation.message;

    // ---- JOIN ----
    if (msg.type === 'join') {
      // ¿Ya se unió este WebSocket?
      if (participants.has(ws)) {
        sendTo(ws, { type: 'error', message: 'Ya te uniste a la lista.' });
        return;
      }

      // ¿Nombre repetido?
      const nameInUse = [...participants.values()].some(p => p.name === msg.name);
      if (nameInUse) {
        sendTo(ws, { type: 'error', message: `El nombre "${msg.name}" ya está en uso. Elegí otro.` });
        return;
      }

      participants.set(ws, { ws, name: msg.name });
      console.log(`[WS] ${msg.name} se unió`);

      // Enviar estado completo
      const state = store.getState(getParticipantsList());
      sendTo(ws, { type: 'welcome', state });

      // Notificar a todos los demás
      broadcastParticipants();
      return;
    }

    // ---- A partir de aquí el participante debe haberse unido ----
    const participant = participants.get(ws);
    if (!participant) {
      sendTo(ws, { type: 'error', message: 'Primero debes unirte con un mensaje "join".' });
      return;
    }

    // ---- PROPOSE ----
    if (msg.type === 'propose') {
      // Consultar catálogo en paralelo (no bloquea a los demás)
      const results = await fetchProducts(msg.productIds);

      const added: ListProduct[] = [];
      const errors: ProductError[] = [];

      for (const [id, result] of results) {
        if (!result.ok) {
          errors.push({ productId: id, reason: result.reason, message: result.message });
          continue;
        }

        // ¿Ya está en la lista? (doble check para concurrencia)
        if (store.hasProduct(id)) {
          errors.push({ productId: id, reason: 'already_in_list', message: `El producto "${result.product.title}" ya está en la lista.` });
          continue;
        }

        const listProduct: ListProduct = {
          ...result.product,
          proposedBy: participant.name,
          votes: [],
        };

        const ok = store.addProduct(listProduct);
        if (ok) {
          added.push(listProduct);
        } else {
          errors.push({ productId: id, reason: 'already_in_list', message: `El producto "${result.product.title}" ya está en la lista.` });
        }
      }

      // Notificar solo a quien propuso de los errores
      if (errors.length > 0) {
        sendTo(ws, {
          type: 'error',
          message: `Algunos productos no se pudieron agregar.`,
          details: errors,
        });
      }

      // Notificar a todos de los que sí se agregaron
      if (added.length > 0) {
        const addedMsg: ServerMessage = { type: 'products_added', products: added };
        broadcast(addedMsg);
        sseEvent('products_added', { products: added });
      }

      return;
    }

    // ---- VOTE ----
    if (msg.type === 'vote') {
      const result = store.vote(msg.productId, participant.name);
      if (!result.voted) {
        sendTo(ws, { type: 'error', message: result.reason! });
        return;
      }
      const voteMsg: ServerMessage = { type: 'vote_updated', productId: msg.productId, votes: result.votes! };
      broadcast(voteMsg);
      sseEvent('vote_updated', { productId: msg.productId, votes: result.votes! });
      return;
    }

    // ---- UNVOTE ----
    if (msg.type === 'unvote') {
      const result = store.unvote(msg.productId, participant.name);
      if (!result.unvoted) {
        sendTo(ws, { type: 'error', message: result.reason! });
        return;
      }
      const voteMsg: ServerMessage = { type: 'vote_updated', productId: msg.productId, votes: result.votes! };
      broadcast(voteMsg);
      sseEvent('vote_updated', { productId: msg.productId, votes: result.votes! });
      return;
    }

    // ---- REMOVE ----
    if (msg.type === 'remove') {
      const result = store.removeProduct(msg.productId, participant.name);
      if (!result.removed) {
        sendTo(ws, { type: 'error', message: result.reason! });
        return;
      }
      const removeMsg: ServerMessage = { type: 'product_removed', productId: msg.productId };
      broadcast(removeMsg);
      sseEvent('product_removed', { productId: msg.productId });
      return;
    }
  });

  ws.on('close', () => {
    const participant = participants.get(ws);
    if (participant) {
      console.log(`[WS] ${participant.name} se desconectó`);
      participants.delete(ws);
      broadcastParticipants();
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    participants.delete(ws);
  });
});

// ---- Iniciar servidor ----

server.listen(config.PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${config.PORT}`);
  console.log(`   📋 Participante: http://localhost:${config.PORT}/`);
  console.log(`   📺 Pantalla:     http://localhost:${config.PORT}/pantalla`);
  console.log(`\n⚙️  Configuración:`);
  console.log(`   Catálogo:        ${config.CATALOG_URL}`);
  console.log(`   Timeout:         ${config.CATALOG_TIMEOUT_MS} ms`);
  console.log(`   Delay simulado:  ${config.CATALOG_DELAY_MS} ms`);
  console.log('');
});
