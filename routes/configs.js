const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../lib/supabase');
const { generateConfigCode } = require('../lib/configCode');

// POST /api/configs — save a new configuration
router.post('/', async (req, res) => {
  try {
    const {
      brand_id, style_id, size_id, height_id, height_id_2,
      fabric_id, trim_id, glass_id, pedestal_id,
      quantity, outlet_count, harness_count, monitor_arm,
      base_price_usd, total_price_usd,
      client_name, client_email, client_company, notes,
      created_by, session_id,
    } = req.body;

    // Generate a unique config code (retry on collision)
    let config_code;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateConfigCode();
      const { data: existing } = await supabaseAdmin
        .from('configurations')
        .select('id')
        .eq('config_code', candidate)
        .maybeSingle();
      if (!existing) { config_code = candidate; break; }
    }
    if (!config_code) throw new Error('Failed to generate a unique config code after 10 attempts');

    const { data, error } = await supabaseAdmin
      .from('configurations')
      .insert({
        config_code, brand_id, style_id, size_id,
        height_id, height_id_2, fabric_id, trim_id, glass_id, pedestal_id,
        quantity, outlet_count, harness_count, monitor_arm,
        base_price_usd, total_price_usd,
        client_name, client_email, client_company, notes,
        created_by, session_id,
      })
      .select('id, config_code')
      .single();

    if (error) throw error;

    const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
    const share_url = `${BASE_URL}/?config=${data.config_code}`;

    res.json({ success: true, config_code: data.config_code, config_id: data.id, share_url });
  } catch (err) {
    console.error('POST /api/configs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/configs/:code — load config by code with enriched data
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;

    // Load the raw config
    const { data: config, error: configErr } = await supabaseAdmin
      .from('configurations')
      .select('*')
      .eq('config_code', code.toUpperCase())
      .single();

    if (configErr || !config) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }

    // Enrich with human-readable names via parallel lookups
    const lookups = await Promise.all([
      config.brand_id    ? supabaseAdmin.from('brands').select('id,name,slug').eq('id', config.brand_id).single()       : null,
      config.style_id    ? supabaseAdmin.from('styles').select('id,name,slug').eq('id', config.style_id).single()       : null,
      config.size_id     ? supabaseAdmin.from('sizes').select('id,label,width_in,depth_in').eq('id', config.size_id).single()              : null,
      config.height_id   ? supabaseAdmin.from('heights').select('id,label,height_in').eq('id', config.height_id).single()         : null,
      config.height_id_2 ? supabaseAdmin.from('heights').select('id,label,height_in').eq('id', config.height_id_2).single()       : null,
      config.fabric_id   ? supabaseAdmin.from('fabrics').select('id,name,hex_color').eq('id', config.fabric_id).single(): null,
      config.trim_id     ? supabaseAdmin.from('trims').select('id,name,hex_color').eq('id', config.trim_id).single()   : null,
      config.glass_id    ? supabaseAdmin.from('glass_options').select('id,name,slug').eq('id', config.glass_id).single(): null,
      config.pedestal_id ? supabaseAdmin.from('pedestals').select('id,name,slug').eq('id', config.pedestal_id).single() : null,
    ]);

    const [brandRes, styleRes, sizeRes, heightRes, height2Res,
           fabricRes, trimRes, glassRes, pedestalRes] = lookups;

    // Calculate total price from pricing table
    const pricingLookups = await Promise.all([
      config.brand_id && config.style_id
        ? supabaseAdmin.from('pricing').select('price_usd').eq('brand_id', config.brand_id).eq('style_id', config.style_id).single()
        : null,
      config.glass_id
        ? supabaseAdmin.from('pricing').select('price_usd').eq('glass_id', config.glass_id).single()
        : null,
      config.pedestal_id
        ? supabaseAdmin.from('pricing').select('price_usd').eq('pedestal_id', config.pedestal_id).single()
        : null,
    ]);

    const basePrice     = pricingLookups[0]?.data?.price_usd || config.base_price_usd || 0;
    const glassPrice    = pricingLookups[1]?.data?.price_usd || 0;
    const pedestalPrice = pricingLookups[2]?.data?.price_usd || 0;
    const qty           = config.quantity || 1;
    const calculated_total = (basePrice + glassPrice + pedestalPrice) * qty;

    const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

    res.json({
      success: true,
      config: {
        ...config,
        brand:    brandRes?.data    || null,
        style:    styleRes?.data    || null,
        size:     sizeRes?.data     || null,
        height:   heightRes?.data   || null,
        height_2: height2Res?.data  || null,
        fabric:   fabricRes?.data   || null,
        trim:     trimRes?.data     || null,
        glass:    glassRes?.data    || null,
        pedestal: pedestalRes?.data || null,
        calculated_total,
        share_url: `${BASE_URL}/?config=${config.config_code}`,
      },
    });
  } catch (err) {
    console.error('GET /api/configs/:code error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
