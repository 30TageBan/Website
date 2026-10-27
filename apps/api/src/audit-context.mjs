import { isIP } from 'node:net';
import { safeLogPath } from './audit.mjs';

/** Only recognized page paths are kept; query strings, fragments and access tickets are discarded. */
export function logPage(input = '') {
  const path = safeLogPath(input);
  return path.startsWith('/api/') || path === '[andere Route]' ? '' : path;
}

export function userAgentDetails(input = '') {
  const ua = String(input).slice(0, 1000);
  const products = [
    ['Edge', /Edg(?:A|iOS)?\/([\d.]+)/],
    ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  const product = products.find(([, pattern]) => pattern.test(ua));
  const browser = product ? `${product[0]} ${ua.match(product[1])[1]}` : 'Unbekannt';
  let os = 'Unbekannt';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android ' + (ua.match(/Android ([\d.]+)/)?.[1] || '');
  else if (/(iPhone|iPad|iPod)/.test(ua))
    os =
      'iOS/iPadOS ' +
      (ua.match(/(?:CPU(?: iPhone)? OS|iPhone OS) ([\d_]+)/)?.[1]?.replaceAll('_', '.') || '');
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const bot = /bot|crawler|spider|preview|facebookexternalhit/i.test(ua);
  const tablet = /iPad|Tablet|PlayBook/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua));
  const mobile = /Mobile|iPhone|iPod|Android/i.test(ua);
  const device = bot
    ? 'Bot/Crawler'
    : tablet
      ? 'Tablet'
      : mobile
        ? 'Smartphone'
        : os !== 'Unbekannt'
          ? 'Desktop/Laptop'
          : 'Unbekannt';
  return { browser, os: os.trim(), device };
}

export function requestLogContext(req, page = '') {
  let ip = String(req.ip || req.socket?.remoteAddress || '');
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (!isIP(ip)) ip = 'Unbekannt';
  let currentPage = logPage(page);
  if (!currentPage) {
    try {
      currentPage = logPage(new URL(req.get('referer')).pathname);
    } catch {
      /* No browser referrer. */
    }
  }
  if (!currentPage) {
    const path = req.path || '';
    if (path.startsWith('/api/auth/login')) currentPage = '/login';
    else if (path.startsWith('/api/auth/setup')) currentPage = '/setup';
    else if (
      path.startsWith('/api/admin/links') ||
      path.startsWith('/api/admin/portfolio') ||
      path.startsWith('/api/admin/discord')
    )
      currentPage = '/admin/portfolio';
    else if (path.startsWith('/api/admin/files')) currentPage = '/admin/files';
    else if (path.startsWith('/api/admin/shortlinks')) currentPage = '/admin/shortlinks';
    else if (path.startsWith('/api/admin/security')) currentPage = '/admin/security';
    else if (path.startsWith('/api/admin/logs')) currentPage = '/admin/logs';
    else currentPage = logPage(path) || (path.startsWith('/api/portfolio') ? '/' : 'Unbekannt');
  }
  return { ip, page: currentPage, ...userAgentDetails(req.get('user-agent')) };
}
