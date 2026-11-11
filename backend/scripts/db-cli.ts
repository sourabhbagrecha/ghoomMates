import { spawn } from 'node:child_process';
import { loadEnv } from '../src/env.ts';

loadEnv();

// Opens mongosh on the app database (npm run db:cli -- --eval 'db.users.countDocuments()').
const uri = process.env.MONGODB_CONNECTION_STRING;
if (!uri) {
  console.error('MONGODB_CONNECTION_STRING is not set in backend/.env');
  process.exit(1);
}
const args = [uri, '--quiet', '--eval', `db = db.getSiblingDB(${JSON.stringify(process.env.MONGODB_DB || 'ghoomates')})`, '--shell', ...process.argv.slice(2)];
const child = spawn('mongosh', args, { stdio: 'inherit' });
child.on('error', (err) => {
  console.error('Failed to launch mongosh. Is it installed? (brew install mongosh)', err.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
