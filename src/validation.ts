// ============================================================
// Validación de mensajes del cliente
// ============================================================

import type { ClientMessage } from './types.js';
import { config } from './config.js';

export function validateMessage(raw: unknown): { valid: true; message: ClientMessage } | { valid: false; error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, error: 'El mensaje debe ser un objeto JSON.' };
  }

  const msg = raw as Record<string, unknown>;

  if (!('type' in msg) || typeof msg.type !== 'string') {
    return { valid: false, error: 'El mensaje debe tener un campo "type" de tipo string.' };
  }

  switch (msg.type) {
    case 'join': {
      if (typeof msg.name !== 'string') {
        return { valid: false, error: 'El mensaje "join" requiere un campo "name" de tipo string.' };
      }
      const name = msg.name.trim();
      if (name.length < config.MIN_NAME_LENGTH) {
        return { valid: false, error: `El nombre no puede estar vacío.` };
      }
      if (name.length > config.MAX_NAME_LENGTH) {
        return { valid: false, error: `El nombre no puede tener más de ${config.MAX_NAME_LENGTH} caracteres.` };
      }
      return { valid: true, message: { type: 'join', name } };
    }

    case 'propose': {
      if (!Array.isArray(msg.productIds)) {
        return { valid: false, error: 'El mensaje "propose" requiere un campo "productIds" de tipo array.' };
      }
      if (msg.productIds.length === 0) {
        return { valid: false, error: 'Debes proponer al menos un producto.' };
      }
      if (msg.productIds.length > config.MAX_PRODUCTS_PER_PROPOSE) {
        return { valid: false, error: `No puedes proponer más de ${config.MAX_PRODUCTS_PER_PROPOSE} productos a la vez.` };
      }
      if (!msg.productIds.every((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
        return { valid: false, error: 'Todos los ids deben ser enteros positivos.' };
      }
      return { valid: true, message: { type: 'propose', productIds: msg.productIds as number[] } };
    }

    case 'vote':
    case 'unvote':
    case 'remove': {
      if (typeof msg.productId !== 'number' || !Number.isInteger(msg.productId) || msg.productId <= 0) {
        return { valid: false, error: `El mensaje "${msg.type}" requiere un campo "productId" entero positivo.` };
      }
      return { valid: true, message: { type: msg.type, productId: msg.productId } as ClientMessage };
    }

    default:
      return { valid: false, error: `Tipo de mensaje desconocido: "${msg.type}".` };
  }
}
