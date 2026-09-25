const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Etiqueta de envio 10 cm. O QR leva só ao rastreio público do pedido
// (nenhum dado pessoal vai para o serviço que desenha o QR).
export function labelHTML(data) {
  const a = data.address || {}
  const store = data.store || {}
  const tracking = data.tracking_code || 'SEM RASTREIO'
  const when = new Date(data.generated_at || Date.now()).toLocaleString('pt-BR')
  const trackUrl = data.tracking_url || `${window.location.origin}/rastrear?pedido=${encodeURIComponent(data.order_id)}`
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&margin=0&data=${encodeURIComponent(trackUrl)}`
  const rows = (data.items || [])
    .map(it => `<tr><td>${esc(it.name || it.product_name)}</td><td class="c">${esc(it.size)}</td><td class="c">${esc(it.quantity)}</td></tr>`)
    .join('')
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta do pedido ${esc(data.order_id)}</title>
<style>
  @page { size: 10cm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  .label { width: 10cm; padding: 0.5cm; border: 2px solid #000; }
  .head { text-align: center; border-bottom: 1px solid #999; padding-bottom: 6px; margin-bottom: 8px; }
  .head strong { font-size: 17px; }
  .head small { display: block; font-size: 10px; color: #333; margin-top: 2px; }
  .dest { font-size: 13px; line-height: 1.45; margin-bottom: 10px; }
  .dest b { font-size: 11px; letter-spacing: 1px; }
  .track { border: 2px solid #000; border-radius: 4px; padding: 6px; text-align: center; font-size: 19px; font-weight: bold; letter-spacing: 3px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 10px; }
  th, td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; }
  .c { text-align: center; }
  .foot { display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #333; }
</style></head><body>
<div class="label">
  <div class="head"><strong>${esc(store.name || 'Pizantt Drop')}</strong>
    <small>${esc([store.address, store.phone].filter(Boolean).join(' | '))}</small></div>
  <div class="dest"><b>DESTINATÁRIO</b><br>
    ${esc(data.customer_name)}<br>
    ${esc(a.street)}, ${esc(a.number)} ${esc(a.complement || '')}<br>
    ${esc(a.neighborhood)} - ${esc(a.city)}/${esc(a.state)}<br>
    CEP ${esc(a.cep)}${data.customer_phone ? `<br>Tel. ${esc(data.customer_phone)}` : ''}</div>
  <div class="track">${esc(tracking)}</div>
  ${rows ? `<table><thead><tr><th>Produto</th><th class="c">Tam.</th><th class="c">Qtd.</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
  <div class="foot"><span>Pedido ${esc(data.order_id)}<br>${esc(when)}</span><img src="${qr}" width="90" height="90" alt=""></div>
</div></body></html>`
}

// Lista de separação: o total de pares por produto e tamanho (para ir à
// prateleira uma vez só) e, embaixo, o que vai em cada pedido.
export function pickingHTML(orders, storeName = 'Pizantt Drop') {
  const pairs = new Map()
  orders.forEach(o => (o.items || []).forEach(it => {
    const key = `${it.product_id || it.product_name}|${it.size}`
    const cur = pairs.get(key) || { name: it.product_name || it.name, brand: it.brand_name || '', size: it.size, qty: 0, orders: new Set() }
    cur.qty += Number(it.quantity) || 0
    cur.orders.add(o.id)
    pairs.set(key, cur)
  }))
  const rows = [...pairs.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size), 'pt-BR', { numeric: true }))
    .map(p => `<tr><td class="box"></td><td>${esc(p.name)}${p.brand ? `<br><small>${esc(p.brand)}</small>` : ''}</td><td class="c big">${esc(p.size)}</td><td class="c big">${p.qty}</td><td><small>${[...p.orders].map(id => `#${id}`).join(', ')}</small></td></tr>`)
    .join('')
  const perOrder = orders.map(o => `<div class="order"><strong>Pedido #${esc(o.id)}</strong> <small>${esc(o.customer_name)} | ${esc([o.address_city, o.address_state].filter(Boolean).join('/'))}</small>
    <ul>${(o.items || []).map(it => `<li><span class="box"></span> ${esc(it.quantity)}x ${esc(it.product_name || it.name)}, tam. ${esc(it.size)}</li>`).join('')}</ul>${o.gift_wrap ? '<p><b>Embrulho de presente</b></p>' : ''}</div>`).join('')
  const total = [...pairs.values()].reduce((n, p) => n + p.qty, 0)
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de separação</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #444; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  .c { text-align: center; }
  .big { font-size: 16px; font-weight: bold; }
  .box { width: 14px; }
  li .box, td.box::before { content: ''; display: inline-block; width: 12px; height: 12px; border: 1.5px solid #000; vertical-align: middle; }
  .order { break-inside: avoid; border-top: 1px solid #bbb; padding: 8px 0; }
  ul { list-style: none; padding: 0; margin: 6px 0 0; }
  li { margin: 3px 0; }
</style></head><body>
<h1>Lista de separação, ${esc(storeName)}</h1>
<div class="meta">${orders.length} pedidos, ${total} pares, ${esc(new Date().toLocaleString('pt-BR'))}</div>
<table><thead><tr><th class="box"></th><th>Produto</th><th class="c">Tam.</th><th class="c">Pares</th><th>Pedidos</th></tr></thead><tbody>${rows}</tbody></table>
${perOrder}
</body></html>`
}

// Imprime sem abrir janela nova (pop-up bloqueado não atrapalha).
export function printHTML(html) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(frame)
    const doc = frame.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()
    const go = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print() } finally {
        setTimeout(() => { frame.remove(); resolve() }, 1500)
      }
    }
    // espera o QR carregar (ou desiste em 2 s)
    const img = doc.querySelector('img')
    if (img && !img.complete) {
      const t = setTimeout(go, 2000)
      img.onload = img.onerror = () => { clearTimeout(t); go() }
    } else go()
  })
}

export function csvDownload(filename, header, rows) {
  const cell = (v) => {
    let x = String(v ?? '')
    // planilhas executam células que começam com = + - @: neutraliza
    if (/^[=+\-@]/.test(x)) x = `'${x}`
    return `"${x.replace(/"/g, '""')}"`
  }
  const csv = [header, ...rows].map(r => r.map(cell).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
