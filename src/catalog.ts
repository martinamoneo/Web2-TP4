// ============================================================
// Servicio de catálogo — consulta a DummyJSON con timeout
// ============================================================

import { config } from './config.js';

export interface CatalogProduct {
  id: number;
  title: string;
  price: number;
  thumbnail: string;
}

export type CatalogResult =
  | { ok: true; product: CatalogProduct }
  | { ok: false; reason: 'not_found' | 'timeout' | 'fetch_error'; message: string };

/**
 * Consulta un producto del catálogo por id.
 * Respeta el timeout configurado y el delay de simulación.
 */
export async function fetchProduct(id: number): Promise<CatalogResult> {
  const params = new URLSearchParams();
  if (config.CATALOG_DELAY_MS > 0) {
    params.set('delay', String(config.CATALOG_DELAY_MS));
  }
  const qs = params.toString();
  const url = `${config.CATALOG_URL}/products/${id}${qs ? '?' + qs : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.CATALOG_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      if (res.status === 404) {
        return { ok: false, reason: 'not_found', message: `Producto ${id} no existe en el catálogo.` };
      }
      return { ok: false, reason: 'fetch_error', message: `Error del catálogo (HTTP ${res.status}) para producto ${id}.` };
    }

    const data = await res.json();

    // DummyJSON puede devolver 200 con mensaje de error para ids no encontrados
    if (data.message && typeof data.message === 'string' && data.message.includes('not found')) {
      return { ok: false, reason: 'not_found', message: `Producto ${id} no existe en el catálogo.` };
    }

    // Verificar que el producto tenga los campos necesarios
    if (!data.id || !data.title) {
      return { ok: false, reason: 'not_found', message: `Producto ${id} no existe en el catálogo.` };
    }

    return {
      ok: true,
      product: {
        id: data.id,
        title: data.title,
        price: data.price,
        thumbnail: data.thumbnail,
      },
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout', message: `El catálogo no respondió a tiempo para el producto ${id}.` };
    }
    return { ok: false, reason: 'fetch_error', message: `Error al consultar el catálogo para el producto ${id}.` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta varios productos en paralelo (simultáneamente).
 */
export async function fetchProducts(ids: number[]): Promise<Map<number, CatalogResult>> {
  const results = await Promise.all(ids.map(async (id) => [id, await fetchProduct(id)] as const));
  return new Map(results);
}
