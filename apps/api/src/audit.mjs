import { isIP } from 'node:net';
import crypto from 'node:crypto';
const LABELS = {
  'page.view': 'Seite geöffnet',
  'portfolio.enter': 'Portfolio betreten',
  'login.success': 'Anmeldung erfolgreich',
  'login.failed': 'Anmeldung fehlgeschlagen',
  'auth.logout': 'Abgemeldet',
  'auth.setup': 'Admin eingerichtet',
  'admin.action': 'Admin-Aktion',
  'request.error': 'Anfrage fehlgeschlagen',
  'server.error': 'Serverfehler',
  'discord.error': 'Discord-Verbindungsfehler',
  'client.error': 'Browser-Laufzeitfehler',
  'system.test': 'Discord-Log-Test',
};
export function safeLogPath(input = '') {
  const path = String(input).split(/[?#]/, 1)[0];
  const resource = path.match(/^\/api\/admin\/(files|links|shortlinks)\/[^/]+$/);
  if (resource) return '/api/admin/' + resource[1] + '/[id]';
  if (/^\/api\/admin\/discord\/[^/]+$/.test(path)) return '/api/admin/discord/[id]';
  if (
    [
      '/api/admin/portfolio',
      '/api/admin/files',
      '/api/admin/links',
      '/api/admin/shortlinks',
      '/api/admin/security',
      '/api/admin/security/password',
      '/api/admin/security/totp/begin',
      '/api/admin/security/totp/enable',
      '/api/admin/security/totp/disable',
      '/api/admin/logs',
      '/api/admin/logs/test',
    ].includes(path)
  )
    return path;
  if (/^\/(?:f|s|go)\//.test(path)) return '/' + path.split('/')[1] + '/[key]';
  return [
    '/',
    '/login',
    '/setup',
    '/admin',
    '/admin/portfolio',
    '/admin/files',
    '/admin/shortlinks',
    '/admin/stats',
    '/admin/security',
    '/admin/logs',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/setup',
    '/api/portfolio/view',
    '/api/events/page',
  ].includes(path)
    ? path
    : '[andere Route]';
}
export function discordLogMessage(event) {
  const timestamp = Math.floor(new Date(event.time).getTime() / 1000);
  const marker = event.level === 'error' ? '🔴' : event.level === 'warn' ? '🟠' : '🔹';
  return [
    marker + ' **' + event.label + '** · <t:' + timestamp + ':F> (<t:' + timestamp + ':R>)',
    '**Seite:** ' +
      (event.page || event.path) +
      ' · **Route:** ' +
      event.method +
      ' ' +
      event.path +
      ' · ' +
      event.status +
      ' · ' +
      event.actor,
    '**IP:** ' + (event.ip || 'Unbekannt') + ' · **Browser:** ' + (event.browser || 'Unbekannt'),
    '**Gerät:** ' + (event.device || 'Unbekannt') + ' · **System:** ' + (event.os || 'Unbekannt'),
  ].join('\n');
}

export function createAuditLog({ token = '', channelId = '', fetcher = fetch, delay = 1200 } = {}) {
  const enabled = !!token && /^\d{17,20}$/.test(channelId);
  const recent = [],
    queue = [];
  let timer,
    working = false,
    closed = false,
    retries = 0,
    dropped = 0,
    lastSentAt = null,
    lastError = '';
  const schedule = (ms = delay) => {
    if (enabled && !timer && !closed && queue.length) {
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, ms);
      timer.unref?.();
    }
  };
  async function flush() {
    if (!enabled || working || closed || !queue.length) return;
    working = true;
    const batch = [];
    let messageLength = 0;
    while (queue.length && batch.length < 8) {
      const nextLength = discordLogMessage(queue[0]).length + 2;
      if (batch.length && messageLength + nextLength > 1900) break;
      messageLength += nextLength;
      batch.push(queue.shift());
    }
    try {
      const content = batch.map(discordLogMessage).join('\n\n');
      const response = await fetcher(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] }, flags: 4096 }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 429) {
        const data = await response.json().catch(() => ({}));
        queue.unshift(...batch);
        lastError = 'Discord-Rate-Limit; Zustellung wird wiederholt.';
        schedule(Math.max(1000, Number(data.retry_after || 5) * 1000));
        return;
      }
      if (!response.ok)
        throw Object.assign(Error('Discord-Zustellung fehlgeschlagen.'), {
          status: response.status,
        });
      lastSentAt = new Date().toISOString();
      lastError = '';
      retries = 0;
    } catch (error) {
      lastError =
        error.status === 403
          ? 'Bot hat keine Schreibrechte im Log-Kanal.'
          : error.status === 404
            ? 'Discord-Log-Kanal nicht gefunden.'
            : 'Discord-Logs konnten momentan nicht zugestellt werden.';
      if (++retries <= 3) {
        queue.unshift(...batch);
        schedule(5000 * retries);
      } else {
        dropped += batch.length;
        retries = 0;
      }
    } finally {
      working = false;
      schedule();
    }
  }
  return {
    record(
      type,
      {
        path = '/',
        method = 'GET',
        status = 200,
        actor = 'Besucher',
        ip = 'Unbekannt',
        browser = 'Unbekannt',
        os = 'Unbekannt',
        device = 'Unbekannt',
        page = '',
      } = {},
    ) {
      if (!Object.hasOwn(LABELS, type)) return;
      const event = {
        id: crypto.randomUUID(),
        type,
        label: LABELS[type],
        time: new Date().toISOString(),
        path: safeLogPath(path),
        page: safeLogPath(page || path),
        ip: isIP(String(ip)) ? String(ip) : 'Unbekannt',
        browser: String(browser)
          .replace(/[^a-zA-Z0-9 ./-]/g, '')
          .slice(0, 80),
        os: String(os)
          .replace(/[^a-zA-Z0-9 ./-]/g, '')
          .slice(0, 80),
        device: ['Bot/Crawler', 'Tablet', 'Smartphone', 'Desktop/Laptop', 'Unbekannt'].includes(
          device,
        )
          ? device
          : 'Unbekannt',
        method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method) ? method : 'GET',
        status: Number.isInteger(status) ? status : 0,
        actor: actor === 'Admin' ? 'Admin' : 'Besucher',
        level: type.includes('error') ? 'error' : type === 'login.failed' ? 'warn' : 'info',
      };
      recent.unshift(event);
      if (recent.length > 100) recent.pop();
      if (enabled) {
        if (queue.length >= 200) {
          queue.shift();
          dropped++;
        }
        queue.push(event);
        schedule();
      }
    },
    snapshot() {
      return {
        configured: enabled,
        channelId: channelId || '',
        queued: queue.length,
        dropped,
        lastSentAt,
        lastError,
        events: [...recent],
      };
    },
    flush,
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}
