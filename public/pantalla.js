// ============================================================
// Cliente de la pantalla — Server-Sent Events
// ============================================================

/** @type {{ id: number, title: string, price: number, thumbnail: string, proposedBy: string, votes: string[] }[]} */
let products = [];
let participantCount = 0;

const productListDiv = document.getElementById('product-list');
const participantCountSpan = document.getElementById('participant-count');
const connectionStatus = document.getElementById('connection-status');

// ---- SSE ----

function connect() {
  const source = new EventSource('/events');

  source.addEventListener('full_state', (e) => {
    const data = JSON.parse(e.data);
    products = data.products;
    participantCount = data.participants.length;
    renderProducts();
    renderParticipantCount();
    setConnected(true);
  });

  source.addEventListener('products_added', (e) => {
    const data = JSON.parse(e.data);
    for (const p of data.products) {
      if (!products.find(x => x.id === p.id)) {
        products.push(p);
      }
    }
    sortProducts();
    renderProducts();
  });

  source.addEventListener('product_removed', (e) => {
    const data = JSON.parse(e.data);
    products = products.filter(p => p.id !== data.productId);
    renderProducts();
  });

  source.addEventListener('vote_updated', (e) => {
    const data = JSON.parse(e.data);
    const prod = products.find(p => p.id === data.productId);
    if (prod) {
      prod.votes = data.votes;
      sortProducts();
      renderProducts();
    }
  });

  source.addEventListener('participants_updated', (e) => {
    const data = JSON.parse(e.data);
    participantCount = data.participants.length;
    renderParticipantCount();
  });

  source.onerror = () => {
    setConnected(false);
  };

  source.onopen = () => {
    setConnected(true);
  };
}

// ---- Render ----

function sortProducts() {
  products.sort((a, b) => b.votes.length - a.votes.length);
}

function renderProducts() {
  sortProducts();
  if (products.length === 0) {
    productListDiv.innerHTML = '<p class="empty-message pantalla-empty">Esperando productos...</p>';
    return;
  }

  productListDiv.innerHTML = products.map((p, i) => `
    <div class="product-card" data-id="${p.id}">
      <div class="product-rank">#${i + 1}</div>
      <img class="product-img" src="${escapeHtml(p.thumbnail)}" alt="${escapeHtml(p.title)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect fill=%22%23333%22 width=%2264%22 height=%2264%22/><text x=%2232%22 y=%2236%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2214%22>?</text></svg>'">
      <div class="product-info">
        <div class="product-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</div>
        <div class="product-price">$${p.price.toFixed(2)}</div>
        <div class="product-proposer">Propuesto por ${escapeHtml(p.proposedBy)}</div>
      </div>
      <div class="product-actions">
        <div>
          <div class="vote-count">${p.votes.length}</div>
          <div class="vote-label">votos</div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderParticipantCount() {
  participantCountSpan.textContent = `${participantCount} participante${participantCount !== 1 ? 's' : ''} conectado${participantCount !== 1 ? 's' : ''}`;
}

function setConnected(connected) {
  connectionStatus.textContent = connected ? '● Conectado' : '● Desconectado';
  connectionStatus.className = `connection-status ${connected ? '' : 'disconnected'}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Iniciar ----
connect();
