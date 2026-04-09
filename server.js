require('dotenv').config();

// ── Required environment variable check ─────────────────────
const REQUIRED_ENV = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY',
  'SALES_PASSWORD', 'ADMIN_PASSWORD', 'BASE_URL',
];
REQUIRED_ENV.forEach(key => {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required env var: ${key}`);
    process.exit(1);
  }
});

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const { supabaseAdmin } = require('./lib/supabase');
const configsRouter     = require('./routes/configs');
const quotesRouter      = require('./routes/quotes');
const pdfRouter         = require('./routes/pdf');
const adminRouter       = require('./routes/admin');
const odooRouter        = require('./routes/odoo');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS — restrict to BASE_URL and localhost in production ──
const ALLOWED_ORIGINS = [
  process.env.BASE_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Puppeteer, server-to-server)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o))) return cb(null, true);
    cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiters ────────────────────────────────────────────
const configsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { success: false, error: 'Too many requests — try again later' },
  standardHeaders: true, legacyHeaders: false,
});

const pdfLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  message: { success: false, error: 'Too many PDF requests — try again later' },
  standardHeaders: true, legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { ok: false, error: 'Too many attempts — try again in 15 minutes' },
  standardHeaders: true, legacyHeaders: false,
});

// ── Health ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── GET /api/options — all product options in one call ───────
app.get('/api/options', async (req, res) => {
  try {
    const [brandsR, stylesR, sizesR, heightsR, fabricsR, trimsR, glassR, pedestalsR, pricingR] =
      await Promise.all([
        supabaseAdmin.from('brands').select('*').order('sort_order'),
        supabaseAdmin.from('styles').select('*').order('sort_order'),
        supabaseAdmin.from('sizes').select('*').order('sort_order'),
        supabaseAdmin.from('heights').select('*').order('sort_order'),
        supabaseAdmin.from('fabrics').select('*').order('sort_order'),
        supabaseAdmin.from('trims').select('*').order('sort_order'),
        supabaseAdmin.from('glass_options').select('*').order('sort_order'),
        supabaseAdmin.from('pedestals').select('*').order('sort_order'),
        supabaseAdmin.from('pricing').select('*'),
      ]);

    for (const { error, label } of [
      { error: brandsR.error,    label: 'brands' },
      { error: stylesR.error,    label: 'styles' },
      { error: sizesR.error,     label: 'sizes' },
      { error: heightsR.error,   label: 'heights' },
      { error: fabricsR.error,   label: 'fabrics' },
      { error: trimsR.error,     label: 'trims' },
      { error: glassR.error,     label: 'glass_options' },
      { error: pedestalsR.error, label: 'pedestals' },
      { error: pricingR.error,   label: 'pricing' },
    ]) {
      if (error) throw new Error(`${label}: ${error.message}`);
    }

    const brands = (brandsR.data || []).map(brand => ({
      ...brand,
      styles: (stylesR.data || [])
        .filter(s => s.brand_id === brand.id)
        .map(style => ({
          ...style,
          sizes: (sizesR.data || []).filter(sz => sz.style_id === style.id),
        })),
    }));

    const heights = {};
    for (const brand of (brandsR.data || [])) {
      heights[brand.slug] = (heightsR.data || []).filter(h => h.brand_id === brand.id);
    }

    res.json({
      brands,
      heights,
      fabrics:       fabricsR.data  || [],
      trims:         trimsR.data    || [],
      glass_options: glassR.data    || [],
      pedestals:     pedestalsR.data || [],
      pricing:       pricingR.data  || [],
    });
  } catch (err) {
    console.error('GET /api/options error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/layers — single lookup OR bulk grouped fetch ────
app.get('/api/layers', async (req, res) => {
  try {
    const { brand: brandSlug, style: styleSlug, type: layerType, option: optionSlug } = req.query;

    const { data: brandRow } = await supabaseAdmin
      .from('brands').select('id').eq('slug', brandSlug).single();
    if (!brandRow) return res.json(layerType ? { url: null } : {});

    const { data: styleRow } = await supabaseAdmin
      .from('styles').select('id').eq('slug', styleSlug).eq('brand_id', brandRow.id).single();
    if (!styleRow) return res.json(layerType ? { url: null } : {});

    // BULK mode
    if (!layerType) {
      const { data: allLayers } = await supabaseAdmin
        .from('layer_assets')
        .select('layer_type, fabric_id, trim_id, glass_id, pedestal_id, storage_url')
        .eq('brand_id', brandRow.id)
        .eq('style_id', styleRow.id);

      const [fabrics, trims, glasses, pedestals] = await Promise.all([
        supabaseAdmin.from('fabrics').select('id,slug'),
        supabaseAdmin.from('trims').select('id,slug'),
        supabaseAdmin.from('glass_options').select('id,slug'),
        supabaseAdmin.from('pedestals').select('id,slug'),
      ]);
      const slugOf = (rows, id) => (rows.data || []).find(r => r.id === id)?.slug || null;

      const grouped = {};
      for (const layer of (allLayers || [])) {
        const { layer_type, fabric_id, trim_id, glass_id, pedestal_id, storage_url } = layer;
        if (!grouped[layer_type]) grouped[layer_type] = {};
        if      (fabric_id)   { grouped[layer_type][slugOf(fabrics,   fabric_id)   || fabric_id]   = storage_url; }
        else if (trim_id)     { grouped[layer_type][slugOf(trims,     trim_id)     || trim_id]     = storage_url; }
        else if (glass_id)    { grouped[layer_type][slugOf(glasses,   glass_id)    || glass_id]    = storage_url; }
        else if (pedestal_id) { grouped[layer_type][slugOf(pedestals, pedestal_id) || pedestal_id] = storage_url; }
        else                  { grouped[layer_type] = storage_url; }
      }
      return res.json(grouped);
    }

    // SINGLE mode
    let query = supabaseAdmin
      .from('layer_assets')
      .select('storage_url')
      .eq('brand_id', brandRow.id)
      .eq('style_id', styleRow.id)
      .eq('layer_type', layerType);

    if (optionSlug && optionSlug !== 'default') {
      const optionTableMap = {
        panel:    { table: 'fabrics',       col: 'fabric_id'   },
        trim:     { table: 'trims',         col: 'trim_id'     },
        glass:    { table: 'glass_options', col: 'glass_id'    },
        pedestal: { table: 'pedestals',     col: 'pedestal_id' },
      };
      const mapping = optionTableMap[layerType];
      if (mapping) {
        const { data: optRow } = await supabaseAdmin
          .from(mapping.table).select('id').eq('slug', optionSlug).single();
        if (optRow) query = query.eq(mapping.col, optRow.id);
      }
    }

    const { data: layerRow } = await query.maybeSingle();
    res.json({ url: layerRow?.storage_url || null });
  } catch (err) {
    res.json(req.query.type ? { url: null } : {});
  }
});

// ── POST /api/auth/sales ─────────────────────────────────────
app.post('/api/auth/sales', authLimiter, (req, res, next) => {
  try {
    if (!req.body.password) return res.status(400).json({ ok: false });
    if (req.body.password === process.env.SALES_PASSWORD) {
      res.json({ ok: true });
    } else {
      res.status(401).json({ ok: false });
    }
  } catch (err) { next(err); }
});

// ── POST /api/auth/admin ─────────────────────────────────────
app.post('/api/auth/admin', authLimiter, (req, res, next) => {
  try {
    if (!req.body.password) return res.status(400).json({ ok: false });
    if (req.body.password === process.env.ADMIN_PASSWORD) {
      res.json({ ok: true });
    } else {
      res.status(401).json({ ok: false });
    }
  } catch (err) { next(err); }
});

// ── GET /api/sales/recent ────────────────────────────────────
app.get('/api/sales/recent', async (req, res) => {
  const auth = req.headers['authorization'];
  if (!auth || auth !== process.env.SALES_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('configurations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ success: true, configs: data });
  } catch (err) {
    console.error('GET /api/sales/recent error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/embed/code — embeddable iframe snippet ──────────
app.get('/api/embed/code', (req, res) => {
  const BASE = process.env.BASE_URL || 'http://localhost:3000';
  res.json({
    direct_link:       BASE,
    iframe_embed:      `<iframe src="${BASE}/embed.html" width="100%" height="800" frameborder="0" style="border-radius:12px;border:1px solid #E0DCD4;"></iframe>`,
    short_description: 'Configure your cubicle and get an instant quote at eltru.com',
  });
});

// ── Mounted routers ──────────────────────────────────────────
app.use('/api/configs', configsLimiter, configsRouter);
app.use('/api/quotes',  quotesRouter);
app.use('/api/pdf',     pdfLimiter, pdfRouter);
app.use('/api/admin',   adminRouter);
app.use('/api/odoo',    odooRouter);

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`Eltru Configurator running on http://localhost:${PORT}`);
});
