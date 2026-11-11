import type { RequestHandler } from 'express';

// Check if terminal supports color (ANSI)
const isColorSupported =
  Boolean(process.stdout.isTTY) &&
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb';

const colors = {
  reset: isColorSupported ? '\x1b[0m' : '',
  dim: isColorSupported ? '\x1b[2m' : '',
  bold: isColorSupported ? '\x1b[1m' : '',
  red: isColorSupported ? '\x1b[31m' : '',
  green: isColorSupported ? '\x1b[32m' : '',
  yellow: isColorSupported ? '\x1b[33m' : '',
  blue: isColorSupported ? '\x1b[34m' : '',
  magenta: isColorSupported ? '\x1b[35m' : '',
  cyan: isColorSupported ? '\x1b[36m' : '',
  gray: isColorSupported ? '\x1b[90m' : '',
};

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

function tagColor(tag: string): string {
  switch (tag.toUpperCase()) {
    case 'HTTP':
      return colors.cyan;
    case 'AUTH':
      return colors.magenta;
    case 'DB':
    case 'DB:MONGO':
    case 'DB:MEMORY':
      return colors.blue;
    case 'EXPENSES':
      return colors.yellow;
    case 'SERVER':
      return colors.green;
    case 'ERROR':
      return colors.red;
    default:
      return colors.blue;
  }
}

function statusColor(status: number): string {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.yellow;
  if (status >= 300) return colors.cyan;
  if (status >= 200) return colors.green;
  return colors.reset;
}

export const logger = {
  info(tag: string, message: string, ...meta: unknown[]) {
    const time = `${colors.gray}[${formatTimestamp()}]${colors.reset}`;
    const badge = `${tagColor(tag)}[${tag}]${colors.reset}`;
    if (meta.length > 0) {
      console.log(`${time} ${badge} ${message}`, ...meta);
    } else {
      console.log(`${time} ${badge} ${message}`);
    }
  },

  warn(tag: string, message: string, ...meta: unknown[]) {
    const time = `${colors.gray}[${formatTimestamp()}]${colors.reset}`;
    const badge = `${colors.yellow}[${tag}]${colors.reset}`;
    if (meta.length > 0) {
      console.warn(`${time} ${badge} ⚠️  ${message}`, ...meta);
    } else {
      console.warn(`${time} ${badge} ⚠️  ${message}`);
    }
  },

  error(tag: string, message: string, ...meta: unknown[]) {
    const time = `${colors.gray}[${formatTimestamp()}]${colors.reset}`;
    const badge = `${colors.red}[${tag}]${colors.reset}`;
    if (meta.length > 0) {
      console.error(`${time} ${badge} ❌ ${message}`, ...meta);
    } else {
      console.error(`${time} ${badge} ❌ ${message}`);
    }
  },

  debug(tag: string, message: string, ...meta: unknown[]) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      const time = `${colors.gray}[${formatTimestamp()}]${colors.reset}`;
      const badge = `${colors.gray}[${tag}]${colors.reset}`;
      if (meta.length > 0) {
        console.debug(`${time} ${badge} ${colors.dim}${message}${colors.reset}`, ...meta);
      } else {
        console.debug(`${time} ${badge} ${colors.dim}${message}${colors.reset}`);
      }
    }
  },

  http(method: string, path: string, status: number, durationMs: number) {
    const time = `${colors.gray}[${formatTimestamp()}]${colors.reset}`;
    const badge = `${colors.cyan}[HTTP]${colors.reset}`;
    const methodStr = `${colors.bold}${method.padEnd(6)}${colors.reset}`;
    const statusStr = `${statusColor(status)}${status}${colors.reset}`;
    const durationStr = `${colors.gray}(${durationMs}ms)${colors.reset}`;

    console.log(`${time} ${badge} ${methodStr} ${path} ${statusStr} ${durationStr}`);
  },
};

/**
 * Express middleware for automatic request & response logging with latency.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  const method = req.method;
  const path = req.originalUrl || req.url;

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(method, path, res.statusCode, duration);
  });

  next();
};
