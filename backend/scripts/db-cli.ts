import { spawn } from 'node:child_process';
import { loadEnv } from '../src/env.ts';

loadEnv();

const url = process.env.DATABASE_URL;
const extraArgs = process.argv.slice(2);

if (url) {
  const child = spawn('psql', [url, ...extraArgs], { stdio: 'inherit' });
  child.on('error', (err) => {
    console.error('Failed to launch psql. Is PostgreSQL client installed?', err.message);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else if (process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME) {
  const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };
  const args = [
    '-h', process.env.HOST || '127.0.0.1',
    '-U', process.env.DB_USER,
    '-d', process.env.DB_NAME,
    ...extraArgs,
  ];
  const child = spawn('psql', args, { env, stdio: 'inherit' });
  child.on('error', (err) => {
    console.error('Failed to launch psql. Is PostgreSQL client installed?', err.message);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  console.error('Neither DATABASE_URL nor DB_USER/DB_PASSWORD/DB_NAME is set in backend/.env');
  process.exit(1);
}
