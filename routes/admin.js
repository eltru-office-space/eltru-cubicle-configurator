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

module.exports = router;
