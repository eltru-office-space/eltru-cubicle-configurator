/**
 * db/uploadTestLayers.js
 * One-time script to upload test layer images for Knoll Reff Straight.
 *
 * Run: node db/uploadTestLayers.js
 *
 * Reads files from assets/test-layers/, uploads via POST /api/admin/layers/upload,
 * which handles Supabase Storage + layer_assets DB row creation.
 */

require('dotenv').config();
const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const http   = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!PASSWORD) {
  console.error('ADMIN_PASSWORD not set in .env');
  process.exit(1);
}

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'test-layers');

// Layer definitions: file → upload params
const LAYERS = [
  {
    file:       'background.png',
    brand_slug: 'knoll-reff',
    style_slug: 'straight',
    layer_type: 'background',
  },
  {
    file:       'panel-graphite.webp',
    brand_slug: 'knoll-reff',
    style_slug: 'straight',
    layer_type: 'panel',
    option_slug: 'graphite',
  },
  {
    file:       'panel-mystique.webp',
    brand_slug: 'knoll-reff',
    style_slug: 'straight',
    layer_type: 'panel',
    option_slug: 'mystique',
  },
  {
    file:       'glass-clear.webp',
    brand_slug: 'knoll-reff',
    style_slug: 'straight',
    layer_type: 'glass',
    option_slug: 'clear-glass',
  },
  {
    file:       'trim-grey.webp',
    brand_slug: 'knoll-reff',
    style_slug: 'straight',
    layer_type: 'trim',
    option_slug: 'grey',
  },
  {
    file:       'trim-white.webp',
    brand_slug: 'knoll-reff',
    style_slug: 'straight',
    layer_type: 'trim',
    option_slug: 'white',
  },
];

// ── Multipart form-data builder (no external deps) ─────────────────────────
function buildMultipart(fields, fileField, fileName, fileBuffer, mimeType) {
  const boundary = `----FormBoundary${Date.now().toString(16)}`;
  const parts   = [];

  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );

  const header = Buffer.from(parts.join(''));
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body   = Buffer.concat([header, fileBuffer, footer]);

  return { boundary, body };
}

function mimeFor(file) {
  return file.endsWith('.webp') ? 'image/webp' : 'image/png';
}

async function uploadLayer(layer) {
  const filePath = path.join(ASSETS_DIR, layer.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ File not found, skipping: ${filePath}`);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const mime       = mimeFor(layer.file);

  const fields = {
    brand_slug:  layer.brand_slug,
    style_slug:  layer.style_slug,
    layer_type:  layer.layer_type,
    option_slug: layer.option_slug || '',
    height_slug: layer.height_slug || '',
  };

  const { boundary, body } = buildMultipart(fields, 'file', layer.file, fileBuffer, mime);

  const url     = new URL(`${BASE_URL}/api/admin/layers/upload`);
  const isHttps = url.protocol === 'https:';
  const lib     = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Authorization':  PASSWORD,
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.success) {
            console.log(`  ✓ Uploaded ${layer.file} → ${layer.layer_type}${layer.option_slug ? ` (${layer.option_slug})` : ''}`);
            console.log(`    URL: ${json.storage_url}`);
          } else {
            console.error(`  ✗ Failed ${layer.file}: ${json.error}`);
          }
          resolve(json);
        } catch (e) {
          console.error(`  ✗ Parse error for ${layer.file}:`, raw.slice(0, 200));
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`\nUploading ${LAYERS.length} test layers to ${BASE_URL}\n`);

  for (const layer of LAYERS) {
    await uploadLayer(layer);
  }

  console.log('\nDone! Open admin.html → Layer Assets tab to verify thumbnails.\n');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
