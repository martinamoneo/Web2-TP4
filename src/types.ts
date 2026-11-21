// ============================================================
// Tipos compartidos: mensajes WebSocket y SSE
// ============================================================

// ---- Producto en la lista ----
export interface ListProduct {
  id: number;
  title: string;
  price: number;
  thumbnail: string;
  proposedBy: string;
  votes: string[];        // nombres de quienes votaron
}

// ---- Participante conectado ----
export interface Participant {
  name: string;
}

// ---- Estado completo de la lista ----
export interface ListState {
  products: ListProduct[];
  participants: Participant[];
}

// ============================================================
// Mensajes Cliente → Servidor (WebSocket)
// ============================================================

export interface JoinMessage {
  type: 'join';
  name: string;
}

export interface ProposeMessage {
  type: 'propose';
  productIds: number[];
}

export interface VoteMessage {
  type: 'vote';
  productId: number;
}

export interface UnvoteMessage {
  type: 'unvote';
  productId: number;
}

export interface RemoveMessage {
  type: 'remove';
  productId: number;
}

export type ClientMessage =
  | JoinMessage
  | ProposeMessage
  | VoteMessage
  | UnvoteMessage
  | RemoveMessage;

// ============================================================
// Mensajes Servidor → Cliente (WebSocket)
// ============================================================

export interface WelcomeResponse {
  type: 'welcome';
  state: ListState;
}

export interface ErrorResponse {
  type: 'error';
  message: string;
  details?: ProductError[];
}

export interface ProductError {
  productId: number;
  reason: 'not_found' | 'timeout' | 'already_in_list' | 'fetch_error';
  message: string;
}

export interface ProductsAddedEvent {
  type: 'products_added';
  products: ListProduct[];
}

export interface ProductRemovedEvent {
  type: 'product_removed';
  productId: number;
}

export interface VoteUpdatedEvent {
  type: 'vote_updated';
  productId: number;
  votes: string[];
}

export interface ParticipantsUpdatedEvent {
  type: 'participants_updated';
  participants: Participant[];
}

export type ServerMessage =
  | WelcomeResponse
  | ErrorResponse
  | ProductsAddedEvent
  | ProductRemovedEvent
  | VoteUpdatedEvent
  | ParticipantsUpdatedEvent;

// ============================================================
// Eventos SSE (Pantalla)
// ============================================================

export interface SSEFullState {
  event: 'full_state';
  data: ListState;
}

export interface SSEProductsAdded {
  event: 'products_added';
  data: { products: ListProduct[] };
}

export interface SSEProductRemoved {
  event: 'product_removed';
  data: { productId: number };
}

export interface SSEVoteUpdated {
  event: 'vote_updated';
  data: { productId: number; votes: string[] };
}

export interface SSEParticipantsUpdated {
  event: 'participants_updated';
  data: { participants: Participant[] };
}
