// ============================================================
// Estado en memoria de la lista compartida
// ============================================================

import type { ListProduct, ListState, Participant } from './types.js';

class Store {
  private products: Map<number, ListProduct> = new Map();

  /** Verifica si un producto ya está en la lista */
  hasProduct(id: number): boolean {
    return this.products.has(id);
  }

  /** Agrega un producto a la lista. Devuelve false si ya existía. */
  addProduct(product: ListProduct): boolean {
    if (this.products.has(product.id)) return false;
    this.products.set(product.id, product);
    return true;
  }

  /**
   * Quita un producto de la lista.
   * Regla: solo quien lo propuso puede quitarlo, O cualquiera si no tiene votos.
   * Devuelve { removed: true } si se quitó, o { removed: false, reason } si no.
   */
  removeProduct(id: number, requestedBy: string): { removed: boolean; reason?: string } {
    const product = this.products.get(id);
    if (!product) {
      return { removed: false, reason: 'El producto no está en la lista.' };
    }
    if (product.proposedBy !== requestedBy && product.votes.length > 0) {
      return { removed: false, reason: 'Solo quien propuso el producto puede quitarlo si tiene votos.' };
    }
    this.products.delete(id);
    return { removed: true };
  }

  /** Agrega un voto. Devuelve false si ya había votado. */
  vote(productId: number, voterName: string): { voted: boolean; votes?: string[]; reason?: string } {
    const product = this.products.get(productId);
    if (!product) {
      return { voted: false, reason: 'El producto no está en la lista.' };
    }
    if (product.votes.includes(voterName)) {
      return { voted: false, reason: 'Ya votaste este producto.' };
    }
    product.votes.push(voterName);
    return { voted: true, votes: [...product.votes] };
  }

  /** Retira un voto. Devuelve false si no había votado. */
  unvote(productId: number, voterName: string): { unvoted: boolean; votes?: string[]; reason?: string } {
    const product = this.products.get(productId);
    if (!product) {
      return { unvoted: false, reason: 'El producto no está en la lista.' };
    }
    const idx = product.votes.indexOf(voterName);
    if (idx === -1) {
      return { unvoted: false, reason: 'No habías votado este producto.' };
    }
    product.votes.splice(idx, 1);
    return { unvoted: true, votes: [...product.votes] };
  }

  /** Devuelve los productos ordenados por votos (descendente) */
  getProductsSorted(): ListProduct[] {
    return [...this.products.values()].sort((a, b) => b.votes.length - a.votes.length);
  }

  /** Devuelve el estado completo */
  getState(participants: Participant[]): ListState {
    return {
      products: this.getProductsSorted(),
      participants,
    };
  }
}

export const store = new Store();
