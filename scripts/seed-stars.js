#!/usr/bin/env node
/**
 * Seed the Supabase `stars` table from assets/stars.json
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=service_role_key_here \
 *   node scripts/seed-stars.js
 *
 * Requires Node 18+ (built-in fetch).
 * Uses the service-role key (not anon) to bypass RLS for insert.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const stars  = JSON.parse(readFileSync(join(__dir, '../assets/stars.json'), 'utf-8'));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars first.');
  process.exit(1);
}

// Map camelCase JSON → snake_case DB columns
const rows = stars.map(s => ({
  id:            s.id,
  name:          s.name,
  name_ko:       s.nameKo ?? null,
  ra:            s.ra,
  dec:           s.dec,
  mag:           s.mag,
  constellation: s.constellation ?? null,
  type:          s.type ?? 'star',
}));

const res = await fetch(`${url}/rest/v1/stars`, {
  method:  'POST',
  headers: {
    'Content-Type':  'application/json',
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Prefer':        'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
});

if (res.ok) {
  console.log(`✓ Seeded ${rows.length} stars.`);
} else {
  const body = await res.text();
  console.error(`✗ HTTP ${res.status}: ${body}`);
  process.exit(1);
}
