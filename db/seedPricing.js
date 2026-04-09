// db/seedPricing.js — seed per-size pricing for Knoll Reff Straight
// PREREQUISITE: Run db/migrations/add_pricing_columns.sql in Supabase SQL editor first.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabaseAdmin } = require('../lib/supabase');

async function seedPricing() {
  console.log('Seeding per-size pricing data...\n');

  const [
    { data: brands  },
    { data: styles  },
    { data: sizes   },
    { data: heights },
    { data: fabrics },
    { data: trims   },
    { data: pedestals },
  ] = await Promise.all([
    supabaseAdmin.from('brands').select('id,slug'),
    supabaseAdmin.from('styles').select('id,slug,brand_id'),
    supabaseAdmin.from('sizes').select('id,label,width_in,style_id'),
    supabaseAdmin.from('heights').select('id,height_in,brand_id'),
    supabaseAdmin.from('fabrics').select('id,slug'),
    supabaseAdmin.from('trims').select('id,slug'),
    supabaseAdmin.from('pedestals').select('id,slug'),
  ]);

  const knoll         = brands.find(b => b.slug === 'knoll-reff');
  const ks            = styles.find(s => s.brand_id === knoll.id && s.slug === 'straight');

  const sz48 = sizes.find(s => s.style_id === ks.id && s.width_in === 48);
  const sz60 = sizes.find(s => s.style_id === ks.id && s.width_in === 60);
  const sz72 = sizes.find(s => s.style_id === ks.id && s.width_in === 72);

  const h50 = heights.find(h => h.brand_id === knoll.id && h.height_in === 50);
  const h65 = heights.find(h => h.brand_id === knoll.id && h.height_in === 65);

  if (!sz48 || !sz60 || !sz72) throw new Error('Knoll Reff Straight sizes not found. Run db/seed.js first.');
  if (!h50  || !h65)           throw new Error('Knoll heights not found. Run db/seed.js first.');

  const fab = (slug) => fabrics.find(f => f.slug === slug);
  const tri = (slug) => trims.find(t => t.slug === slug);
  const ped = (slug) => pedestals.find(p => p.slug === slug);

  const rows = [
    // ── Base prices per size (Knoll Reff Straight) ──────────────────────
    { brand_id: knoll.id, style_id: ks.id, size_id: sz48.id, price_usd: 850,  label: `base:knoll-reff:straight:${sz48.id}` },
    { brand_id: knoll.id, style_id: ks.id, size_id: sz60.id, price_usd: 950,  label: `base:knoll-reff:straight:${sz60.id}` },
    { brand_id: knoll.id, style_id: ks.id, size_id: sz72.id, price_usd: 1050, label: `base:knoll-reff:straight:${sz72.id}` },

    // ── Height add-ons (65"H tall height, per size) ──────────────────────
    { brand_id: knoll.id, style_id: ks.id, size_id: sz48.id, height_id: h65.id, price_usd: 120, label: `height:knoll-reff:straight:${sz48.id}:${h65.id}` },
    { brand_id: knoll.id, style_id: ks.id, size_id: sz60.id, height_id: h65.id, price_usd: 150, label: `height:knoll-reff:straight:${sz60.id}:${h65.id}` },
    { brand_id: knoll.id, style_id: ks.id, size_id: sz72.id, height_id: h65.id, price_usd: 180, label: `height:knoll-reff:straight:${sz72.id}:${h65.id}` },

    // ── Fabric add-ons (per brand+style, not per size) ───────────────────
    { brand_id: knoll.id, style_id: ks.id, fabric_id: fab('graphite').id, price_usd: 45, label: `fabric:knoll-reff:straight:${fab('graphite').id}` },
    { brand_id: knoll.id, style_id: ks.id, fabric_id: fab('mystique').id, price_usd: 0,  label: `fabric:knoll-reff:straight:${fab('mystique').id}` },
    { brand_id: knoll.id, style_id: ks.id, fabric_id: fab('osprey').id,   price_usd: 0,  label: `fabric:knoll-reff:straight:${fab('osprey').id}` },
    { brand_id: knoll.id, style_id: ks.id, fabric_id: fab('fossil').id,   price_usd: 0,  label: `fabric:knoll-reff:straight:${fab('fossil').id}` },
    { brand_id: knoll.id, style_id: ks.id, fabric_id: fab('zinc').id,     price_usd: 0,  label: `fabric:knoll-reff:straight:${fab('zinc').id}` },

    // ── Trim add-ons ─────────────────────────────────────────────────────
    { brand_id: knoll.id, style_id: ks.id, trim_id: tri('white').id, price_usd: 0,  label: `trim:knoll-reff:straight:${tri('white').id}` },
    { brand_id: knoll.id, style_id: ks.id, trim_id: tri('grey').id,  price_usd: 35, label: `trim:knoll-reff:straight:${tri('grey').id}` },

    // ── Pedestal add-ons (shared — no brand/style) ───────────────────────
    { pedestal_id: ped('stationary-white').id, price_usd: 95,  label: `pedestal:${ped('stationary-white').id}` },
    { pedestal_id: ped('stationary-grey').id,  price_usd: 95,  label: `pedestal:${ped('stationary-grey').id}` },
    { pedestal_id: ped('rolling-white').id,    price_usd: 130, label: `pedestal:${ped('rolling-white').id}` },
    { pedestal_id: ped('rolling-cushion').id,  price_usd: 160, label: `pedestal:${ped('rolling-cushion').id}` },
  ];

  const { data: existing } = await supabaseAdmin.from('pricing').select('label');
  const existingLabels = new Set((existing || []).map(r => r.label));
  const toInsert = rows.filter(r => !existingLabels.has(r.label));
  const toUpdate = rows.filter(r => existingLabels.has(r.label));

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from('pricing').insert(toInsert);
    if (error) {
      const hint = error.message.includes('column') ? '\n\nHINT: Run db/migrations/add_pricing_columns.sql in Supabase SQL editor first!' : '';
      throw new Error(`Insert failed: ${error.message}${hint}`);
    }
    console.log(`  ✓ Inserted ${toInsert.length} new pricing rows`);
  }

  for (const row of toUpdate) {
    const { error } = await supabaseAdmin.from('pricing')
      .update({ price_usd: row.price_usd }).eq('label', row.label);
    if (error) console.warn(`  ⚠ Update skipped for "${row.label}": ${error.message}`);
  }
  if (toUpdate.length > 0) console.log(`  ✓ Updated ${toUpdate.length} existing pricing rows`);

  const { count } = await supabaseAdmin.from('pricing').select('*', { count: 'exact', head: true });
  console.log(`\nTotal pricing rows: ${count}`);
  console.log('Pricing seed complete.');
}

seedPricing().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
