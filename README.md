# TP4 · Lista de Regalos Compartida en Tiempo Real

Aplicación web en tiempo real donde un grupo de amigos puede proponer productos de un catálogo externo, votar por sus favoritos y ver el ranking actualizado en vivo.

## Instalación y ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo (con hot reload)
npm run dev

# O compilar y ejecutar
npm run build
npm start
```

El servidor inicia en `http://localhost:3000` por defecto.

- **Participante:** `http://localhost:3000/`
- **Pantalla (TV):** `http://localhost:3000/pantalla`

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `CATALOG_URL` | `https://dummyjson.com` | URL base del catálogo |
| `CATALOG_TIMEOUT_MS` | `5000` | Tiempo máximo de espera al catálogo (ms) |
| `CATALOG_DELAY_MS` | `0` | Delay artificial para simular catálogo lento (ms) |

### Simular catálogo lento

Sin modificar código, usando la variable de entorno:

```bash
# Windows (PowerShell)
$env:CATALOG_DELAY_MS=3000; npm run dev

# Linux/Mac
CATALOG_DELAY_MS=3000 npm run dev
```

Esto agrega `?delay=3000` a las peticiones a DummyJSON, que soporta ese parámetro nativamente.

---

## Contrato de mensajes

### Cliente → Servidor (WebSocket)

#### `join` — Unirse a la lista
```json
{ "type": "join", "name": "Martín" }
```
Se envía al conectarse. El nombre debe tener entre 1 y 30 caracteres y no estar en uso.

#### `propose` — Proponer productos
```json
{ "type": "propose", "productIds": [1, 5, 12] }
```
Propone uno o más productos por sus IDs del catálogo (máximo 10 por vez). El servidor consulta el catálogo en paralelo.

#### `vote` — Votar un producto
```json
{ "type": "vote", "productId": 5 }
```
Agrega el voto del participante al producto. Cada participante puede votar una sola vez por producto.

#### `unvote` — Retirar voto
```json
{ "type": "unvote", "productId": 5 }
```
Retira el voto del participante del producto.

#### `remove` — Quitar producto de la lista
```json
{ "type": "remove", "productId": 5 }
```
Quita el producto de la lista (ver reglas más abajo).

---

### Servidor → Cliente (WebSocket)

#### `welcome` — Estado completo al unirse
```json
{
  "type": "welcome",
  "state": {
    "products": [
      {
        "id": 1,
        "title": "Essence Mascara...",
        "price": 9.99,
        "thumbnail": "https://...",
        "proposedBy": "Ana",
        "votes": ["Ana", "Pedro"]
      }
    ],
    "participants": [
      { "name": "Ana" },
      { "name": "Pedro" }
    ]
  }
}
```
Se envía solo al participante que acaba de unirse.

#### `products_added` — Productos agregados
```json
{
  "type": "products_added",
  "products": [ { "id": 1, "title": "...", "price": 9.99, "thumbnail": "...", "proposedBy": "Ana", "votes": [] } ]
}
```
Se envía a **todos** cuando se agregan productos con éxito.

#### `product_removed` — Producto quitado
```json
{ "type": "product_removed", "productId": 5 }
```
Se envía a **todos** cuando se quita un producto.

#### `vote_updated` — Votos actualizados
```json
{ "type": "vote_updated", "productId": 5, "votes": ["Ana", "Pedro"] }
```
Se envía a **todos** cuando cambian los votos de un producto.

#### `participants_updated` — Lista de participantes
```json
{
  "type": "participants_updated",
  "participants": [ { "name": "Ana" }, { "name": "Pedro" } ]
}
```
Se envía a **todos** cuando alguien entra o se va.

#### `error` — Error
```json
{
  "type": "error",
  "message": "Algunos productos no se pudieron agregar.",
  "details": [
    { "productId": 999, "reason": "not_found", "message": "Producto 999 no existe en el catálogo." },
    { "productId": 1, "reason": "already_in_list", "message": "El producto \"...\" ya está en la lista." },
    { "productId": 50, "reason": "timeout", "message": "El catálogo no respondió a tiempo para el producto 50." }
  ]
}
```
Se envía **solo** a quien causó el error. Los `details` aparecen solo en errores de propuesta. Las razones posibles son:
- `not_found`: el producto no existe en el catálogo
- `timeout`: el catálogo no respondió a tiempo
- `already_in_list`: el producto ya estaba en la lista
- `fetch_error`: error genérico al consultar el catálogo

---

### Eventos SSE (Pantalla)

La pantalla recibe los mismos eventos que los participantes pero por Server-Sent Events:

| Evento | Datos | Cuándo |
|---|---|---|
| `full_state` | `{ products, participants }` | Al conectarse |
| `products_added` | `{ products }` | Nuevos productos |
| `product_removed` | `{ productId }` | Producto quitado |
| `vote_updated` | `{ productId, votes }` | Cambio de votos |
| `participants_updated` | `{ participants }` | Cambio de participantes |

---

## Decisiones de diseño

### Nombres de participantes
- **No vacíos**: mínimo 1 carácter (después de trim).
- **No repetidos**: el servidor rechaza nombres ya en uso.
- **Largo máximo**: 30 caracteres.
- **Justificación**: evita confusiones en la lista de votos y participantes. Se permite cualquier carácter Unicode.

### Productos repetidos
Un producto solo puede estar una vez en la lista. Si dos participantes proponen el mismo producto al mismo tiempo, el primero que lo agrega gana; el segundo recibe un error `already_in_list`. Esto funciona porque Node.js procesa las mutaciones del store de forma sincrónica (single-threaded), así que no hay race conditions en la escritura.

### Quién puede quitar productos
- **Quien lo propuso** puede quitarlo siempre.
- **Cualquiera** puede quitarlo si **no tiene votos**.
- **Justificación**: quien propuso asume responsabilidad sobre su propuesta. Si nadie lo votó, cualquiera puede limpiarlo. Esto evita que un producto impopular se quede eternamente.

### Tiempo máximo de espera al catálogo
- **5000 ms (5 segundos)**.
- **Justificación**: DummyJSON normalmente responde en < 500 ms. Con 5s de timeout se toleran picos de latencia sin hacer esperar al usuario indefinidamente. Es configurable via `CATALOG_TIMEOUT_MS`.

---

## Qué ve cada usuario cuando el catálogo falla o tarda

### Cuando el catálogo tarda (pero responde)
- **Quien propuso**: ve un mensaje "Consultando catálogo..." y espera. Cuando llega la respuesta, ve los productos agregados y/o los errores parciales.
- **Los demás participantes**: siguen usando la app normalmente (votando, proponiendo). No se bloquean. Cuando los productos se agregan, reciben el evento `products_added`.
- **La pantalla**: se actualiza automáticamente cuando los productos aparecen.

### Cuando el catálogo no responde (timeout)
- **Quien propuso**: recibe un error indicando qué productos no pudieron obtenerse, con razón `timeout`. Los productos que sí se obtuvieron se agregan igualmente.
- **Los demás**: solo ven los productos que sí se agregaron. No ven errores ajenos.
- **La pantalla**: muestra solo lo que se agregó exitosamente.

### Cuando el producto no existe
- **Quien propuso**: recibe un error con razón `not_found` para ese ID específico. Los demás IDs válidos se agregan.

---

## ¿Por qué WebSocket para participantes y SSE para la pantalla?

### WebSocket para participantes
Los participantes necesitan **comunicación bidireccional**: envían acciones (proponer, votar, quitar) y reciben actualizaciones. WebSocket es el protocolo natural para esto porque mantiene una conexión persistente full-duplex sobre un solo socket TCP.

### SSE para la pantalla
La pantalla **solo recibe datos**, nunca envía. Server-Sent Events es ideal porque:
- Es unidireccional (servidor → cliente), que es exactamente lo que necesita.
- Usa HTTP estándar, lo que lo hace más simple que WebSocket.
- Reconecta automáticamente si se pierde la conexión (el navegador lo hace solo con `EventSource`).
- Soporta eventos con nombre, facilitando el parsing en el cliente.

### ¿Qué cambiaría si la pantalla usara polling?
Con polling, la pantalla haría peticiones HTTP periódicas (ej. cada 1-2 segundos) pidiendo el estado completo:
- **Latencia**: los cambios aparecerían con un delay de hasta N segundos en vez de instantáneamente.
- **Carga del servidor**: muchas peticiones HTTP innecesarias cuando no hay cambios, con overhead de headers, conexiones TCP, etc.
- **Complejidad**: habría que manejar ETags o timestamps para evitar re-enviar datos sin cambios.
- **Desperdicio de ancho de banda**: cada poll envía el estado completo, no solo los deltas.
- **Escalabilidad**: con muchas pantallas, el polling genera carga constante, mientras que SSE solo envía cuando hay cambios.

---

## Tecnologías

- **Node.js** (v22 LTS) con **TypeScript**
- **ws** (biblioteca WebSocket para Node.js)
- **API WebSocket estándar** del navegador (sin Socket.IO)
- **EventSource** (SSE) del navegador
- **DummyJSON** como catálogo externo
- HTML, CSS y JavaScript vanilla para el frontend
