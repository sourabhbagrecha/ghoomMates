import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load backend/.env into process.env without overriding variables already set.
export function loadEnv(envPath = resolve(import.meta.dirname, '../.env')) {
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...vals] = trimmed.split('=');
      if (key && vals.length > 0 && !process.env[key]) {
        process.env[key] = vals.join('=').replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
}
