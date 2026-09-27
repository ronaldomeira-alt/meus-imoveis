import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260927000000_match_property_lifecycle.sql', import.meta.url), 'utf8');
const regression = readFileSync(new URL('./match-property-lifecycle.sql', import.meta.url), 'utf8');
const apply = process.argv.includes('--apply');
const query = apply ? migration : migration.replace(/COMMIT;\s*$/, '') + regression + '\nROLLBACK;';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ref = new URL(url).hostname.split('.')[0];
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
if (!response.ok) throw new Error(await response.text());
console.log(apply ? 'Property lifecycle migration applied.' : 'Lifecycle regression passed; all test changes rolled back.');
