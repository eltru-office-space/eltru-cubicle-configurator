require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabaseAdmin } = require('../lib/supabase');

// ─────────────────────────────────────────────────────────────
// Eltru DB Seed — run once on a fresh Supabase project.
// Re-running is safe: uses upsert on unique slug/composite keys.
//
// Required unique constraints:
//   brands          → UNIQUE(slug)
//   styles          → UNIQUE(brand_id, slug)
//   sizes           → UNIQUE(style_id, width_in, depth_in)
//   heights         → UNIQUE(brand_id, height_in)
//   fabrics         → UNIQUE(slug)
//   trims           → UNIQUE(slug)
//   glass_options   → UNIQUE(slug)
//   pedestals       → UNIQUE(slug)
//   pricing         → UNIQUE(label)
// ─────────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding Eltru database...\n');

  // ── Step 1: Brands ──────────────────────────────────────────
  console.log('Step 1: Brands');
  const { data: brands, error: brandsErr } = await supabaseAdmin
    .from('brands')
    .upsert([
      { name: 'Knoll Reff',        slug: 'knoll-reff',        sort_order: 1 },
      { name: 'Steelcase Avenir',  slug: 'steelcase-avenir',  sort_order: 2 },
    ], { onConflict: 'slug' })
    .select();
  if (brandsErr) throw new Error(`brands: ${brandsErr.message}`);
  const knoll = brands.find(b => b.slug === 'knoll-reff');
  const steel = brands.find(b => b.slug === 'steelcase-avenir');
  console.log(`  ✓ ${brands.length} brands (knoll id=${knoll.id}, steel id=${steel.id})`);

  // ── Step 2: Styles ──────────────────────────────────────────
  console.log('Step 2: Styles');
  const styleRows = [
    { name: 'Straight', slug: 'straight', brand_id: knoll.id, sort_order: 1 },
    { name: 'L-Shape',  slug: 'l-shape',  brand_id: knoll.id, sort_order: 2 },
    { name: 'Straight', slug: 'straight', brand_id: steel.id, sort_order: 1 },
    { name: 'L-Shape',  slug: 'l-shape',  brand_id: steel.id, sort_order: 2 },
  ];
  const { data: existingStyles } = await supabaseAdmin.from('styles').select('*');
  const newStyleRows = styleRows.filter(r =>
    !existingStyles.some(e => e.brand_id === r.brand_id && e.slug === r.slug));
  if (newStyleRows.length > 0) {
    const { error: stylesErr } = await supabaseAdmin.from('styles').insert(newStyleRows);
    if (stylesErr) throw new Error(`styles: ${stylesErr.message}`);
  }
  const { data: styles } = await supabaseAdmin.from('styles').select('*');
  const knollStraight = styles.find(s => s.brand_id === knoll.id && s.slug === 'straight');
  const knollLShape   = styles.find(s => s.brand_id === knoll.id && s.slug === 'l-shape');
  const steelStraight = styles.find(s => s.brand_id === steel.id && s.slug === 'straight');
  const steelLShape   = styles.find(s => s.brand_id === steel.id && s.slug === 'l-shape');
  console.log(`  ✓ ${styles.length} styles (${newStyleRows.length} new)`);

  // ── Step 3: Sizes ───────────────────────────────────────────
  console.log('Step 3: Sizes');
  const sizeRows = [
    { style_id: knollStraight.id, label: '48"L \xd7 24"D', width_in: 48, depth_in: 24, sort_order: 1 },
    { style_id: knollStraight.id, label: '60"L \xd7 24"D', width_in: 60, depth_in: 24, sort_order: 2 },
    { style_id: knollStraight.id, label: '72"L \xd7 24"D', width_in: 72, depth_in: 24, sort_order: 3 },
    { style_id: knollLShape.id,   label: '60" \xd7 60"',   width_in: 60, depth_in: 60, sort_order: 1 },
    { style_id: knollLShape.id,   label: '72" \xd7 72"',   width_in: 72, depth_in: 72, sort_order: 2 },
    { style_id: steelStraight.id, label: '42"L \xd7 30"D', width_in: 42, depth_in: 30, sort_order: 1 },
    { style_id: steelStraight.id, label: '60"L \xd7 30"D', width_in: 60, depth_in: 30, sort_order: 2 },
    { style_id: steelLShape.id,   label: '60" \xd7 60"',   width_in: 60, depth_in: 60, sort_order: 1 },
    { style_id: steelLShape.id,   label: '72" \xd7 72"',   width_in: 72, depth_in: 72, sort_order: 2 },
  ];
  const { data: existingSizes } = await supabaseAdmin.from('sizes').select('*');
  const newSizeRows = sizeRows.filter(r =>
    !existingSizes.some(e => e.style_id === r.style_id && e.width_in === r.width_in && e.depth_in === r.depth_in));
  if (newSizeRows.length > 0) {
    const { error: sizesErr } = await supabaseAdmin.from('sizes').insert(newSizeRows);
    if (sizesErr) throw new Error(`sizes: ${sizesErr.message}`);
  }
  const { data: sizes } = await supabaseAdmin.from('sizes').select('*');
  console.log(`  ✓ ${sizes.length} sizes (${newSizeRows.length} new)`);

  // ── Step 4: Heights ─────────────────────────────────────────
  console.log('Step 4: Heights');
  const heightRows = [
    { label: '50"H', brand_id: knoll.id, height_in: 50, sort_order: 1 },
    { label: '65"H', brand_id: knoll.id, height_in: 65, sort_order: 2 },
    { label: '42"H', brand_id: steel.id, height_in: 42, sort_order: 1 },
    { label: '53"H', brand_id: steel.id, height_in: 53, sort_order: 2 },
  ];
  const { data: existingHeights } = await supabaseAdmin.from('heights').select('*');
  const newHeightRows = heightRows.filter(r =>
    !existingHeights.some(e => e.brand_id === r.brand_id && e.height_in === r.height_in));
  if (newHeightRows.length > 0) {
    const { error: heightsErr } = await supabaseAdmin.from('heights').insert(newHeightRows);
    if (heightsErr) throw new Error(`heights: ${heightsErr.message}`);
  }
  const { data: heights } = await supabaseAdmin.from('heights').select('*');
  console.log(`  ✓ ${heights.length} heights (${newHeightRows.length} new)`);

  // ── Step 5: Fabrics ─────────────────────────────────────────
  console.log('Step 5: Fabrics');
  const { data: fabrics, error: fabricsErr } = await supabaseAdmin
    .from('fabrics')
    .upsert([
      { name: 'Graphite', slug: 'graphite', hex_color: '#3A3A3A', description: 'Deep charcoal weave',   sort_order: 1 },
      { name: 'Mystique', slug: 'mystique', hex_color: '#5A4E6E', description: 'Muted violet tweed',    sort_order: 2 },
      { name: 'Osprey',   slug: 'osprey',   hex_color: '#6B9BAF', description: 'Soft coastal blue',     sort_order: 3 },
      { name: 'Fossil',   slug: 'fossil',   hex_color: '#8A7E6A', description: 'Warm sandy brown',      sort_order: 4 },
      { name: 'Zinc',     slug: 'zinc',     hex_color: '#7A7A7A', description: 'Cool medium grey',      sort_order: 5 },
    ], { onConflict: 'slug' })
    .select();
  if (fabricsErr) throw new Error(`fabrics: ${fabricsErr.message}`);
  console.log(`  ✓ ${fabrics.length} fabrics`);

  // ── Step 6: Trims ───────────────────────────────────────────
  console.log('Step 6: Trims');
  const { data: trims, error: trimsErr } = await supabaseAdmin
    .from('trims')
    .upsert([
      { name: 'White', slug: 'white', hex_color: '#F0EEE8', sort_order: 1 },
      { name: 'Grey',  slug: 'grey',  hex_color: '#888888', sort_order: 2 },
    ], { onConflict: 'slug' })
    .select();
  if (trimsErr) throw new Error(`trims: ${trimsErr.message}`);
  console.log(`  ✓ ${trims.length} trims`);

  // ── Step 7: Glass Options ───────────────────────────────────
  console.log('Step 7: Glass options');
  const { data: glassOptions, error: glassErr } = await supabaseAdmin
    .from('glass_options')
    .upsert([
      { name: 'None',          slug: 'none',          description: 'No glass — full fabric panels',           l_shape_only: false, sort_order: 1 },
      { name: 'Clear Glass',   slug: 'clear-glass',   description: '15" floating clear glass on all sides',   l_shape_only: false, sort_order: 2 },
      { name: 'Frosted Glass', slug: 'frosted-glass', description: '15" floating frosted glass on all sides', l_shape_only: false, sort_order: 3 },
      { name: 'One Side Only', slug: 'one-side-only', description: 'Glass on one arm of L-shape only',        l_shape_only: true,  sort_order: 4 },
    ], { onConflict: 'slug' })
    .select();
  if (glassErr) throw new Error(`glass_options: ${glassErr.message}`);
  console.log(`  ✓ ${glassOptions.length} glass options`);

  // ── Step 8: Pedestals ───────────────────────────────────────
  console.log('Step 8: Pedestals');
  const { data: pedestals, error: pedestalsErr } = await supabaseAdmin
    .from('pedestals')
    .upsert([
      { name: 'None',                         slug: 'none',                 description: 'No pedestal',              l_shape_only: false, is_double: false, is_rolling: false, has_cushion: false, sort_order: 1  },
      { name: 'Stationary \u2013 White',      slug: 'stationary-white',     description: 'Fixed under desk, white',  l_shape_only: false, is_double: false, is_rolling: false, has_cushion: false, sort_order: 2  },
      { name: 'Stationary \u2013 Grey',       slug: 'stationary-grey',      description: 'Fixed under desk, grey',   l_shape_only: false, is_double: false, is_rolling: false, has_cushion: false, sort_order: 3  },
      { name: 'Rolling \u2013 White',         slug: 'rolling-white',        description: 'Mobile on casters, white', l_shape_only: false, is_double: false, is_rolling: true,  has_cushion: false, sort_order: 4  },
      { name: 'Rolling w/ Cushion',           slug: 'rolling-cushion',      description: 'Mobile + cushion top',     l_shape_only: false, is_double: false, is_rolling: true,  has_cushion: true,  sort_order: 5  },
      { name: 'Two Stationary \u2013 White',  slug: 'two-stationary-white', description: 'Both sides, fixed, white', l_shape_only: true,  is_double: true,  is_rolling: false, has_cushion: false, sort_order: 6  },
      { name: 'Two Stationary \u2013 Grey',   slug: 'two-stationary-grey',  description: 'Both sides, fixed, grey',  l_shape_only: true,  is_double: true,  is_rolling: false, has_cushion: false, sort_order: 7  },
      { name: 'Two Rolling \u2013 White',     slug: 'two-rolling-white',    description: 'Both sides, mobile',       l_shape_only: true,  is_double: true,  is_rolling: true,  has_cushion: false, sort_order: 8  },
      { name: 'Two Rolling w/ Cushion',       slug: 'two-rolling-cushion',  description: 'Both sides + cushions',    l_shape_only: true,  is_double: true,  is_rolling: true,  has_cushion: true,  sort_order: 9  },
      { name: 'One Stationary + One Rolling', slug: 'one-stat-one-roll',    description: 'Mixed configuration',      l_shape_only: true,  is_double: true,  is_rolling: false, has_cushion: false, sort_order: 10 },
    ], { onConflict: 'slug' })
    .select();
  if (pedestalsErr) throw new Error(`pedestals: ${pedestalsErr.message}`);
  console.log(`  ✓ ${pedestals.length} pedestals`);

  // ── Step 9: Pricing ─────────────────────────────────────────
  console.log('Step 9: Pricing');
  const g = (slug) => glassOptions.find(x => x.slug === slug);
  const p = (slug) => pedestals.find(x => x.slug === slug);

  const pricingRows = [
    { brand_id: knoll.id, style_id: knollStraight.id, price_usd: 950,  label: 'Knoll Reff Straight base'       },
    { brand_id: knoll.id, style_id: knollLShape.id,   price_usd: 1350, label: 'Knoll Reff L-Shape base'        },
    { brand_id: steel.id, style_id: steelStraight.id, price_usd: 850,  label: 'Steelcase Avenir Straight base' },
    { brand_id: steel.id, style_id: steelLShape.id,   price_usd: 1250, label: 'Steelcase Avenir L-Shape base'  },
    { glass_id: g('clear-glass').id,   price_usd: 180, label: 'Clear Glass add-on'           },
    { glass_id: g('frosted-glass').id, price_usd: 220, label: 'Frosted Glass add-on'         },
    { glass_id: g('one-side-only').id, price_usd: 120, label: 'One Side Glass add-on'        },
    { pedestal_id: p('stationary-white').id,     price_usd: 95,  label: 'Stationary pedestal white'    },
    { pedestal_id: p('stationary-grey').id,      price_usd: 95,  label: 'Stationary pedestal grey'     },
    { pedestal_id: p('rolling-white').id,        price_usd: 130, label: 'Rolling pedestal white'       },
    { pedestal_id: p('rolling-cushion').id,      price_usd: 160, label: 'Rolling pedestal with cushion'},
    { pedestal_id: p('two-stationary-white').id, price_usd: 190, label: 'Two stationary white'         },
    { pedestal_id: p('two-stationary-grey').id,  price_usd: 190, label: 'Two stationary grey'          },
    { pedestal_id: p('two-rolling-white').id,    price_usd: 260, label: 'Two rolling white'            },
    { pedestal_id: p('two-rolling-cushion').id,  price_usd: 320, label: 'Two rolling with cushion'     },
    { pedestal_id: p('one-stat-one-roll').id,    price_usd: 225, label: 'Mixed pedestal'               },
  ];
  const { data: existingPricing } = await supabaseAdmin.from('pricing').select('label');
  const existingLabels  = new Set((existingPricing || []).map(r => r.label));
  const newPricingRows  = pricingRows.filter(r => !existingLabels.has(r.label));
  if (newPricingRows.length > 0) {
    const { error: pricingErr } = await supabaseAdmin.from('pricing').insert(newPricingRows);
    if (pricingErr) throw new Error(`pricing: ${pricingErr.message}`);
  }
  const { data: pricing } = await supabaseAdmin.from('pricing').select('*');
  console.log(`  ✓ ${pricing.length} pricing rows (${newPricingRows.length} new)`);

  // ── Verify counts ───────────────────────────────────────────
  console.log('\nRow counts:');
  const tables = ['brands','styles','sizes','heights','fabrics','trims','glass_options','pedestals','pricing'];
  for (const table of tables) {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  ${table}: ERROR — ${error.message}`);
    } else {
      console.log(`  ${table}: ${count} rows`);
    }
  }

  console.log('\nSeed complete.');
}

seed().catch(err => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
