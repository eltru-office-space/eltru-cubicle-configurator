const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../lib/supabase');
const { generatePDF } = require('../lib/pdfGen');

// POST /api/pdf — generate and stream a PDF for a configuration
router.post('/', async (req, res) => {
  try {
    const { config_code, quote_token } = req.body;

    if (!config_code) {
      return res.status(400).json({ success: false, error: 'config_code is required' });
    }

    // Validate config exists
    const { data: config, error: configErr } = await supabaseAdmin
      .from('configurations')
      .select('id, config_code')
      .eq('config_code', config_code.toUpperCase())
      .single();

    if (configErr || !config) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }

    // Resolve quote link ID for logging (optional)
    let quoteLinkId = null;
    if (quote_token) {
      const { data: ql } = await supabaseAdmin
        .from('quote_links')
        .select('id')
        .eq('link_token', quote_token)
        .maybeSingle();
      quoteLinkId = ql?.id || null;
    }

    const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
    const result = await generatePDF(config.config_code, quote_token || null, BASE_URL);

    if (!result.success) throw new Error('PDF generation failed');

    // Log export to pdf_exports (non-fatal if table schema differs)
    try {
      await supabaseAdmin.from('pdf_exports').insert({
        config_id:     config.id,
        quote_link_id: quoteLinkId,
        generated_by:  'client',
      });
    } catch (logErr) {
      console.warn('pdf_exports log skipped:', logErr.message);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="eltru-quote-${config.config_code}.pdf"`);
    res.setHeader('Content-Length', result.pdfBuffer.length);
    res.end(result.pdfBuffer);
  } catch (err) {
    console.error('POST /api/pdf error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/pdf/download/:code — direct URL download (no POST body needed)
// Rate-limited at mount point via pdfLimiter in server.js
router.get('/download/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();

    const { data: config, error: configErr } = await supabaseAdmin
      .from('configurations')
      .select('id, config_code')
      .eq('config_code', code)
      .single();

    if (configErr || !config) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }

    const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
    const result = await generatePDF(config.config_code, null, BASE_URL);

    if (!result.success) throw new Error('PDF generation failed');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="eltru-${config.config_code}.pdf"`);
    res.setHeader('Content-Length', result.pdfBuffer.length);
    res.end(result.pdfBuffer);
  } catch (err) {
    console.error('GET /api/pdf/download error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
