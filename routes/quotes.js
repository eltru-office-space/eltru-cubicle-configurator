const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../lib/supabase');
const { nanoid } = require('nanoid');

// POST /api/quotes — create a shareable quote link
router.post('/', async (req, res) => {
  try {
    const {
      config_id,
      salesperson,
      custom_price_usd,
      discount_pct,
      notes_internal,
      notes_client,
      expires_days = 30,
    } = req.body;

    if (!config_id) {
      return res.status(400).json({ success: false, error: 'config_id is required' });
    }

    // Validate config exists
    const { data: configCheck, error: configErr } = await supabaseAdmin
      .from('configurations')
      .select('id, config_code')
      .eq('id', config_id)
      .single();

    if (configErr || !configCheck) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }

    const link_token = nanoid(16);
    const expires_at = new Date(Date.now() + expires_days * 86400 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('quote_links')
      .insert({
        link_token,
        config_id,
        salesperson,
        custom_price_usd,
        discount_pct,
        notes_internal,
        notes_client,
        expires_at,
        is_active: true,
        view_count: 0,
      })
      .select('id, link_token')
      .single();

    if (error) throw error;

    const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
    const share_url = `${BASE_URL}/quote.html?token=${data.link_token}`;

    res.json({ success: true, link_token: data.link_token, share_url, expires_at });
  } catch (err) {
    console.error('POST /api/quotes error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/quotes/:token — load quote by token
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data, error } = await supabaseAdmin
      .from('quote_links')
      .select('*')
      .eq('link_token', token)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    if (!data.is_active) {
      return res.status(410).json({ success: false, error: 'quote_inactive' });
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'quote_expired' });
    }

    // Increment view count, set viewed_at on first view
    const updates = { view_count: (data.view_count || 0) + 1 };
    if (!data.viewed_at) updates.viewed_at = new Date().toISOString();
    await supabaseAdmin.from('quote_links').update(updates).eq('link_token', token);

    // Load enriched config
    const { data: config } = await supabaseAdmin
      .from('configurations')
      .select('*')
      .eq('id', data.config_id)
      .single();

    // Enrich with names
    let enrichedConfig = config || null;
    if (config) {
      const lookups = await Promise.all([
        config.brand_id    ? supabaseAdmin.from('brands').select('id,name,slug').eq('id', config.brand_id).single()        : null,
        config.style_id    ? supabaseAdmin.from('styles').select('id,name,slug').eq('id', config.style_id).single()        : null,
        config.size_id     ? supabaseAdmin.from('sizes').select('id,label,width_in,depth_in').eq('id', config.size_id).single()               : null,
        config.height_id   ? supabaseAdmin.from('heights').select('id,label,height_in').eq('id', config.height_id).single()          : null,
        config.height_id_2 ? supabaseAdmin.from('heights').select('id,label,height_in').eq('id', config.height_id_2).single()        : null,
        config.fabric_id   ? supabaseAdmin.from('fabrics').select('id,name,hex_color').eq('id', config.fabric_id).single() : null,
        config.trim_id     ? supabaseAdmin.from('trims').select('id,name,hex_color').eq('id', config.trim_id).single()    : null,
        config.glass_id    ? supabaseAdmin.from('glass_options').select('id,name').eq('id', config.glass_id).single()     : null,
        config.pedestal_id ? supabaseAdmin.from('pedestals').select('id,name').eq('id', config.pedestal_id).single()      : null,
      ]);
      const [brandR, styleR, sizeR, heightR, height2R, fabricR, trimR, glassR, pedestalR] = lookups;
      enrichedConfig = {
        ...config,
        brand: brandR?.data || null, style: styleR?.data || null,
        size: sizeR?.data || null,   height: heightR?.data || null,
        height_2: height2R?.data || null,
        fabric: fabricR?.data || null, trim: trimR?.data || null,
        glass: glassR?.data || null,   pedestal: pedestalR?.data || null,
      };
    }

    res.json({
      success: true,
      quote: {
        link_token: data.link_token,
        salesperson: data.salesperson,
        custom_price_usd: data.custom_price_usd,
        discount_pct: data.discount_pct,
        notes_client: data.notes_client,
        expires_at: data.expires_at,
        view_count: updates.view_count,
        config: enrichedConfig,
      },
    });
  } catch (err) {
    console.error('GET /api/quotes/:token error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/quotes/:token/accept — client accepts the quote
router.post('/:token/accept', async (req, res) => {
  try {
    const { token } = req.params;

    const { data, error } = await supabaseAdmin
      .from('quote_links')
      .select('id, is_active, expires_at, accepted_at')
      .eq('link_token', token)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }
    if (!data.is_active) {
      return res.status(410).json({ success: false, error: 'quote_inactive' });
    }
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'quote_expired' });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('quote_links')
      .update({ accepted_at: new Date().toISOString() })
      .eq('link_token', token);

    if (updateErr) throw updateErr;

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/quotes/:token/accept error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
