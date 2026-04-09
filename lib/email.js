/**
 * lib/email.js — Resend-based email notifications.
 * Falls back to console.log if RESEND_API_KEY is not set.
 */

const BASE_URL    = () => process.env.BASE_URL    || 'http://localhost:3000';
const ELTRU_EMAIL = () => process.env.ELTRU_EMAIL || 'hello@eltru.com';
const FROM        = 'Eltru <noreply@eltru.com>';

// Lazy-load Resend only when key is available
function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.startsWith('re_xxxx') || key === 'placeholder') return null;
  try {
    const { Resend } = require('resend');
    return new Resend(key);
  } catch (_) {
    return null;
  }
}

async function send(to, subject, html) {
  if (!to) return;
  const resend = getResend();
  if (!resend) {
    console.log('[EMAIL MOCK]', { to, subject, html: html.slice(0, 120) + '...' });
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error('[EMAIL ERROR]', err.message);
  }
}

// ── Shared style helpers ──────────────────────────────────────────────────
const CSS = `
  body{margin:0;padding:0;background:#F4F1EC;font-family:Inter,Arial,sans-serif;color:#1A1A1A}
  .wrap{max-width:580px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)}
  .hdr{background:#1C3B2A;padding:28px 36px;color:#fff}
  .hdr-logo{font-family:Georgia,serif;font-size:24px;font-weight:700;letter-spacing:.04em}
  .hdr-logo span{color:#D4AF7A}
  .hdr-sub{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.7;margin-top:2px}
  .body{padding:32px 36px}
  h2{font-family:Georgia,serif;font-size:1.5rem;color:#1C3B2A;margin:0 0 12px}
  p{font-size:.9rem;line-height:1.6;color:#444;margin:0 0 14px}
  .code-box{background:#E8F0EB;border:1.5px solid #1C3B2A;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center}
  .code{font-family:'Courier New',monospace;font-size:1.8rem;font-weight:700;color:#1C3B2A;letter-spacing:.1em}
  table.spec{width:100%;border-collapse:collapse;margin:16px 0;font-size:.85rem}
  table.spec td{padding:7px 0;border-bottom:1px solid #EEE}
  table.spec td:first-child{color:#888;width:38%}
  table.spec td:last-child{font-weight:500}
  .price-row{display:flex;justify-content:space-between;font-size:.85rem;padding:5px 0}
  .price-row.total{border-top:1px solid #EEE;margin-top:6px;padding-top:8px;font-weight:700;font-size:1rem;color:#1C3B2A}
  .cta{display:inline-block;margin:20px 0;padding:13px 28px;background:#1C3B2A;color:#fff;text-decoration:none;border-radius:8px;font-size:.85rem;font-weight:600;letter-spacing:.04em}
  .footer{background:#F4F1EC;padding:20px 36px;font-size:.75rem;color:#888;border-top:1px solid #E0D8CE;display:flex;justify-content:space-between}
  .alert-box{background:#FEF9F0;border-left:4px solid #B8965A;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0;font-size:.85rem}
`;

function wrap(innerHtml) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head>
<body><div class="wrap">${innerHtml}</div></body></html>`;
}

function specTable(rows) {
  const trs = rows.filter(r => r[1]).map(([k, v]) =>
    `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  return `<table class="spec"><tbody>${trs}</tbody></table>`;
}

function priceLine(label, val, bold = false) {
  const s = bold ? 'class="price-row total"' : 'class="price-row"';
  return `<div ${s}><span>${label}</span><span>${val}</span></div>`;
}

const fmt = v => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0 });

function configSpecRows(c) {
  return [
    ['Brand',    c.brand?.name],
    ['Style',    c.style?.name],
    ['Size',     c.size?.label],
    ['Height',   c.height_2 ? `${c.height?.label} / ${c.height_2?.label}` : c.height?.label],
    ['Fabric',   c.fabric?.name],
    ['Trim',     c.trim?.name],
    ['Glass',    c.glass?.name],
    ['Pedestal', c.pedestal?.name],
    ['Quantity', c.quantity ?? 1],
  ].filter(r => r[1]);
}

// ── sendConfigSavedEmail ──────────────────────────────────────────────────
async function sendConfigSavedEmail(config) {
  const code     = config.config_code;
  const unitPrice = config.base_price_usd || 0;
  const total    = (config.total_price_usd || unitPrice) ;
  const qty      = config.quantity || 1;
  const viewUrl  = `${BASE_URL()}/?config=${code}`;
  const salesUrl = `${BASE_URL()}/sales.html?config=${code}`;

  // ── Email to client ───────────────────────────────────────────────────
  if (config.client_email) {
    const clientHtml = wrap(`
      <div class="hdr">
        <div class="hdr-logo">elt<span>ru</span></div>
        <div class="hdr-sub">Cubicle Configurator</div>
      </div>
      <div class="body">
        <h2>Your configuration is saved</h2>
        <p>Thank you${config.client_name ? `, ${config.client_name}` : ''}! Your Eltru cubicle configuration has been saved. Reference this code when speaking with our team.</p>
        <div class="code-box">
          <div style="font-size:.7rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:6px">Configuration Code</div>
          <div class="code">${code}</div>
        </div>
        ${specTable(configSpecRows(config))}
        <div>
          ${priceLine('Unit price', fmt(unitPrice / qty))}
          ${priceLine(`Quantity`, `× ${qty}`)}
          ${priceLine('Total', fmt(total), true)}
        </div>
        <p style="margin-top:16px">Our team will be in touch with a formal quote. In the meantime, you can view your configuration at any time:</p>
        <a class="cta" href="${viewUrl}">View Your Configuration</a>
        <p style="font-size:.8rem;color:#888">Questions? Reply to this email or reach us at hello@eltru.com</p>
      </div>
      <div class="footer">
        <span><strong style="color:#1C3B2A">eltru.com</strong> · Long Island, NY</span>
        <span>hello@eltru.com</span>
      </div>
    `);
    await send(config.client_email,
      `Your Eltru cubicle configuration — ${code}`, clientHtml);
  }

  // ── Email to Eltru team (always) ──────────────────────────────────────
  const internalHtml = wrap(`
    <div class="hdr">
      <div class="hdr-logo">elt<span>ru</span></div>
      <div class="hdr-sub">New Configuration Saved</div>
    </div>
    <div class="body">
      <h2>New configuration: ${code}</h2>
      <div class="alert-box">
        <strong>Client:</strong> ${config.client_name || 'Anonymous'}
        ${config.client_email  ? ` · ${config.client_email}` : ''}
        ${config.client_company ? ` · ${config.client_company}` : ''}
      </div>
      ${specTable(configSpecRows(config))}
      <div>
        ${priceLine('Unit price', fmt(unitPrice / qty))}
        ${priceLine(`Quantity`, `× ${qty}`)}
        ${priceLine('Total', fmt(total), true)}
      </div>
      ${config.notes ? `<p style="margin-top:12px;font-size:.85rem"><strong>Notes:</strong> ${config.notes}</p>` : ''}
      <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap">
        <a class="cta" href="${viewUrl}">View Configuration</a>
        <a class="cta" style="background:#B8965A" href="${salesUrl}">Create Quote</a>
      </div>
    </div>
    <div class="footer">
      <span>Eltru Configurator · Internal notification</span>
      <span>${new Date().toLocaleDateString('en-US')}</span>
    </div>
  `);
  await send(ELTRU_EMAIL(),
    `New config — ${code} — ${config.client_name || 'Anonymous'}`, internalHtml);
}

// ── sendQuoteAcceptedEmail ────────────────────────────────────────────────
async function sendQuoteAcceptedEmail(quote, config) {
  const code      = config.config_code;
  const unitPrice = quote.custom_price_usd
    || (quote.discount_pct ? Math.round((config.base_price_usd || 0) * (1 - quote.discount_pct / 100)) : config.base_price_usd || 0);
  const qty       = config.quantity || 1;
  const total     = unitPrice * qty;
  const salesUrl  = `${BASE_URL()}/sales.html?config=${code}`;

  // ── Email to client ───────────────────────────────────────────────────
  const clientEmail = config.client_email;
  if (clientEmail) {
    const clientHtml = wrap(`
      <div class="hdr">
        <div class="hdr-logo">elt<span>ru</span></div>
        <div class="hdr-sub">Quote Accepted</div>
      </div>
      <div class="body">
        <h2>Quote accepted — we'll be in touch!</h2>
        <p>Thank you${config.client_name ? `, ${config.client_name}` : ''}! We've received your quote acceptance and will contact you within 1 business day to confirm your order.</p>
        <div class="code-box">
          <div style="font-size:.7rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:6px">Reference Code</div>
          <div class="code">${code}</div>
        </div>
        <div>
          ${priceLine('Unit price', fmt(unitPrice))}
          ${priceLine(`Quantity`, `× ${qty}`)}
          ${priceLine('Total', fmt(total), true)}
        </div>
        <p style="margin-top:16px">Questions? Reply to this email or contact us at hello@eltru.com</p>
      </div>
      <div class="footer">
        <span><strong style="color:#1C3B2A">eltru.com</strong> · Long Island, NY</span>
        <span>hello@eltru.com</span>
      </div>
    `);
    await send(clientEmail, `Quote accepted — ${code} — We'll be in touch!`, clientHtml);
  }

  // ── Email to Eltru team ───────────────────────────────────────────────
  const internalHtml = wrap(`
    <div class="hdr" style="background:#9B2E1A">
      <div class="hdr-logo">elt<span>ru</span></div>
      <div class="hdr-sub">⚡ Quote Accepted — Action Needed</div>
    </div>
    <div class="body">
      <h2>⚡ Quote accepted: ${code}</h2>
      <div class="alert-box" style="border-color:#C0392B;background:#FDF2F2">
        <strong>Action required:</strong> Client has accepted. Follow up within 1 business day.
      </div>
      <div class="alert-box">
        <strong>Salesperson:</strong> ${quote.salesperson || 'N/A'}<br>
        <strong>Client:</strong> ${config.client_name || 'N/A'}${config.client_email ? ` · ${config.client_email}` : ''}${config.client_company ? ` · ${config.client_company}` : ''}<br>
        <strong>Accepted price:</strong> ${fmt(total)} (${fmt(unitPrice)} × ${qty})
      </div>
      ${specTable(configSpecRows(config))}
      <a class="cta" href="${salesUrl}">Open in Sales Tool</a>
    </div>
    <div class="footer">
      <span>Eltru Configurator · Internal notification</span>
      <span>Accepted: ${new Date().toLocaleString('en-US')}</span>
    </div>
  `);
  await send(ELTRU_EMAIL(),
    `⚡ Quote accepted — ${code} — ACTION NEEDED`, internalHtml);
}

// ── sendQuoteLinkEmail ────────────────────────────────────────────────────
async function sendQuoteLinkEmail(quote, config, recipientEmail) {
  const code      = config.config_code;
  const unitPrice = quote.custom_price_usd
    || (quote.discount_pct ? Math.round((config.base_price_usd || 0) * (1 - quote.discount_pct / 100)) : config.base_price_usd || 0);
  const qty       = config.quantity || 1;
  const total     = unitPrice * qty;
  const quoteUrl  = `${BASE_URL()}/quote.html?token=${quote.link_token}`;
  const expiresStr = quote.expires_at
    ? new Date(quote.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const html = wrap(`
    <div class="hdr">
      <div class="hdr-logo">elt<span>ru</span></div>
      <div class="hdr-sub">Custom Cubicle Quote</div>
    </div>
    <div class="body">
      <h2>Your custom Eltru quote</h2>
      <p>${quote.salesperson ? `<strong>${quote.salesperson}</strong> at Eltru` : 'The Eltru team'} has prepared a custom quote for your cubicle configuration.</p>
      ${quote.notes_client ? `<div class="alert-box">${quote.notes_client}</div>` : ''}
      <a class="cta" href="${quoteUrl}">View Your Quote →</a>
      ${expiresStr ? `<p style="font-size:.8rem;color:#888;margin-top:4px">This link expires on ${expiresStr}.</p>` : ''}
      ${specTable(configSpecRows(config))}
      <div>
        ${priceLine('Unit price', fmt(unitPrice))}
        ${priceLine(`Quantity`, `× ${qty}`)}
        ${priceLine('Total', fmt(total), true)}
      </div>
      <p style="margin-top:16px;font-size:.85rem">Reference code: <strong>${code}</strong></p>
    </div>
    <div class="footer">
      <span><strong style="color:#1C3B2A">eltru.com</strong> · Long Island, NY</span>
      <span>hello@eltru.com</span>
    </div>
  `);
  await send(recipientEmail,
    `Your Eltru cubicle quote — ${code}`, html);
}

module.exports = { sendConfigSavedEmail, sendQuoteAcceptedEmail, sendQuoteLinkEmail };
