const { pool } = require('../config/db');
const { createWhatsAppNotification } = require('../utils/whatsapp');

const DEFAULT_OPTIONS = [
  {
    id: null,
    name: 'PAC',
    price: 15,
    estimated_days_min: 7,
    estimated_days_max: 10,
    is_free: false,
  },
  {
    id: null,
    name: 'SEDEX',
    price: 30,
    estimated_days_min: 2,
    estimated_days_max: 5,
    is_free: false,
  },
];

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

async function findZoneRules(uf) {
  const [zones] = await pool.query(
    `SELECT id FROM shipping_zones
     WHERE FIND_IN_SET(?, states) AND active = 1
     ORDER BY id LIMIT 1`,
    [uf]
  );

  if (zones.length > 0) {
    const [rules] = await pool.query(
      'SELECT * FROM shipping_rules WHERE zone_id = ? AND active = 1 ORDER BY sort_order ASC',
      [zones[0].id]
    );
    return rules;
  }

  const [rules] = await pool.query(
    'SELECT * FROM shipping_rules WHERE zone_id IS NULL AND active = 1 ORDER BY sort_order ASC'
  );
  return rules;
}

async function calculateTotalWeight(items) {
  const quantities = new Map();
  for (const item of items) {
    quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + item.quantity);
  }

  const productIds = [...quantities.keys()];
  const placeholders = productIds.map(() => '?').join(',');
  const [products] = await pool.query(
    `SELECT id, COALESCE(weight_g, 300) AS weight_g FROM products WHERE id IN (${placeholders})`,
    productIds
  );
  if (products.length !== productIds.length) {
    const foundIds = new Set(products.map((product) => Number(product.id)));
    const missingId = productIds.find((id) => !foundIds.has(Number(id)));
    throw httpError(400, `Produto #${missingId} não encontrado`);
  }

  return products.reduce(
    (total, product) => total + (Number(product.weight_g) * quantities.get(Number(product.id))),
    0
  );
}

function buildOptions(rules, totalWeight, orderTotal) {
  if (rules.length === 0) return DEFAULT_OPTIONS.map((option) => ({ ...option }));

  return rules.reduce((options, rule) => {
    const basePrice = Number(rule.price || 0);
    let price = basePrice;
    let isFree = false;
    let missingForFree;

    if (rule.type === 'free') {
      const freeAbove = Number(rule.free_above);
      price = 0;
      isFree = orderTotal >= freeAbove;
      if (!isFree) missingForFree = roundMoney(freeAbove - orderTotal);
    } else if (rule.type === 'by_weight') {
      if (rule.max_weight_g !== null && totalWeight > Number(rule.max_weight_g)) return options;
      price = Math.max(basePrice, basePrice * (totalWeight / 1000));
    }

    const option = {
      id: rule.id,
      name: rule.name,
      price: roundMoney(price),
      estimated_days_min: Number(rule.estimated_days_min),
      estimated_days_max: Number(rule.estimated_days_max),
      is_free: isFree,
    };
    if (missingForFree !== undefined) option.falta_para_gratis = missingForFree;
    options.push(option);
    return options;
  }, []).sort((first, second) => first.price - second.price);
}

async function getShippingOptions({ cep, items, orderTotal }) {
  let response;
  try {
    response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  } catch (_error) {
    throw httpError(502, 'Não foi possível consultar o CEP');
  }
  if (!response.ok) throw httpError(502, 'Não foi possível consultar o CEP');

  const address = await response.json();
  if (address.erro || !address.uf) throw httpError(400, 'CEP não encontrado');

  const [rules, totalWeight] = await Promise.all([
    findZoneRules(address.uf),
    calculateTotalWeight(items),
  ]);
  return buildOptions(rules, totalWeight, Number(orderTotal));
}

const shippingController = {
  async getZones(_req, res) {
    try {
      const [rows] = await pool.query('SELECT * FROM shipping_zones ORDER BY name');
      res.json(rows);
    } catch (error) {
      console.error('Get shipping zones error:', error);
      res.status(500).json({ error: 'Erro ao buscar zonas de entrega' });
    }
  },

  async createZone(req, res) {
    try {
      const [result] = await pool.query(
        'INSERT INTO shipping_zones (name, states) VALUES (?, ?)',
        [req.body.name, req.body.states.join(',')]
      );
      res.status(201).json({ id: result.insertId, success: true });
    } catch (error) {
      console.error('Create shipping zone error:', error);
      res.status(500).json({ error: 'Erro ao criar zona de entrega' });
    }
  },

  async updateZone(req, res) {
    try {
      const [result] = await pool.query(
        'UPDATE shipping_zones SET name = ?, states = ?, active = ? WHERE id = ?',
        [req.body.name, req.body.states.join(','), req.body.active, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Zona de entrega não encontrada' });
      res.json({ success: true });
    } catch (error) {
      console.error('Update shipping zone error:', error);
      res.status(500).json({ error: 'Erro ao atualizar zona de entrega' });
    }
  },

  async deleteZone(req, res) {
    try {
      const [[{ linkedRules }]] = await pool.query(
        'SELECT COUNT(*) AS linkedRules FROM shipping_rules WHERE zone_id = ? AND active = 1',
        [req.params.id]
      );
      if (Number(linkedRules) > 0) {
        return res.status(409).json({ error: 'Existe regras de frete vinculadas a esta zona. Remova-as primeiro.' });
      }
      const [result] = await pool.query('DELETE FROM shipping_zones WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Zona de entrega não encontrada' });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete shipping zone error:', error);
      res.status(500).json({ error: 'Erro ao remover zona de entrega' });
    }
  },

  async getRules(req, res) {
    try {
      const zoneId = req.query.zone_id ?? null;
      const [rows] = await pool.query(
        `SELECT sr.*, sz.name AS zone_name FROM shipping_rules sr
         LEFT JOIN shipping_zones sz ON sr.zone_id = sz.id
         WHERE (? IS NULL OR sr.zone_id = ?) AND sr.active = 1
         ORDER BY sr.sort_order ASC`,
        [zoneId, zoneId]
      );
      res.json(rows);
    } catch (error) {
      console.error('Get shipping rules error:', error);
      res.status(500).json({ error: 'Erro ao buscar regras de frete' });
    }
  },

  async createRule(req, res) {
    try {
      const {
        zone_id = null, name, type, price = 0, free_above = null,
        estimated_days_min = 3, estimated_days_max = 10,
        max_weight_g = null, sort_order = 0,
      } = req.body;
      const [result] = await pool.query(
        `INSERT INTO shipping_rules
          (zone_id, name, type, price, free_above, estimated_days_min,
           estimated_days_max, max_weight_g, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [zone_id, name, type, price, free_above, estimated_days_min, estimated_days_max, max_weight_g, sort_order]
      );
      res.status(201).json({ id: result.insertId, success: true });
    } catch (error) {
      if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Zona de entrega inválida' });
      console.error('Create shipping rule error:', error);
      res.status(500).json({ error: 'Erro ao criar regra de frete' });
    }
  },

  async updateRule(req, res) {
    try {
      const {
        zone_id = null, name, type, price = 0, free_above = null,
        estimated_days_min = 3, estimated_days_max = 10,
        max_weight_g = null, sort_order = 0, active = true,
      } = req.body;
      const [result] = await pool.query(
        `UPDATE shipping_rules SET zone_id = ?, name = ?, type = ?, price = ?, free_above = ?,
          estimated_days_min = ?, estimated_days_max = ?, max_weight_g = ?, sort_order = ?, active = ?
         WHERE id = ?`,
        [zone_id, name, type, price, free_above, estimated_days_min, estimated_days_max,
          max_weight_g, sort_order, active, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Regra de frete não encontrada' });
      res.json({ success: true });
    } catch (error) {
      if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Zona de entrega inválida' });
      console.error('Update shipping rule error:', error);
      res.status(500).json({ error: 'Erro ao atualizar regra de frete' });
    }
  },

  async deleteRule(req, res) {
    try {
      const [result] = await pool.query('UPDATE shipping_rules SET active = 0 WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Regra de frete não encontrada' });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete shipping rule error:', error);
      res.status(500).json({ error: 'Erro ao remover regra de frete' });
    }
  },

  async calculate(req, res) {
    try {
      const options = await getShippingOptions({
        cep: req.body.cep,
        items: req.body.items,
        orderTotal: req.body.order_total,
      });
      res.json(options);
    } catch (error) {
      console.error('Shipping calculation error:', error);
      res.status(error.status || 500).json({ error: error.message || 'Erro ao calcular frete' });
    }
  },

  async estimate(req, res) {
    try {
      const [products] = await pool.query(
        `SELECT price * (1 - COALESCE(discount_percentage, 0) / 100) AS current_price
         FROM products WHERE id = ? AND active = 1`,
        [req.query.product_id]
      );
      if (products.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });

      const options = await getShippingOptions({
        cep: req.query.cep,
        items: [{ product_id: req.query.product_id, quantity: 1 }],
        orderTotal: Number(products[0].current_price),
      });
      if (options.length === 0) return res.status(404).json({ error: 'Nenhuma opção de frete disponível' });
      const cheapest = options[0];
      res.json({
        name: cheapest.name,
        price: cheapest.price,
        estimated_days_min: cheapest.estimated_days_min,
        estimated_days_max: cheapest.estimated_days_max,
        is_free: cheapest.is_free,
      });
    } catch (error) {
      console.error('Shipping estimate error:', error);
      res.status(error.status || 500).json({ error: error.message || 'Erro ao estimar frete' });
    }
  },

  async generateLabel(req, res) {
    try {
      const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);
      if (orders.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
      const order = orders[0];
      const [items] = await pool.query(
        `SELECT p.name, oi.size, oi.quantity
         FROM order_items oi JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [req.params.orderId]
      );
      const [settingsRows] = await pool.query(
        `SELECT setting_key, setting_value FROM site_settings
         WHERE setting_key IN ('store_name', 'store_address', 'store_phone')`
      );
      const settings = Object.fromEntries(settingsRows.map((row) => [row.setting_key, row.setting_value]));

      const label = {
        order_id: order.id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        address: {
          street: order.address_street,
          number: order.address_number,
          complement: order.address_complement,
          neighborhood: order.address_neighborhood,
          city: order.address_city,
          state: order.address_state,
          cep: order.address_cep,
        },
        items,
        tracking_code: order.tracking_code,
        store: {
          name: settings.store_name || 'MJ Sneakers',
          address: settings.store_address || '',
          phone: settings.store_phone || '',
        },
        generated_at: new Date().toISOString(),
      };

      await pool.query(
        `INSERT INTO shipping_labels (order_id, tracking_code) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE tracking_code = VALUES(tracking_code), generated_at = CURRENT_TIMESTAMP`,
        [order.id, order.tracking_code]
      );
      res.status(201).json(label);
    } catch (error) {
      console.error('Generate shipping label error:', error);
      res.status(500).json({ error: 'Erro ao gerar etiqueta de envio' });
    }
  },

  async getLabel(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT sl.*, o.customer_name, o.address_street, o.address_city, o.address_state,
          o.address_cep, o.customer_phone, o.address_number, o.address_complement,
          o.address_neighborhood
         FROM shipping_labels sl JOIN orders o ON sl.order_id = o.id
         WHERE sl.order_id = ?`,
        [req.params.orderId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Etiqueta não encontrada' });
      res.json(rows[0]);
    } catch (error) {
      console.error('Get shipping label error:', error);
      res.status(500).json({ error: 'Erro ao buscar etiqueta de envio' });
    }
  },

  async createWhatsApp(req, res) {
    try {
      const [orders] = await pool.query(
        'SELECT id, customer_name, customer_phone, tracking_code FROM orders WHERE id = ?',
        [req.params.orderId]
      );
      if (orders.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
      if (!orders[0].tracking_code) return res.status(400).json({ error: 'Pedido sem código de rastreio' });
      if (!orders[0].customer_phone) return res.status(400).json({ error: 'Pedido sem telefone do cliente' });

      const notification = await createWhatsAppNotification(pool, orders[0]);
      res.status(201).json(notification);
    } catch (error) {
      console.error('Create WhatsApp notification error:', error);
      res.status(500).json({ error: 'Erro ao criar notificação do WhatsApp' });
    }
  },

  async getWhatsApp(_req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT wn.*, o.customer_name FROM whatsapp_notifications wn
         JOIN orders o ON wn.order_id = o.id
         ORDER BY wn.created_at DESC LIMIT 50`
      );
      res.json(rows);
    } catch (error) {
      console.error('Get WhatsApp notifications error:', error);
      res.status(500).json({ error: 'Erro ao buscar notificações do WhatsApp' });
    }
  },

  async markWhatsAppSent(req, res) {
    try {
      const [result] = await pool.query(
        "UPDATE whatsapp_notifications SET status = 'sent', sent_at = NOW() WHERE id = ?",
        [req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Notificação não encontrada' });
      res.json({ success: true });
    } catch (error) {
      console.error('Mark WhatsApp notification error:', error);
      res.status(500).json({ error: 'Erro ao atualizar notificação do WhatsApp' });
    }
  },
};

module.exports = { shippingController, getShippingOptions, buildOptions };
