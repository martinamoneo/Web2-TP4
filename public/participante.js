// ============================================================
// Cliente del participante — WebSocket
// ============================================================

/** @type {WebSocket | null} */
let ws = null;
let myName = '';

/** @type {{ id: number, title: string, price: number, thumbnail: string, proposedBy: string, votes: string[] }[]} */
let products = [];

/** @type {{ name: string }[]} */
let participantsList = [];

// ---- DOM ----
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const nameInput = document.getElementById('name-input');
const loginError = document.getElementById('login-error');
const userNameSpan = document.getElementById('user-name');
const participantCountSpan = document.getElementById('participant-count');
const participantsUl = document.getElementById('participants-list');
const productListDiv = document.getElementById('product-list');
const productIdsInput = document.getElementById('product-ids-input');
const proposeStatus = document.getElementById('propose-status');
const notificationsDiv = document.getElementById('notifications');

// ---- Conexión ----

function joinRoom() {
  const name = nameInput.value.trim();
  if (!name) {
    loginError.textContent = 'Ingresá un nombre.';
    return;
  }
  if (name.length > 30) {
    loginError.textContent = 'El nombre no puede tener más de 30 caracteres.';
    return;
  }

  loginError.textContent = '';
  myName = name;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', name: myName }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    showNotification('Conexión cerrada. Recargá la página.', 'error');
  };

  ws.onerror = () => {
    loginError.textContent = 'Error de conexión.';
  };
}

// Enter para unirse
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});

// ---- Manejar mensajes ----

function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      products = msg.state.products;
      participantsList = msg.state.participants;
      showMainScreen();
      renderProducts();
      renderParticipants();
      break;

    case 'products_added':
      for (const p of msg.products) {
        if (!products.find(x => x.id === p.id)) {
          products.push(p);
        }
      }
      sortProducts();
      renderProducts();
      showNotification(`Se agregaron ${msg.products.length} producto(s).`, 'info');
      break;

    case 'product_removed':
      products = products.filter(p => p.id !== msg.productId);
      renderProducts();
      break;

    case 'vote_updated':
      const prod = products.find(p => p.id === msg.productId);
      if (prod) {
        prod.votes = msg.votes;
        sortProducts();
        renderProducts();
      }
      break;

    case 'participants_updated':
      participantsList = msg.participants;
      renderParticipants();
      break;

    case 'error':
      if (loginScreen && !loginScreen.classList.contains('hidden')) {
        // Error durante login
        loginError.textContent = msg.message;
        if (ws) { ws.close(); ws = null; }
      } else {
        // Error durante uso
        let errorHtml = `<span class="error">${escapeHtml(msg.message)}</span>`;
        if (msg.details) {
          errorHtml += '<ul style="margin-top:.3rem;font-size:.8rem;">';
          for (const d of msg.details) {
            errorHtml += `<li>${escapeHtml(d.message)}</li>`;
          }
          errorHtml += '</ul>';
        }
        proposeStatus.innerHTML = errorHtml;
        showNotification(msg.message, 'error');
      }
      break;
  }
}

// ---- UI ----

function showMainScreen() {
  loginScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
  userNameSpan.textContent = `Hola, ${myName}`;
}

function sortProducts() {
  products.sort((a, b) => b.votes.length - a.votes.length);
}

function renderProducts() {
  sortProducts();
  if (products.length === 0) {
    productListDiv.innerHTML = '<p class="empty-message">Aún no hay productos. ¡Proponé uno!</p>';
    return;
  }

  productListDiv.innerHTML = products.map((p, i) => {
    const hasVoted = p.votes.includes(myName);
    const canRemove = p.proposedBy === myName || p.votes.length === 0;

    return `
      <div class="product-card" data-id="${p.id}">
        <div class="product-rank">#${i + 1}</div>
        <img class="product-img" src="${escapeHtml(p.thumbnail)}" alt="${escapeHtml(p.title)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect fill=%22%23ddd%22 width=%2264%22 height=%2264%22/><text x=%2232%22 y=%2236%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2214%22>?</text></svg>'">
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
          ${hasVoted
            ? `<button class="btn-unvote" onclick="unvoteProduct(${p.id})">Quitar voto</button>`
            : `<button class="btn-vote" onclick="voteProduct(${p.id})">Votar</button>`
          }
          ${canRemove
            ? `<button class="btn-remove" onclick="removeProduct(${p.id})">Quitar</button>`
            : ''
          }
        </div>
      </div>
    `;
  }).join('');
}

function renderParticipants() {
  participantCountSpan.textContent = `${participantsList.length} conectado${participantsList.length !== 1 ? 's' : ''}`;
  participantsUl.innerHTML = participantsList
    .map(p => `<li>${escapeHtml(p.name)}${p.name === myName ? ' (vos)' : ''}</li>`)
    .join('');
}

// ---- Acciones ----

function proposeProducts() {
  const raw = productIdsInput.value.trim();
  if (!raw) return;

  const ids = raw.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0);

  if (ids.length === 0) {
    proposeStatus.innerHTML = '<span class="error">Ingresá al menos un ID válido.</span>';
    return;
  }

  if (ids.length > 10) {
    proposeStatus.innerHTML = '<span class="error">Máximo 10 productos por vez.</span>';
    return;
  }

  ws.send(JSON.stringify({ type: 'propose', productIds: ids }));
  productIdsInput.value = '';
  proposeStatus.innerHTML = '<span class="success">Consultando catálogo...</span>';
}

function voteProduct(id) {
  ws.send(JSON.stringify({ type: 'vote', productId: id }));
}

function unvoteProduct(id) {
  ws.send(JSON.stringify({ type: 'unvote', productId: id }));
}

function removeProduct(id) {
  ws.send(JSON.stringify({ type: 'remove', productId: id }));
}

// ---- Notificaciones ----

function showNotification(text, type = 'info') {
  const div = document.createElement('div');
  div.className = `notification ${type}`;
  div.textContent = text;
  notificationsDiv.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

// ---- Utilidades ----

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Enter para proponer
productIdsInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') proposeProducts();
});
