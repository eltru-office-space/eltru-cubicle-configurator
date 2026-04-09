// db/fixGlassPricing.js
// Finds and removes pricing rows that incorrectly assign a glass price to Knoll Reff.
// Glass is always included for Knoll Reff — no glass pricing rows should exist for it.
// Safe to re-run: only deletes rows that match the stale pattern.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabaseAdmin } = require('../lib/supabase');

async function fixGlassPricing() {
  console.log('Checking for stale Knoll Reff glass pricing rows...\n');

  // Find all glass pricing rows
  const { data: rows, error } = await supabaseAdmin
    .from('pricing')
    .select('id, price_usd, label, brand_id, glass_id')
    .not('glass_id', 'is', null);

  if (error) throw new Error(`Query failed: ${error.message}`);

  if (!rows || rows.length === 0) {
    console.log('No glass pricing rows found at all.');
    return;
  }

  // Load Knoll Reff brand ID
  const { data: knoll } = await supabaseAdmin
    .from('brands').select('id, name').eq('slug', 'knoll-reff').single();

  if (!knoll) throw new Error('Brand "knoll-reff" not found — run db/seed.js first.');

  console.log(`Found ${rows.length} total glass pricing row(s):`);
  rows.forEach(r => {
    const tag = r.brand_id === knoll.id ? ' ← STALE (Knoll Reff)' : '';
    console.log(`  id=${r.id}  label="${r.label || '—'}"  price=$${r.price_usd}  brand_id=${r.brand_id ?? 'null'}${tag}`);
  });

  const stale = rows.filter(r => r.brand_id === knoll.id);

  if (stale.length === 0) {
    console.log('\nNo stale Knoll Reff glass pricing rows found. Nothing to delete.');
    return;
  }

  console.log(`\nDeleting ${stale.length} stale row(s) tied to ${knoll.name}...`);
  const { error: delErr } = await supabaseAdmin
    .from('pricing')
    .delete()
    .in('id', stale.map(r => r.id));

  if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
  console.log(`Deleted ${stale.length} row(s). Done.`);
}

fixGlassPricing().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
