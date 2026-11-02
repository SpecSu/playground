import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const built = JSON.parse(readFileSync(path.join(root, 'dist/server/wrangler.json'), 'utf8'));
const config = path.join(root, '.sites-runtime/archive-d1.json');
mkdirSync(path.dirname(config), { recursive: true });
writeFileSync(config, JSON.stringify({ name: built.name, compatibility_date: built.compatibility_date,
  d1_databases: built.d1_databases.map(db => ({ ...db, migrations_dir: path.join(root, 'drizzle') })) }, null, 2));
const r = spawnSync(process.execPath, ['--import', path.join(root, 'scripts/sites-env.mjs'),
  path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB',
  '--local', '--config', config, '--persist-to', path.join(root, '.wrangler/state')],
  { cwd: root, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
if (r.error) throw r.error;
process.exitCode = r.status ?? 1;
