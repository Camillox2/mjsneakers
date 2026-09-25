// Estoque por tamanho: product_sizes é a fonte da verdade e products.stock
// (mais o texto products.sizes) são recalculados a partir dela.

const MAX_SIZE_LENGTH = 10;
const MAX_STOCK = 100000;
// Pedidos que ainda vão sair do estoque: tamanho com pedido nesses status
// não é apagado, só zerado.
const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'processing'];
// Numéricos primeiro, em ordem de número (38, 38.5, 39); depois os demais
// (P, M, G) em ordem alfabética. Sem CAST em texto não numérico.
const SIZE_ORDER = `(ps.size REGEXP '^[0-9]+([.][0-9]+)?$') DESC,
  CASE WHEN ps.size REGEXP '^[0-9]+([.][0-9]+)?$' THEN ps.size + 0 END, ps.size`;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Aceita "38, 39, 40" ou JSON ["38","39"]; devolve a lista sem repetidos.
function parseSizesText(value) {
  if (value === null || value === undefined || value === '') return [];
  let list;
  if (Array.isArray(value)) {
    list = value;
  } else {
    const text = String(value);
    try {
      const parsed = JSON.parse(text);
      list = Array.isArray(parsed) ? parsed : text.split(',');
    } catch (_error) {
      list = text.split(',');
    }
  }
  const seen = new Set();
  const sizes = [];
  for (const item of list) {
    const size = String(item ?? '').trim();
    if (!size) continue;
    if (size.length > MAX_SIZE_LENGTH) throw httpError(400, `Tamanho "${size.slice(0, 20)}" passa de ${MAX_SIZE_LENGTH} caracteres`);
    if (seen.has(size)) continue;
    seen.add(size);
    sizes.push(size);
  }
  return sizes;
}

// Valida [{size, stock}]: tamanho de 1 a 10 caracteres, sem repetir, e
// estoque inteiro entre 0 e 100000.
function normalizeSizeStock(list) {
  if (!Array.isArray(list)) throw httpError(400, 'size_stock deve ser uma lista de {size, stock}');
  const seen = new Set();
  return list.map((item) => {
    const size = String(item?.size ?? '').trim();
    if (!size || size.length > MAX_SIZE_LENGTH || size.includes(',')) {
      throw httpError(400, `Cada tamanho deve ter de 1 a ${MAX_SIZE_LENGTH} caracteres, sem vírgula`);
    }
    if (seen.has(size)) throw httpError(400, `Tamanho ${size} repetido`);
    seen.add(size);
    const stock = Number(item?.stock ?? 0);
    if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
      throw httpError(400, `Estoque do tamanho ${size} deve ser um inteiro entre 0 e ${MAX_STOCK}`);
    }
    return { size, stock };
  });
}

async function recordHistory(conn, { productId, size, type, before, after, reason, adminUsername, orderId = null }) {
  if (before === after) return;
  await conn.query(
    `INSERT INTO stock_history
      (product_id, size, type, quantity_change, quantity_before, quantity_after, reason, admin_username, order_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, size, type, after - before, before, after, reason, adminUsername || null, orderId]
  );
}

// products.stock = soma dos tamanhos; products.sizes = lista dos tamanhos
// cadastrados (se o produto ainda não tem nenhum, o texto antigo fica).
async function recalcProduct(conn, productId) {
  await conn.query(
    `UPDATE products SET
       stock = COALESCE((SELECT SUM(ps.stock) FROM product_sizes ps WHERE ps.product_id = ?), 0),
       sizes = COALESCE((
         SELECT GROUP_CONCAT(ps.size ORDER BY ${SIZE_ORDER} SEPARATOR ',')
         FROM product_sizes ps WHERE ps.product_id = ?
       ), sizes)
     WHERE id = ?`,
    [productId, productId, productId]
  );
}

async function sizeHasCommitments(conn, productId, size) {
  const [[reservation]] = await conn.query(
    `SELECT COALESCE(SUM(quantity), 0) AS qty FROM cart_reservations
     WHERE product_id = ? AND size = ? AND reserved_until > NOW()`,
    [productId, size]
  );
  if (Number(reservation.qty) > 0) return true;
  const [[pending]] = await conn.query(
    `SELECT COUNT(*) AS total FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.product_id = ? AND oi.size = ? AND o.status IN (?)`,
    [productId, size, OPEN_ORDER_STATUSES]
  );
  return Number(pending.total) > 0;
}

/**
 * Grava o estoque por tamanho de um produto dentro da transação do chamador.
 * - upsert de cada {size, stock} recebido;
 * - com removeMissing, tamanho que ficou de fora é apagado, ou só zerado se
 *   tiver reserva ativa ou pedido em aberto.
 * Devolve { removed, zeroed }.
 */
async function syncSizeStock(conn, productId, list, { removeMissing = true, adminUsername, reason = 'Ajuste manual de estoque', type = 'adjustment' } = {}) {
  const [currentRows] = await conn.query(
    'SELECT size, stock FROM product_sizes WHERE product_id = ? FOR UPDATE',
    [productId]
  );
  const current = new Map(currentRows.map((row) => [row.size, Number(row.stock)]));

  for (const item of list) {
    const before = current.has(item.size) ? current.get(item.size) : 0;
    await conn.query(
      `INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE stock = VALUES(stock)`,
      [productId, item.size, item.stock]
    );
    await recordHistory(conn, { productId, size: item.size, type, before, after: item.stock, reason, adminUsername });
  }

  const removed = [];
  const zeroed = [];
  if (removeMissing) {
    const keep = new Set(list.map((item) => item.size));
    for (const [size, stock] of current) {
      if (keep.has(size)) continue;
      if (await sizeHasCommitments(conn, productId, size)) {
        await conn.query('UPDATE product_sizes SET stock = 0 WHERE product_id = ? AND size = ?', [productId, size]);
        zeroed.push(size);
      } else {
        await conn.query('DELETE FROM product_sizes WHERE product_id = ? AND size = ?', [productId, size]);
        removed.push(size);
      }
      await recordHistory(conn, { productId, size, type, before: stock, after: 0, reason: 'Tamanho removido do produto', adminUsername });
    }
  }

  await recalcProduct(conn, productId);
  return { removed, zeroed };
}

// Cria com estoque 0 os tamanhos do texto que ainda não existem.
async function ensureSizesExist(conn, productId, sizes) {
  for (const size of sizes) {
    await conn.query(
      'INSERT IGNORE INTO product_sizes (product_id, size, stock) VALUES (?, ?, 0)',
      [productId, size]
    );
  }
  await recalcProduct(conn, productId);
}

// Estoque por tamanho com a reserva ativa de cada um, para vários produtos.
async function loadSizeStock(conn, productIds) {
  const map = new Map();
  if (!productIds.length) return map;
  const [rows] = await conn.query(
    `SELECT ps.product_id, ps.size, ps.stock, COALESCE(r.reserved, 0) AS reserved
     FROM product_sizes ps
     LEFT JOIN (
       SELECT product_id, size, SUM(quantity) AS reserved FROM cart_reservations
       WHERE reserved_until > NOW() AND product_id IN (?) GROUP BY product_id, size
     ) r ON r.product_id = ps.product_id AND r.size = ps.size
     WHERE ps.product_id IN (?)
     ORDER BY ps.product_id, ${SIZE_ORDER}`,
    [productIds, productIds]
  );
  for (const row of rows) {
    const list = map.get(row.product_id) || [];
    list.push({ size: row.size, stock: Number(row.stock), reserved: Number(row.reserved) });
    map.set(row.product_id, list);
  }
  return map;
}

module.exports = {
  MAX_SIZE_LENGTH,
  OPEN_ORDER_STATUSES,
  parseSizesText,
  normalizeSizeStock,
  recordHistory,
  recalcProduct,
  syncSizeStock,
  ensureSizesExist,
  loadSizeStock,
};
