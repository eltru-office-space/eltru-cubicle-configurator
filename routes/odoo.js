/**
 * routes/odoo.js — Structured data endpoints for Odoo / OpenClaw integration.
 * Protected by ADMIN_PASSWORD header.
 *
 * GET /api/odoo/config/:code   — config structured for Odoo
 * GET /api/odoo/quote/:token   — quote structured for Odoo
 */

const express = require('express');
const router  = express.Router();
const { supabaseAdmin } = require('../lib/supabase');

// ── Auth middleware ────────────────────────────────────────────────────────
router.use((req, res, next) => {
  const auth = req.headers['authorization'];
  // Accept "Bearer <pw>" or bare "<pw>"
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
});

// ── Shared helpers ─────────────────────────────────────────────────────────
async function enrichConfig(config) {
  const lookups = await Promise.all([
    config.brand_id    ? supabaseAdmin.from('brands').select('id,name,slug').eq('id', config.brand_id).single()             : null,
    config.style_id    ? supabaseAdmin.from('styles').select('id,name,slug').eq('id', config.style_id).single()             : null,
    config.size_id     ? supabaseAdmin.from('sizes').select('id,label,width_in,depth_in').eq('id', config.size_id).single() : null,
    config.height_id   ? supabaseAdmin.from('heights').select('id,label,height_in').eq('id', config.height_id).single()     : null,
    config.height_id_2 ? supabaseAdmin.from('heights').select('id,label,height_in').eq('id', config.height_id_2).single()   : null,
    config.fabric_id   ? supabaseAdmin.from('fabrics').select('id,name,slug').eq('id', config.fabric_id).single()           : null,
    config.trim_id     ? supabaseAdmin.from('trims').select('id,name,slug').eq('id', config.trim_id).single()               : null,
    config.glass_id    ? supabaseAdmin.from('glass_options').select('id,name,slug').eq('id', config.glass_id).single()      : null,
    config.pedestal_id ? supabaseAdmin.from('pedestals').select('id,name,slug').eq('id', config.pedestal_id).single()       : null,
  ]);
  const [brandR, styleR, sizeR, heightR, height2R, fabricR, trimR, glassR, pedestalR] = lookups;
  return {
    ...config,
    brand:    brandR?.data    || null,
    style:    styleR?.data    || null,
    size:     sizeR?.data     || null,
    height:   heightR?.data   || null,
    height_2: height2R?.data  || null,
    fabric:   fabricR?.data   || null,
    trim:     trimR?.data     || null,
    glass:    glassR?.data    || null,
    pedestal: pedestalR?.data || null,
  };
}

function buildOdooPayload(config, quote = null) {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  const code     = config.config_code;
  const qty      = config.quantity || 1;

  // Resolve price
  const basePrice  = config.base_price_usd || 0;
  const totalPrice = config.total_price_usd || basePrice;
  let unitPrice = totalPrice / qty;

  if (quote?.custom_price_usd) {
    unitPrice = quote.custom_price_usd;
  } else if (quote?.discount_pct) {
    unitPrice = Math.round((totalPrice / qty) * (1 - quote.discount_pct / 100));
  }

  const total = unitPrice * qty;

  // Build human-readable strings
  const brand   = config.brand?.name   || '';
  const style   = config.style?.name   || '';
  const size    = config.size?.label   || '';
  const heightStr = config.height_2
    ? `${config.height?.label} / ${config.height_2?.label}`
    : (config.height?.label || '');
  const fabric  = config.fabric?.name   || '';
  const trim    = config.trim?.name     || '';
  const glass   = config.glass?.name    || '';
  const pedestal= config.pedestal?.name || '';

  const productName = [brand, style, 'Cubicle', fabric ? `— ${fabric}` : '', trim ? `/ ${trim}` : '']
    .filter(Boolean).join(' ');

  const descParts = [
    size && `${size}`,
    heightStr && `${heightStr}H`,
    fabric && `${fabric} fabric`,
    trim && `${trim} trim`,
    glass && glass.toLowerCase() !== 'none' && glass,
    pedestal && pedestal.toLowerCase() !== 'none' && pedestal,
    `Qty: ${qty}`,
  ].filter(Boolean);

  const description = [brand, style, '|', ...descParts.join(' | ').split(' | ').map(s => s)].join(' ');

  const internalNotesParts = [
    `Config: ${code}`,
    fabric   && `Fabric: ${fabric}`,
    trim     && `Trim: ${trim}`,
    glass    && glass.toLowerCase() !== 'none' && `Glass: ${glass}`,
    pedestal && pedestal.toLowerCase() !== 'none' && `Pedestal: ${pedestal}`,
    config.outlet_count  && `Outlets: ${config.outlet_count}`,
    config.harness_count && `Harness: ${config.harness_count}`,
    config.notes         && `Notes: ${config.notes}`,
  ].filter(Boolean).join(' | ');

  const payload = {
    config_code:           code,
    odoo_product_name:     productName,
    odoo_description:      description,
    odoo_internal_notes:   internalNotesParts,
    line_items: [{
      name:        `${brand} ${style} Cubicle`,
      description: descParts.slice(0, 5).join(' | '),
      quantity:    qty,
      unit_price:  unitPrice,
      total:       total,
    }],
    client: {
      name:    config.client_name    || null,
      email:   config.client_email   || null,
      company: config.client_company || null,
    },
    totals: {
      unit_price: unitPrice,
      quantity:   qty,
      subtotal:   total,
      note:       'Installation quoted separately',
    },
    meta: {
      brand:    brand    || null,
      style:    style    || null,
      size:     size     || null,
      height:   heightStr|| null,
      fabric:   fabric   || null,
      trim:     trim     || null,
      glass:    glass    || null,
      pedestal: pedestal || null,
      outlets:  config.outlet_count  || 0,
      harness:  config.harness_count || 0,
      created_at: config.created_at,
    },
    pdf_url:          `${BASE_URL}/api/pdf/download/${code}`,
    configurator_url: `${BASE_URL}/?config=${code}`,
  };

  if (quote) {
    payload.quote_token   = quote.link_token;
    payload.custom_price  = quote.custom_price_usd || null;
    payload.salesperson   = quote.salesperson       || null;
    payload.expires_at    = quote.expires_at        || null;
    payload.accepted_at   = quote.accepted_at       || null;
  }

  return payload;
}

// ── GET /api/odoo/config/:code ─────────────────────────────────────────────
router.get('/config/:code', async (req, res) => {
  try {
    const { data: config, error } = await supabaseAdmin
      .from('configurations')
      .select('*')
      .eq('config_code', req.params.code.toUpperCase())
      .single();

    if (error || !config) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }

    const enriched = await enrichConfig(config);
    res.json({ success: true, ...buildOdooPayload(enriched) });
  } catch (err) {
    console.error('GET /api/odoo/config error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/odoo/quote/:token ─────────────────────────────────────────────
router.get('/quote/:token', async (req, res) => {
  try {
    const { data: quote, error: qErr } = await supabaseAdmin
      .from('quote_links')
      .select('*')
      .eq('link_token', req.params.token)
      .single();

    if (qErr || !quote) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    const { data: config, error: cErr } = await supabaseAdmin
      .from('configurations')
      .select('*')
      .eq('id', quote.config_id)
      .single();

    if (cErr || !config) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }

    const enriched = await enrichConfig(config);
    res.json({ success: true, ...buildOdooPayload(enriched, quote) });
  } catch (err) {
    console.error('GET /api/odoo/quote error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
