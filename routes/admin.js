const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { supabaseAdmin } = require('../lib/supabase');

// ── Auth middleware ────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

router.use(requireAdmin);

// ── Multer (memory storage — we forward bytes to Supabase) ─────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter(req, file, cb) {
    const ok = ['image/webp', 'image/png', 'image/jpeg'].includes(file.mimetype);
    cb(ok ? null : new Error('Only webp/png/jpeg accepted'), ok);
  },
});

// ── Helper: table name → FK column name ───────────────────────────────────
const OPTION_MAP = {
  panel:    { table: 'fabrics',      col: 'fabric_id' },
  trim:     { table: 'trims',        col: 'trim_id'   },
  glass:    { table: 'glass_options', col: 'glass_id' },
  pedestal: { table: 'pedestals',    col: 'pedestal_id' },
};

// ── GET /api/admin/layers — all layer assets ───────────────────────────────
router.get('/layers', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('layer_assets')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    res.json({ success: true, layers: data });
  } catch (err) {
    console.error('GET /api/admin/layers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/admin/layers/upload — upload a layer image ──────────────────
router.post('/layers/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const { brand_slug, style_slug, layer_type, option_slug, height_slug } = req.body;
    if (!brand_slug || !style_slug || !layer_type) {
      return res.status(400).json({ success: false, error: 'brand_slug, style_slug, layer_type required' });
    }

    // Resolve brand
    const { data: brandRow, error: bErr } = await supabaseAdmin
      .from('brands').select('id').eq('slug', brand_slug).single();
    if (bErr || !brandRow) return res.status(404).json({ success: false, error: `Brand "${brand_slug}" not found` });

    // Resolve style
    const { data: styleRow, error: sErr } = await supabaseAdmin
      .from('styles').select('id').eq('slug', style_slug).eq('brand_id', brandRow.id).single();
    if (sErr || !styleRow) return res.status(404).json({ success: false, error: `Style "${style_slug}" not found` });

    // Resolve option FK
    const optionFKs = {};
    if (option_slug && OPTION_MAP[layer_type]) {
      const { table, col } = OPTION_MAP[layer_type];
      const { data: optRow } = await supabaseAdmin
        .from(table).select('id').eq('slug', option_slug).single();
      if (optRow) optionFKs[col] = optRow.id;
    }

    // Resolve height FK (optional)
    let height_id = null;
    if (height_slug) {
      const { data: hRow } = await supabaseAdmin
        .from('heights').select('id').eq('slug', height_slug).eq('brand_id', brandRow.id).maybeSingle();
      if (hRow) height_id = hRow.id;
    }

    // Build storage path
    const ext = req.file.mimetype === 'image/webp' ? 'webp' : 'png';
    const optPart = option_slug ? `-${option_slug}` : '';
    const hPart   = height_slug ? `-${height_slug}` : '';
    const storagePath = `${brand_slug}/${style_slug}/${layer_type}${optPart}${hPart}.${ext}`;

    // Upload to Supabase Storage (upsert)
    const { error: upErr } = await supabaseAdmin.storage
      .from('layers')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage.from('layers').getPublicUrl(storagePath);
    const storage_url = urlData.publicUrl;

    // Upsert layer_assets row
    const row = {
      brand_id:     brandRow.id,
      style_id:     styleRow.id,
      layer_type,
      height_id,
      storage_path: storagePath,
      storage_url,
      ...optionFKs,
    };

    // Check for existing row to decide insert vs update
    let layerQuery = supabaseAdmin.from('layer_assets')
      .select('id')
      .eq('brand_id', brandRow.id)
      .eq('style_id', styleRow.id)
      .eq('layer_type', layer_type);

    if (optionFKs.fabric_id)   layerQuery = layerQuery.eq('fabric_id',   optionFKs.fabric_id);
    if (optionFKs.trim_id)     layerQuery = layerQuery.eq('trim_id',     optionFKs.trim_id);
    if (optionFKs.glass_id)    layerQuery = layerQuery.eq('glass_id',    optionFKs.glass_id);
    if (optionFKs.pedestal_id) layerQuery = layerQuery.eq('pedestal_id', optionFKs.pedestal_id);
    if (!option_slug) {
      layerQuery = layerQuery
        .is('fabric_id',   null)
        .is('trim_id',     null)
        .is('glass_id',    null)
        .is('pedestal_id', null);
    }

    const { data: existing } = await layerQuery.maybeSingle();

    let layerId;
    if (existing) {
      await supabaseAdmin.from('layer_assets').update(row).eq('id', existing.id);
      layerId = existing.id;
    } else {
      const { data: ins, error: insErr } = await supabaseAdmin
        .from('layer_assets').insert(row).select('id').single();
      if (insErr) throw insErr;
      layerId = ins.id;
    }

    res.json({ success: true, layer_id: layerId, storage_url });
  } catch (err) {
    console.error('POST /api/admin/layers/upload error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/admin/layers/:id ───────────────────────────────────────────
router.delete('/layers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get storage_path first
    const { data: layer, error: fetchErr } = await supabaseAdmin
      .from('layer_assets').select('storage_path').eq('id', id).single();

    if (fetchErr || !layer) return res.status(404).json({ success: false, error: 'Layer not found' });

    // Delete from storage
    if (layer.storage_path) {
      await supabaseAdmin.storage.from('layers').remove([layer.storage_path]);
    }

    // Delete DB row
    const { error: delErr } = await supabaseAdmin.from('layer_assets').delete().eq('id', id);
    if (delErr) throw delErr;

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/layers/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/admin/layers — add a layer asset (JSON, legacy) ─────────────
router.post('/layers', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('layer_assets').insert(req.body).select().single();
    if (error) throw error;
    res.json({ success: true, layer: data });
  } catch (err) {
    console.error('POST /api/admin/layers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/admin/configs — recent 50 configurations ─────────────────────
router.get('/configs', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('configurations').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json({ success: true, configs: data });
  } catch (err) {
    console.error('GET /api/admin/configs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/admin/pricing — all pricing rows ─────────────────────────────
router.get('/pricing', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('pricing').select('*').order('id', { ascending: true });
    if (error) throw error;
    res.json({ success: true, pricing: data });
  } catch (err) {
    console.error('GET /api/admin/pricing error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/admin/pricing/:id — update price ─────────────────────────────
router.put('/pricing/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { price_usd } = req.body;

    if (price_usd === undefined || isNaN(Number(price_usd))) {
      return res.status(400).json({ success: false, error: 'price_usd is required and must be a number' });
    }

    const { data, error } = await supabaseAdmin
      .from('pricing')
      .update({ price_usd: Number(price_usd) })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, updated: data });
  } catch (err) {
    console.error('PUT /api/admin/pricing/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/admin/pricing-by-size ────────────────────────────────────────
router.get('/pricing-by-size', async (req, res) => {
  try {
    const { brand_slug, style_slug } = req.query;
    if (!brand_slug || !style_slug) {
      return res.status(400).json({ success: false, error: 'brand_slug and style_slug required' });
    }

    const { data: brand, error: bErr } = await supabaseAdmin.from('brands').select('id').eq('slug', brand_slug).single();
    if (bErr || !brand) return res.status(404).json({ success: false, error: 'Brand not found' });

    const { data: style, error: sErr } = await supabaseAdmin.from('styles').select('id').eq('slug', style_slug).eq('brand_id', brand.id).single();
    if (sErr || !style) return res.status(404).json({ success: false, error: 'Style not found' });

    const [
      { data: allPricing },
      { data: sizes },
      { data: heights },
      { data: fabrics },
      { data: trims },
      { data: glassOptions },
      { data: pedestals },
    ] = await Promise.all([
      supabaseAdmin.from('pricing').select('*'),
      supabaseAdmin.from('sizes').select('*').eq('style_id', style.id).order('sort_order'),
      supabaseAdmin.from('heights').select('*').eq('brand_id', brand.id).order('height_in'),
      supabaseAdmin.from('fabrics').select('*').order('sort_order'),
      supabaseAdmin.from('trims').select('*').order('sort_order'),
      supabaseAdmin.from('glass_options').select('*').order('sort_order'),
      supabaseAdmin.from('pedestals').select('*').order('sort_order'),
    ]);

    const pricing = { base: {}, height_addons: {}, fabric_addons: {}, trim_addons: {}, glass_addons: {}, pedestal_addons: {} };

    for (const row of (allPricing || [])) {
      const inBS = row.brand_id === brand.id && row.style_id === style.id;
      if (inBS && row.size_id && !row.height_id && !row.fabric_id && !row.trim_id && !row.glass_id && !row.pedestal_id) {
        pricing.base[row.size_id] = { id: row.id, price: row.price_usd };
      } else if (inBS && row.size_id && row.height_id) {
        if (!pricing.height_addons[row.size_id]) pricing.height_addons[row.size_id] = {};
        pricing.height_addons[row.size_id][row.height_id] = { id: row.id, price: row.price_usd };
      } else if (inBS && row.fabric_id && !row.size_id) {
        pricing.fabric_addons[row.fabric_id] = { id: row.id, price: row.price_usd };
      } else if (inBS && row.trim_id && !row.size_id) {
        pricing.trim_addons[row.trim_id] = { id: row.id, price: row.price_usd };
      } else if (inBS && row.size_id && row.glass_id) {
        if (!pricing.glass_addons[row.size_id]) pricing.glass_addons[row.size_id] = {};
        pricing.glass_addons[row.size_id][row.glass_id] = { id: row.id, price: row.price_usd };
      } else if (row.pedestal_id && !row.brand_id) {
        pricing.pedestal_addons[row.pedestal_id] = { id: row.id, price: row.price_usd };
      }
    }

    res.json({
      success: true,
      pricing,
      sizes:        sizes        || [],
      heights:      heights      || [],
      fabrics:      fabrics      || [],
      trims:        trims        || [],
      glass_options: glassOptions || [],
      pedestals:    pedestals    || [],
    });
  } catch (err) {
    console.error('GET /api/admin/pricing-by-size error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/admin/pricing — upsert by FK combination ─────────────────────
router.put('/pricing', async (req, res) => {
  try {
    const { type, option_id, size_id, brand_slug, style_slug, price_usd } = req.body;
    if (price_usd === undefined || isNaN(Number(price_usd))) {
      return res.status(400).json({ success: false, error: 'price_usd must be a number' });
    }
    if (!type) return res.status(400).json({ success: false, error: 'type is required' });

    let brand_id = null, style_id = null;
    if (brand_slug) {
      const { data: b } = await supabaseAdmin.from('brands').select('id').eq('slug', brand_slug).single();
      brand_id = b?.id || null;
    }
    if (style_slug && brand_id) {
      const { data: s } = await supabaseAdmin.from('styles').select('id').eq('slug', style_slug).eq('brand_id', brand_id).single();
      style_id = s?.id || null;
    }

    let q = supabaseAdmin.from('pricing').select('id');
    let newRow = { price_usd: Number(price_usd) };

    switch (type) {
      case 'base':
        q = q.eq('brand_id', brand_id).eq('style_id', style_id).eq('size_id', size_id)
             .is('height_id', null).is('fabric_id', null).is('trim_id', null).is('glass_id', null).is('pedestal_id', null);
        newRow = { ...newRow, brand_id, style_id, size_id,
          label: `base:${brand_slug}:${style_slug}:${size_id}` };
        break;
      case 'height':
        q = q.eq('brand_id', brand_id).eq('style_id', style_id).eq('size_id', size_id).eq('height_id', option_id);
        newRow = { ...newRow, brand_id, style_id, size_id, height_id: option_id,
          label: `height:${brand_slug}:${style_slug}:${size_id}:${option_id}` };
        break;
      case 'fabric':
        q = q.eq('brand_id', brand_id).eq('style_id', style_id).eq('fabric_id', option_id).is('size_id', null);
        newRow = { ...newRow, brand_id, style_id, fabric_id: option_id,
          label: `fabric:${brand_slug}:${style_slug}:${option_id}` };
        break;
      case 'trim':
        q = q.eq('brand_id', brand_id).eq('style_id', style_id).eq('trim_id', option_id).is('size_id', null);
        newRow = { ...newRow, brand_id, style_id, trim_id: option_id,
          label: `trim:${brand_slug}:${style_slug}:${option_id}` };
        break;
      case 'glass':
        q = q.eq('brand_id', brand_id).eq('style_id', style_id).eq('size_id', size_id).eq('glass_id', option_id);
        newRow = { ...newRow, brand_id, style_id, size_id, glass_id: option_id,
          label: `glass:${brand_slug}:${style_slug}:${size_id}:${option_id}` };
        break;
      case 'pedestal':
        q = q.eq('pedestal_id', option_id).is('brand_id', null);
        newRow = { ...newRow, pedestal_id: option_id, label: `pedestal:${option_id}` };
        break;
      default:
        return res.status(400).json({ success: false, error: `Unknown type: ${type}` });
    }

    const { data: existing } = await q.maybeSingle();
    let result;
    if (existing) {
      const { data, error } = await supabaseAdmin.from('pricing')
        .update({ price_usd: Number(price_usd) }).eq('id', existing.id).select().single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabaseAdmin.from('pricing').insert(newRow).select().single();
      if (error) throw error;
      result = data;
    }
    res.json({ success: true, pricing: result });
  } catch (err) {
    console.error('PUT /api/admin/pricing error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/admin/layers-by-brand-style ──────────────────────────────────
router.get('/layers-by-brand-style', async (req, res) => {
  try {
    const { brand_slug, style_slug } = req.query;
    if (!brand_slug || !style_slug) {
      return res.status(400).json({ success: false, error: 'brand_slug and style_slug required' });
    }

    const { data: brand, error: bErr } = await supabaseAdmin.from('brands').select('id').eq('slug', brand_slug).single();
    if (bErr || !brand) return res.status(404).json({ success: false, error: 'Brand not found' });
    const { data: style, error: sErr } = await supabaseAdmin.from('styles').select('id').eq('slug', style_slug).eq('brand_id', brand.id).single();
    if (sErr || !style) return res.status(404).json({ success: false, error: 'Style not found' });

    const { data: layers } = await supabaseAdmin
      .from('layer_assets').select('*').eq('brand_id', brand.id).eq('style_id', style.id);

    const [{ data: fabrics }, { data: trims }, { data: glasses }, { data: pedestals }] = await Promise.all([
      supabaseAdmin.from('fabrics').select('id,slug'),
      supabaseAdmin.from('trims').select('id,slug'),
      supabaseAdmin.from('glass_options').select('id,slug'),
      supabaseAdmin.from('pedestals').select('id,slug'),
    ]);
    const sOf = (rows, id) => (rows || []).find(r => r.id === id)?.slug || String(id);

    const result = {};
    for (const layer of (layers || [])) {
      const { layer_type, fabric_id, trim_id, glass_id, pedestal_id, storage_url, id } = layer;
      const info = { url: storage_url, id };
      if      (fabric_id)   { if (!result.panel)    result.panel    = {}; result.panel[sOf(fabrics, fabric_id)]         = info; }
      else if (trim_id)     { if (!result.trim)     result.trim     = {}; result.trim[sOf(trims, trim_id)]              = info; }
      else if (glass_id)    { if (!result.glass)    result.glass    = {}; result.glass[sOf(glasses, glass_id)]          = info; }
      else if (pedestal_id) { if (!result.pedestal) result.pedestal = {}; result.pedestal[sOf(pedestals, pedestal_id)]  = info; }
      else                  { result[layer_type] = info; }
    }

    res.json({ success: true, layers: result });
  } catch (err) {
    console.error('GET /api/admin/layers-by-brand-style error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
