const nodemailer = require('nodemailer');

function createTransporter() {
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  // Fallback: Ethereal fake SMTP para desenvolvimento
  return null;
}

const baseStyle = `
  font-family: 'Helvetica Neue', Arial, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  color: #1a1a1a;
`;

function wrapEmail(title, body) {
  return `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body style="background:#f5f5f5; padding: 32px 16px;">
    <div style="${baseStyle}">
      <div style="background:#000; padding: 20px 32px; border-radius: 12px 12px 0 0; text-align:center;">
        <h1 style="color:#fff; margin:0; font-size:22px; letter-spacing:2px;">MJ<span style="color:#888">Sneakers</span></h1>
      </div>
      <div style="background:#fff; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e0e0e0; border-top:none;">
        ${body}
      </div>
      <p style="text-align:center; color:#999; font-size:12px; margin-top:24px;">
        © ${new Date().getFullYear()} MJ Sneakers. Todos os direitos reservados.
      </p>
    </div>
  </body>
  </html>
  `;
}

function formatPrice(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function statusLabel(status) {
  const map = {
    pending: 'Aguardando confirmação',
    confirmed: 'Confirmado',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
  };
  return map[status] || status;
}

function statusColor(status) {
  const map = {
    pending: '#f59e0b',
    confirmed: '#3b82f6',
    shipped: '#8b5cf6',
    delivered: '#10b981',
    cancelled: '#ef4444',
  };
  return map[status] || '#888';
}

// ── Templates ──

function orderConfirmationEmail(order, items) {
  const itemsHtml = items.map(i => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
        <strong>${i.product_name || 'Produto'}</strong><br>
        <span style="color:#666; font-size:13px;">Tamanho: ${i.size} · Qtd: ${i.quantity}</span>
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align:right; white-space:nowrap;">
        ${formatPrice(i.price * i.quantity)}
      </td>
    </tr>
  `).join('');

  const body = `
    <h2 style="margin:0 0 8px; font-size:20px;">Pedido confirmado!</h2>
    <p style="color:#555; margin:0 0 24px;">Olá, <strong>${order.customer_name}</strong>! Recebemos seu pedido e estamos processando.</p>

    <div style="background:#f9f9f9; border-radius:8px; padding:16px; margin-bottom:24px;">
      <p style="margin:0 0 4px; font-size:13px; color:#888;">NÚMERO DO PEDIDO</p>
      <p style="margin:0; font-size:22px; font-weight:bold;">#${order.id}</p>
    </div>

    <table style="width:100%; border-collapse:collapse;">
      <tbody>${itemsHtml}</tbody>
      <tfoot>
        ${order.discount_amount > 0 ? `
        <tr>
          <td style="padding:8px 0; color:#10b981;">Desconto (${order.coupon_code})</td>
          <td style="text-align:right; color:#10b981;">-${formatPrice(order.discount_amount)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 0; color:#666;">Frete (${order.shipping_type || 'Standard'})</td>
          <td style="text-align:right;">${formatPrice(order.shipping_price || 0)}</td>
        </tr>
        <tr>
          <td style="padding:12px 0 0; font-size:18px; font-weight:bold;">Total</td>
          <td style="padding:12px 0 0; text-align:right; font-size:18px; font-weight:bold;">${formatPrice(order.total)}</td>
        </tr>
      </tfoot>
    </table>

    <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">

    <h3 style="margin:0 0 12px; font-size:15px;">Endereço de entrega</h3>
    <p style="margin:0; color:#555; line-height:1.8;">
      ${order.address_street}, ${order.address_number}${order.address_complement ? ' – ' + order.address_complement : ''}<br>
      ${order.address_neighborhood} – ${order.address_city}/${order.address_state}<br>
      CEP: ${order.address_cep}
    </p>

    <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">
    <p style="color:#555; margin:0;">Acompanhe seu pedido a qualquer momento acessando nossa loja com o e-mail <strong>${order.customer_email}</strong> e número do pedido <strong>#${order.id}</strong>.</p>

    <div style="margin-top:28px; text-align:center;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/rastrear?id=${order.id}&email=${encodeURIComponent(order.customer_email)}"
         style="background:#000; color:#fff; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:bold; display:inline-block;">
        Rastrear Pedido
      </a>
    </div>
  `;
  return { subject: `Pedido #${order.id} recebido – MJ Sneakers`, html: wrapEmail('Pedido Confirmado', body) };
}

function adminNewOrderEmail(order, items) {
  const itemsHtml = items.map(i => `
    <tr>
      <td style="padding:8px 0; border-bottom:1px solid #f0f0f0;">${i.product_name || '#' + i.product_id}</td>
      <td style="padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:center;">${i.size}</td>
      <td style="padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:center;">${i.quantity}</td>
      <td style="padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:right;">${formatPrice(i.price * i.quantity)}</td>
    </tr>
  `).join('');

  const body = `
    <h2 style="margin:0 0 4px;">Novo pedido recebido!</h2>
    <p style="color:#888; margin:0 0 24px; font-size:14px;">${new Date().toLocaleString('pt-BR')}</p>

    <div style="display:flex; gap:12px; margin-bottom:24px;">
      <div style="background:#f9f9f9; border-radius:8px; padding:14px; flex:1;">
        <p style="margin:0 0 2px; font-size:11px; color:#888; text-transform:uppercase;">Pedido</p>
        <p style="margin:0; font-size:20px; font-weight:bold;">#${order.id}</p>
      </div>
      <div style="background:#f9f9f9; border-radius:8px; padding:14px; flex:1;">
        <p style="margin:0 0 2px; font-size:11px; color:#888; text-transform:uppercase;">Total</p>
        <p style="margin:0; font-size:20px; font-weight:bold;">${formatPrice(order.total)}</p>
      </div>
    </div>

    <h3 style="font-size:14px; margin:0 0 8px;">Cliente</h3>
    <p style="margin:0 0 4px;">${order.customer_name}</p>
    <p style="margin:0 0 4px; color:#555;">${order.customer_email}</p>
    <p style="margin:0 0 20px; color:#555;">${order.customer_phone}</p>

    <h3 style="font-size:14px; margin:0 0 8px;">Itens</h3>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead>
        <tr style="color:#888; font-size:12px; text-transform:uppercase;">
          <th style="text-align:left; padding-bottom:6px;">Produto</th>
          <th style="padding-bottom:6px;">Tam.</th>
          <th style="padding-bottom:6px;">Qtd</th>
          <th style="text-align:right; padding-bottom:6px;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div style="margin-top:20px; text-align:center;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin"
         style="background:#000; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; display:inline-block;">
        Ver no Painel Admin
      </a>
    </div>
  `;
  return { subject: `[MJ Sneakers] Novo pedido #${order.id} – ${formatPrice(order.total)}`, html: wrapEmail('Novo Pedido', body) };
}

function orderStatusEmail(order, newStatus, trackingCode) {
  const statusMap = {
    confirmed: {
      title: 'Pedido confirmado!',
      msg: 'Seu pedido foi confirmado e está sendo preparado para envio.',
      emoji: '✅',
    },
    shipped: {
      title: 'Pedido enviado!',
      msg: 'Seu pedido saiu para entrega.',
      emoji: '🚚',
    },
    delivered: {
      title: 'Pedido entregue!',
      msg: 'Seu pedido foi entregue. Esperamos que você curta muito!',
      emoji: '🎉',
    },
    cancelled: {
      title: 'Pedido cancelado',
      msg: 'Seu pedido foi cancelado. Se tiver dúvidas, entre em contato.',
      emoji: '❌',
    },
  };

  const info = statusMap[newStatus] || { title: 'Status atualizado', msg: '', emoji: '📦' };

  const body = `
    <div style="text-align:center; margin-bottom:24px;">
      <span style="font-size:48px;">${info.emoji}</span>
      <h2 style="margin:8px 0 0;">${info.title}</h2>
    </div>

    <p style="color:#555;">Olá, <strong>${order.customer_name}</strong>! ${info.msg}</p>

    <div style="background:#f9f9f9; border-radius:8px; padding:16px; margin:20px 0; text-align:center;">
      <p style="margin:0 0 4px; font-size:12px; color:#888; text-transform:uppercase;">Pedido</p>
      <p style="margin:0; font-size:20px; font-weight:bold;">#${order.id}</p>
      <p style="margin:4px 0 0;">
        <span style="background:${statusColor(newStatus)}; color:#fff; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:bold;">
          ${statusLabel(newStatus)}
        </span>
      </p>
    </div>

    ${trackingCode ? `
    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:16px; margin:20px 0; text-align:center;">
      <p style="margin:0 0 4px; font-size:12px; color:#0284c7; text-transform:uppercase;">Código de Rastreio</p>
      <p style="margin:0; font-size:18px; font-weight:bold; letter-spacing:2px;">${trackingCode}</p>
      <p style="margin:4px 0 0; font-size:12px; color:#0284c7;">Rastreie em: rastreamento.correios.com.br</p>
    </div>
    ` : ''}

    <div style="margin-top:24px; text-align:center;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/rastrear?id=${order.id}&email=${encodeURIComponent(order.customer_email)}"
         style="background:#000; color:#fff; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:bold; display:inline-block;">
        Rastrear Pedido
      </a>
    </div>
  `;
  return { subject: `${info.emoji} Pedido #${order.id} – ${info.title}`, html: wrapEmail(info.title, body) };
}

function newsletterWelcomeEmail(email, name, couponCode) {
  const body = `
    <div style="text-align:center; margin-bottom:24px;">
      <span style="font-size:48px;">🎉</span>
      <h2 style="margin:8px 0 0;">Bem-vindo(a) à família MJ Sneakers!</h2>
    </div>

    <p style="color:#555; text-align:center;">Obrigado por se inscrever${name ? ', ' + name : ''}! Aqui está seu cupom exclusivo de boas-vindas:</p>

    ${couponCode ? `
    <div style="background:#000; border-radius:12px; padding:24px; margin:24px 0; text-align:center;">
      <p style="color:#888; margin:0 0 4px; font-size:13px; text-transform:uppercase; letter-spacing:2px;">Seu cupom de 10% OFF</p>
      <p style="color:#fff; margin:0; font-size:28px; font-weight:bold; letter-spacing:4px;">${couponCode}</p>
    </div>
    <p style="color:#555; text-align:center; font-size:14px;">Use no carrinho antes de finalizar sua compra. Válido para qualquer produto!</p>
    ` : ''}

    <div style="margin-top:28px; text-align:center;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}"
         style="background:#000; color:#fff; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:bold; display:inline-block;">
        Ver Coleção
      </a>
    </div>
  `;
  return { subject: '🎉 Bem-vindo à MJ Sneakers – Seu cupom exclusivo chegou!', html: wrapEmail('Bem-vindo!', body) };
}

function stockAlertEmail(email, product) {
  const finalPrice = product.discount_percentage > 0
    ? product.price * (1 - product.discount_percentage / 100)
    : product.price;

  const body = `
    <div style="text-align:center; margin-bottom:24px;">
      <span style="font-size:48px;">🔔</span>
      <h2 style="margin:8px 0 0;">Produto disponível!</h2>
    </div>

    <p style="color:#555; text-align:center;">O tênis que você queria voltou ao estoque:</p>

    <div style="background:#f9f9f9; border-radius:12px; padding:20px; margin:20px 0; text-align:center;">
      <h3 style="margin:0 0 4px;">${product.name}</h3>
      <p style="margin:0; font-size:20px; font-weight:bold; color:#000;">${formatPrice(finalPrice)}</p>
      ${product.discount_percentage > 0 ? `<p style="margin:4px 0 0; color:#ef4444; font-size:13px;">${product.discount_percentage}% OFF</p>` : ''}
    </div>

    <div style="text-align:center; margin-top:24px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/?produto=${product.id}"
         style="background:#000; color:#fff; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:bold; display:inline-block;">
        Comprar Agora
      </a>
    </div>
    <p style="text-align:center; color:#999; font-size:12px; margin-top:16px;">Corra! Estoque limitado.</p>
  `;
  return { subject: `🔔 ${product.name} voltou ao estoque! – MJ Sneakers`, html: wrapEmail('Produto Disponível', body) };
}

// ── Send helper ──
async function sendEmail(to, { subject, html }) {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('[Email] Nenhum transporte configurado. Email que seria enviado:', { to, subject });
    return { skipped: true };
  }
  try {
    const info = await transporter.sendMail({
      from: `"MJ Sneakers" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log('[Email] Enviado:', info.messageId);
    return info;
  } catch (err) {
    console.error('[Email] Erro ao enviar:', err.message);
    return null;
  }
}

module.exports = {
  sendEmail,
  orderConfirmationEmail,
  adminNewOrderEmail,
  orderStatusEmail,
  newsletterWelcomeEmail,
  stockAlertEmail,
};
