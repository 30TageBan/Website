import express from 'express';
import { createAuditLog } from './audit.mjs';
import { requestLogContext } from './audit-context.mjs';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  createSession,
  userId,
  equal,
  encrypt,
  decrypt,
  provisioning,
  verifyTotp,
  sign,
  verify,
} from './security.mjs';
import { filePath, storeFile } from './storage.mjs';
import { normalizeLinkType, detectLinkType } from '../../../shared/platforms.ts';
import { safeButtonUrl } from '../../../shared/portfolio.ts';
import { BACKGROUNDS, ANIMATIONS, CURSORS } from '../../../shared/appearance.ts';
import { TITLE_EFFECTS, TAB_EFFECTS } from '../../../shared/titles.ts';
import { createDiscordClient, applyDiscordProfile } from './discord.mjs';

const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'Nur HTTP(S)-URLs erlaubt.');
const imageUrl = z.union([httpUrl, z.literal('')]).default('');
const keySchema = z.string().regex(/^[\w-]{3,32}$/);
const shortSchema = z.object({
  key: z.string().default(''),
  destinationUrl: httpUrl,
  expiresInDays: z.coerce.number().int().min(0).max(3650).optional(),
  maxViews: z.coerce.number().int().min(0).max(1000000).default(0),
  requireClick: z.boolean().default(false),
  countdownSeconds: z
    .union([z.literal(0), z.literal(3), z.literal(5), z.literal(10), z.literal(15)])
    .default(0),
});
const portfolioSchema = z.object({
  title: z.string().trim().min(1).max(150),
  subtitle: z.string().trim().min(1).max(500),
  avatarUrl: imageUrl,
  bannerUrl: imageUrl,
  seoTitle: z.string().max(200).default(''),
  seoDescription: z.string().max(1000).default(''),
  seoOgImageUrl: imageUrl,
  backgroundPreset: z
    .string()
    .refine((value) => Object.hasOwn(BACKGROUNDS, value))
    .default('default'),
  overlayOpacity: z.coerce.number().min(0).max(1).default(0.55),
  blur: z.coerce.number().min(0).max(60).default(18),
  vignette: z.coerce.number().min(0).max(1).default(0.35),
  spotifyTrackId: z.string().default(''),
  content: z
    .object({
      buttons: z
        .array(
          z.object({
            label: z.string().trim().min(1).max(60),
            url: z
              .string()
              .max(2000)
              .refine(
                safeButtonUrl,
                'Ungültiges Button-Ziel. HTTP(S), /Pfad oder #Abschnitt verwenden.',
              ),
          }),
        )
        .max(10),
      sections: z
        .array(
          z.object({
            title: z.string().trim().min(1).max(100),
            text: z.string().max(3000),
            items: z.array(z.string().trim().min(1).max(300)).max(30),
            buttons: z
              .array(
                z.object({
                  label: z.string().trim().min(1).max(60),
                  url: z.string().max(2000).refine(safeButtonUrl),
                }),
              )
              .max(10),
          }),
        )
        .max(12)
        .optional(),
      servicesTitle: z.string().trim().max(100),
      services: z.array(z.string().trim().min(1).max(300)).max(30),
      spotifyAutoplay: z.boolean(),
      showLinkText: z.boolean().optional(),
      motion: z.enum(['subtle', 'lively', 'none']).optional(),
      appearance: z
        .object({
          density: z.enum(['low', 'normal', 'high']).optional(),
          interactive: z.boolean().optional(),
          animation: z.string().refine((value) => Object.hasOwn(ANIMATIONS, value)),
          speed: z.enum(['slow', 'normal', 'fast']),
          cursor: z.string().refine((value) => Object.hasOwn(CURSORS, value)),
          accent: z.string().regex(/^#[0-9a-f]{6}$/i),
          mediaType: z.enum(['none', 'image', 'video']),
          mediaUrl: z.union([
            z.literal(''),
            z.string().refine((value) => safeButtonUrl(value) && !value.startsWith('#')),
          ]),
        })
        .optional(),
      audio: z
        .object({
          url: z.union([
            z.literal(''),
            z.string().refine((value) => safeButtonUrl(value) && !value.startsWith('#')),
          ]),
          title: z.string().trim().max(100),
          autoplay: z.boolean(),
        })
        .optional(),
      titleEffect: z
        .string()
        .refine((value) => Object.hasOwn(TITLE_EFFECTS, value))
        .optional(),
      tabTitleEffect: z
        .string()
        .refine((value) => Object.hasOwn(TAB_EFFECTS, value))
        .optional(),
      discord: z
        .object({
          userId: z.union([z.literal(''), z.string().regex(/^\d{17,20}$/)]),
          syncAvatar: z.boolean(),
          syncBanner: z.boolean(),
          syncName: z.boolean(),
          showBadges: z.boolean().optional(),
        })
        .refine(
          (value) => !!value.userId || !(value.syncAvatar || value.syncBanner || value.syncName),
          'Zum Synchronisieren eine Discord-Benutzer-ID eingeben.',
        )
        .optional(),
    })
    .optional(),
});
const linkSchema = z.object({
  type: z.string().default('auto'),
  label: z.string().max(100).default(''),
  url: httpUrl,
  color: z.union([z.string().regex(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i), z.literal('')]).default(''),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
const linkData = (input) => ({
  ...input,
  type: input.type === 'auto' ? detectLinkType(input.url) : normalizeLinkType(input.type),
  color: input.color || null,
});
const escape = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const bot = (ua = '') => /bot|crawler|spider|preview|WhatsApp|facebookexternalhit/i.test(ua);
const expired = (link) => link.expiresAt && new Date(link.expiresAt) <= new Date();
const missingFile = (res) => res.status(404).json({ error: 'Datei nicht gefunden.' });

export function createApp({ db, config }) {
  const app = express();
  const audit = createAuditLog({
    token: config.discordBotToken,
    channelId: config.discordLogChannelId,
  });
  app.locals.audit = audit;
  const discordClient = createDiscordClient(config.discordBotToken);
  const discord = async (id) => {
    try {
      return await discordClient(id);
    } catch (error) {
      audit.record('discord.error', {
        path: '/api/admin/discord/[id]',
        status: error.status || 503,
      });
      throw error;
    }
  };
  app.use((req, res, next) => {
    res.on('finish', () => {
      const status = res.statusCode,
        path = req.path,
        method = req.method,
        actor = req.userId ? 'Admin' : 'Besucher';
      const context = requestLogContext(req);
      if (path === '/api/auth/login' && method === 'POST')
        audit.record(status < 400 ? 'login.success' : 'login.failed', {
          ...context,
          path,
          method,
          status,
          actor: status < 400 ? 'Admin' : 'Besucher',
        });
      else if (path === '/api/auth/logout' && method === 'POST' && status < 400)
        audit.record('auth.logout', { ...context, path, method, status, actor: 'Admin' });
      else if (path === '/api/auth/setup' && method === 'POST' && status < 400)
        audit.record('auth.setup', { ...context, path, method, status, actor: 'Admin' });
      else if (
        path.startsWith('/api/admin/') &&
        !path.startsWith('/api/admin/logs') &&
        !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
        status < 400
      )
        audit.record('admin.action', { ...context, path, method, status, actor });
      else if (status >= 400 && !path.startsWith('/api/admin/logs'))
        audit.record(status >= 500 ? 'server.error' : 'request.error', {
          ...context,
          path,
          method,
          status,
          actor,
        });
    });
    next();
  });
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ?? 'loopback');
  app.use((req, res, next) => {
    res.set({
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/admin') ||
      req.path.startsWith('/f/') ||
      req.path.startsWith('/s/')
    )
      res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: '256kb' }));
  // Angular's built-in XSRF interceptor sends this header for same-origin mutations.
  app.use('/api', (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !equal(req.cookies['XSRF-TOKEN'], req.get('X-XSRF-TOKEN'))
    )
      return res.status(403).json({ error: 'CSRF-Token ungültig. Bitte Seite neu laden.' });
    next();
  });
  app.get('/api/auth/status', async (req, res) => {
    if (!req.cookies['XSRF-TOKEN'])
      res.cookie('XSRF-TOKEN', crypto.randomBytes(24).toString('hex'), {
        secure: config.production,
        sameSite: 'lax',
        path: '/',
      });
    const [id, count] = await Promise.all([userId(req, db, config), db.user.count()]);
    res.json({ loggedIn: !!id, setupComplete: count > 0 });
  });
  // Bounded per-IP login attempts; expired entries are removed on each attempt.
  const attempts = new Map();
  function rateLimit(req, _res, next) {
    const now = Date.now();
    for (const [key, item] of attempts) if (item.until < now) attempts.delete(key);
    const key = req.ip;
    const item = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
    if (item.count >= 20 || attempts.size > 10000)
      return next(
        Object.assign(Error('Zu viele Versuche. Bitte später erneut versuchen.'), { status: 429 }),
      );
    item.count++;
    attempts.set(key, item);
    next();
  }
  async function admin(req, res, next) {
    req.userId = await userId(req, db, config);
    if (!req.userId) return res.status(401).json({ error: 'Bitte anmelden.' });
    next();
  }
  app.post('/api/auth/login', rateLimit, async (req, res) => {
    const input = z
      .object({ password: z.string().min(1).max(128), totp: z.string().default('') })
      .parse(req.body);
    const user = await db.user.findFirst();
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash)))
      fail('Login fehlgeschlagen.', 401);
    if (
      user.totpEnabled &&
      (!user.totpSecretEnc || !verifyTotp(input.totp, decrypt(user.totpSecretEnc, config.secret)))
    )
      fail('2FA-Code ungültig.', 401);
    await createSession(res, user.id, db, config);
    res.json({ ok: true });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const token = await verify(req.cookies.cg_session, config.secret);
    if (token?.sid) await db.session.deleteMany({ where: { id: token.sid } });
    res.clearCookie('cg_session', {
      path: '/',
      secure: config.production,
      sameSite: 'lax',
      httpOnly: true,
    });
    res.json({ ok: true });
  });
  app.post('/api/auth/setup/totp', rateLimit, async (_req, res) => {
    if (await db.user.count()) fail('Setup ist bereits abgeschlossen.', 409);
    res.json(await provisioning());
  });
  app.post('/api/auth/setup', rateLimit, async (req, res) => {
    const input = z
      .object({
        password: z.string().min(8).max(128),
        enableTotp: z.boolean().default(false),
        totpSecret: z.string().default(''),
        firstTotp: z.string().default(''),
      })
      .parse(req.body);
    if (input.enableTotp && !verifyTotp(input.firstTotp, input.totpSecret))
      fail('Erster 2FA-Code ungültig.');
    const passwordHash = await bcrypt.hash(input.password, 12);
    // Serialisiert den Erststart, damit parallele Requests keinen zweiten Admin anlegen.
    const user = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7023000)`;
      if (await tx.user.count()) fail('Setup ist bereits abgeschlossen.', 409);
      return tx.user.create({
        data: {
          passwordHash,
          totpEnabled: input.enableTotp,
          totpSecretEnc: input.enableTotp ? encrypt(input.totpSecret, config.secret) : null,
        },
      });
    });
    await createSession(res, user.id, db, config);
    res.json({ ok: true });
  });

  const portfolio = async () =>
    applyDiscordProfile(
      await db.portfolio.findFirst({ include: { links: { orderBy: { sortOrder: 'asc' } } } }),
      discord,
    );
  app.get('/api/portfolio', async (_req, res) => res.json(await portfolio()));
  app.post('/api/portfolio/view', async (req, res) => {
    const p = await db.portfolio.findFirst({ select: { id: true, viewsCount: true } });
    if (!p) return res.status(404).json({ error: 'Portfolio nicht gefunden.' });
    const seen = await verify(req.cookies.cg_portfolio_view, config.secret);
    if (bot(req.get('user-agent')) || seen?.portfolioId === p.id)
      return res.json({ viewsCount: p.viewsCount });
    const updated = await db.portfolio.update({
      where: { id: p.id },
      data: { viewsCount: { increment: 1 } },
      select: { viewsCount: true },
    });
    audit.record('portfolio.enter', { ...requestLogContext(req, '/'), path: '/', method: 'POST' });
    res.cookie('cg_portfolio_view', await sign({ portfolioId: p.id }, config.secret, '30m'), {
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60000,
    });
    res.json(updated);
  });
  const pageEvents = new Map();
  app.post(['/api/events/page', '/api/events/error'], (req, res) => {
    const now = Date.now();
    for (const [key, item] of pageEvents) if (item.until < now) pageEvents.delete(key);
    const key = req.ip || 'unknown',
      item = pageEvents.get(key) || { count: 0, until: now + 60000 };
    if (item.count >= 30 || pageEvents.size >= 10000)
      return res.status(429).json({ error: 'Zu viele Seitenmeldungen.' });
    item.count++;
    pageEvents.set(key, item);
    const input = z
      .object({
        path: z.enum([
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
          '/f/[key]',
          '/go/[key]',
        ]),
      })
      .parse(req.body);
    audit.record(req.path.endsWith('/error') ? 'client.error' : 'page.view', {
      ...requestLogContext(req, input.path),
      path: input.path,
      method: 'GET',
      status: req.path.endsWith('/error') ? 0 : 200,
    });
    res.json({ ok: true });
  });
  app.use('/api/admin', admin);
  app.get('/api/admin/logs', (_req, res) => res.json(audit.snapshot()));
  app.post('/api/admin/logs/test', async (req, res) => {
    audit.record('system.test', {
      ...requestLogContext(req),
      path: '/api/admin/logs',
      method: 'POST',
      actor: 'Admin',
    });
    await audit.flush();
    res.json(audit.snapshot());
  });
  app.get('/api/admin/portfolio', async (_req, res) =>
    res.json(
      await db.portfolio.findFirst({ include: { links: { orderBy: { sortOrder: 'asc' } } } }),
    ),
  );
  app.get('/api/admin/discord', (_req, res) => res.json({ configured: !!config.discordBotToken }));
  app.get('/api/admin/discord/:id', async (req, res) => {
    try {
      res.json(await discord(req.params.id));
    } catch (error) {
      if (!error.status)
        error = Object.assign(Error('Discord ist momentan nicht erreichbar.'), { status: 503 });
      res
        .status(error.status)
        .json({ error: error.message, code: error.code, upstreamStatus: error.upstreamStatus });
    }
  });
  app.get('/api/admin/overview', async (_req, res) => {
    const [shortlinks, files] = await Promise.all([db.shortLink.count(), db.fileObject.count()]);
    res.json({ shortlinks, files });
  });
  app.put('/api/admin/portfolio', async (req, res) => {
    const input = portfolioSchema.parse(req.body);
    let spotifyTrackId = input.spotifyTrackId.trim();
    if (spotifyTrackId.includes('/')) {
      try {
        const url = new URL(spotifyTrackId);
        spotifyTrackId =
          url.hostname === 'open.spotify.com'
            ? url.pathname.match(/\/track\/([a-zA-Z0-9]+)/)?.[1] || ''
            : '';
      } catch {
        spotifyTrackId = '';
      }
    }
    if (input.spotifyTrackId && !/^[a-zA-Z0-9]{10,}$/.test(spotifyTrackId))
      fail('Spotify Track muss eine gültige URL oder ID sein.');
    const { overlayOpacity, blur, vignette, ...rest } = input;
    const data = {
      ...rest,
      spotifyTrackId,
      backgroundSettings: { overlayOpacity, blur, vignette },
    };
    const existing = await db.portfolio.findFirst();
    res.json(
      existing
        ? await db.portfolio.update({ where: { id: existing.id }, data })
        : await db.portfolio.create({ data }),
    );
  });
  app.post('/api/admin/links', async (req, res) => {
    const input = linkSchema.parse(req.body);
    const existing = await db.portfolio.findFirst();
    if (!existing) fail('Bitte zuerst das Portfolio speichern.');
    res.json(
      await db.portfolioLink.create({ data: { ...linkData(input), portfolioId: existing.id } }),
    );
  });
  app.put('/api/admin/links/:id', async (req, res) => {
    const input = linkSchema.parse(req.body);
    if (!(await db.portfolioLink.findUnique({ where: { id: req.params.id } })))
      fail('Link nicht gefunden.', 404);
    res.json(
      await db.portfolioLink.update({ where: { id: req.params.id }, data: linkData(input) }),
    );
  });
  app.delete('/api/admin/links/:id', async (req, res) => {
    await db.portfolioLink.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });
  app.get('/api/admin/files', async (_req, res) =>
    res.json(await db.fileObject.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 4 },
  });
  app.post('/api/admin/files', upload.single('file'), async (req, res) =>
    res.json(await storeFile(db, config.dataDir, req.file, req.body)),
  );
  app.patch('/api/admin/files/:id', async (req, res) => {
    const data = z.object({ isPublic: z.boolean() }).parse(req.body);
    res.json(await db.fileObject.update({ where: { id: req.params.id }, data }));
  });
  app.delete('/api/admin/files/:id', async (req, res) => {
    const file = await db.fileObject.findUnique({ where: { id: req.params.id } });
    if (file) {
      await db.fileObject.delete({ where: { id: file.id } });
      await fs.unlink(filePath(config.dataDir, file.key)).catch(() => {});
    }
    res.json({ ok: true });
  });
  app.get('/api/admin/shortlinks', async (_req, res) =>
    res.json(await db.shortLink.findMany({ orderBy: { createdAt: 'desc' } })),
  );
  function shortData(input, existing) {
    const data = shortSchema.parse(input);
    return {
      key: keySchema.parse(data.key || crypto.randomBytes(6).toString('hex')),
      destinationUrl: data.destinationUrl,
      expiresAt:
        data.expiresInDays === undefined
          ? existing?.expiresAt || null
          : data.expiresInDays
            ? new Date(Date.now() + data.expiresInDays * 86400000)
            : null,
      maxViews: data.maxViews || null,
      requireClick: data.requireClick,
      countdownSeconds: data.countdownSeconds,
    };
  }
  app.post('/api/admin/shortlinks', async (req, res) =>
    res.json(await db.shortLink.create({ data: shortData(req.body) })),
  );
  app.put('/api/admin/shortlinks/:id', async (req, res) => {
    const existing = await db.shortLink.findUnique({ where: { id: req.params.id } });
    if (!existing) fail('Kurzlink nicht gefunden.', 404);
    res.json(
      await db.shortLink.update({
        where: { id: existing.id },
        data: shortData(req.body, existing),
      }),
    );
  });
  app.delete('/api/admin/shortlinks/:id', async (req, res) => {
    await db.shortLink.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });
  app.get('/api/admin/stats', async (_req, res) => {
    const [topShortlinks, topFiles, lastFiles] = await Promise.all([
      db.shortLink.findMany({ orderBy: { viewsCount: 'desc' }, take: 10 }),
      db.fileObject.findMany({ orderBy: { viewsCount: 'desc' }, take: 10 }),
      db.fileObject.findMany({
        orderBy: [{ lastAccessedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
        take: 10,
      }),
    ]);
    res.json({ topShortlinks, topFiles, lastFiles });
  });
  app.get('/api/admin/security', async (req, res) => {
    const user = await db.user.findUnique({ where: { id: req.userId } });
    res.json({ totpEnabled: user.totpEnabled });
  });
  app.post('/api/admin/security/password', async (req, res) => {
    const input = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) })
      .parse(req.body);
    const user = await db.user.findUnique({ where: { id: req.userId } });
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash)))
      fail('Aktuelles Passwort stimmt nicht.');
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(input.newPassword, 12) },
      }),
      db.session.deleteMany({ where: { userId: user.id } }),
    ]);
    res.clearCookie('cg_session', { path: '/' });
    res.json({ ok: true });
  });
  app.post('/api/admin/security/totp/begin', async (_req, res) => res.json(await provisioning()));
  app.post('/api/admin/security/totp/enable', async (req, res) => {
    const input = z
      .object({ secretBase32: z.string().min(16), token: z.string().min(6) })
      .parse(req.body);
    const user = await db.user.findUnique({ where: { id: req.userId } });
    if (user.totpEnabled) fail('2FA ist bereits aktiviert.', 409);
    if (!verifyTotp(input.token, input.secretBase32)) fail('2FA-Code ungültig.');
    await db.user.update({
      where: { id: req.userId },
      data: { totpEnabled: true, totpSecretEnc: encrypt(input.secretBase32, config.secret) },
    });
    res.json({ ok: true });
  });
  app.post('/api/admin/security/totp/disable', async (req, res) => {
    const input = z
      .object({ password: z.string().min(1), token: z.string().default('') })
      .parse(req.body);
    const user = await db.user.findUnique({ where: { id: req.userId } });
    if (!(await bcrypt.compare(input.password, user.passwordHash))) fail('Passwort falsch.');
    if (
      user.totpEnabled &&
      (!user.totpSecretEnc || !verifyTotp(input.token, decrypt(user.totpSecretEnc, config.secret)))
    )
      fail('2FA-Code ungültig.');
    await db.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecretEnc: null },
    });
    res.json({ ok: true });
  });

  app.get('/api/files/:key', async (req, res) => {
    const file = await db.fileObject.findUnique({ where: { key: req.params.key } });
    if (!file || (!file.isPublic && !(await userId(req, db, config)))) return missingFile(res);
    let text;
    if (file.mimeType === 'text/plain') {
      try {
        text = await fs.readFile(filePath(config.dataDir, file.key), 'utf8');
      } catch {
        return missingFile(res);
      }
    }
    if (req.method === 'GET')
      await db.fileObject.update({
        where: { id: file.id },
        data: { viewsCount: { increment: 1 }, lastAccessedAt: new Date() },
      });
    res.json({ key: file.key, originalName: file.originalName, mimeType: file.mimeType, text });
  });
  app.get('/f/:key/raw', async (req, res) => {
    const file = await db.fileObject.findUnique({ where: { key: req.params.key } });
    if (!file || (!file.isPublic && !(await userId(req, db, config)))) return missingFile(res);
    const dest = filePath(config.dataDir, file.key);
    try {
      await fs.access(dest);
    } catch {
      return missingFile(res);
    }
    res.type(file.mimeType).set('Content-Disposition', 'inline').sendFile(dest);
  });

  app.get('/s/:key', async (req, res) => {
    const link = await db.shortLink.findUnique({ where: { key: req.params.key } });
    if (!link) return res.status(404).send('Link nicht gefunden.');
    if (req.method === 'HEAD' || bot(req.get('user-agent'))) {
      const p = await portfolio();
      return res
        .type('html')
        .send(
          `<!doctype html><html lang="de"><head><title>Kurzlink</title><meta property="og:title" content="Kurzlink"><meta property="og:description" content="Ein geteilter Link"><meta property="og:image" content="${escape(p?.seoOgImageUrl || p?.bannerUrl || '')}"></head><body>Link-Vorschau</body></html>`,
        );
    }
    if (expired(link)) return res.status(410).send('Dieser Link ist abgelaufen.');
    // Atomare Obergrenze: auch parallele Besucher können maxViews nicht überschreiten.
    const claimed = await db.shortLink.updateMany({
      where: {
        id: link.id,
        ...(link.maxViews === null ? {} : { viewsCount: { lt: link.maxViews } }),
      },
      data: { viewsCount: { increment: 1 } },
    });
    if (!claimed.count) return res.status(410).send('Dieser Link ist abgelaufen.');
    if (!link.requireClick && !link.countdownSeconds) return res.redirect(302, link.destinationUrl);
    const ticket = await sign(
      { purpose: 'shortlink', key: link.key, readyAt: Date.now() + link.countdownSeconds * 1000 },
      config.secret,
      '15m',
    );
    return res.redirect(
      302,
      `/go/${encodeURIComponent(link.key)}?ticket=${encodeURIComponent(ticket)}`,
    );
  });
  app.get('/api/resolve/:key', async (req, res) => {
    const ticket = await verify(req.query.ticket, config.secret);
    if (ticket?.purpose !== 'shortlink' || ticket.key !== req.params.key)
      fail('Link-Aufruf ungültig oder abgelaufen.', 410);
    const link = await db.shortLink.findUnique({ where: { key: req.params.key } });
    if (!link || expired(link)) fail('Link abgelaufen.', 410);
    res.json({
      requireClick: link.requireClick,
      seconds: Math.max(0, Math.ceil((ticket.readyAt - Date.now()) / 1000)),
    });
  });
  app.post('/api/resolve/:key', async (req, res) => {
    const ticket = await verify(req.body.ticket, config.secret);
    if (
      ticket?.purpose !== 'shortlink' ||
      ticket.key !== req.params.key ||
      ticket.readyAt > Date.now()
    )
      fail('Link-Aufruf ungültig oder Wartezeit noch nicht vorbei.', 410);
    const link = await db.shortLink.findUnique({ where: { key: req.params.key } });
    if (!link || expired(link)) fail('Link abgelaufen.', 410);
    res.json({ destinationUrl: link.destinationUrl });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API-Endpunkt nicht gefunden.' }));
  app.use(
    express.static(config.frontendDir, { index: false, maxAge: config.production ? '1h' : 0 }),
  );
  app.get('/{*path}', async (req, res) => {
    const index = path.join(config.frontendDir, 'index.html');
    let html;
    try {
      html = await fs.readFile(index, 'utf8');
    } catch {
      return res
        .status(503)
        .send(
          'Angular-Frontend zuerst mit npm run build erstellen. Im Entwicklungsmodus http://localhost:3000 öffnen.',
        );
    }
    if (req.path === '/') {
      const p = await portfolio();
      const title = escape(p?.seoTitle || p?.title || 'chris-g.dev');
      const description = escape(p?.seoDescription || p?.subtitle || 'Portfolio');
      const image = p?.seoOgImageUrl || p?.bannerUrl;
      html = html
        .replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)
        .replace(
          '</head>',
          `<meta name="description" content="${description}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">${image ? `<meta property="og:image" content="${escape(new URL(image, config.baseUrl).href)}"><meta name="twitter:image" content="${escape(new URL(image, config.baseUrl).href)}">` : ''}</head>`,
        );
    }
    res.type('html').send(html);
  });
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      });
    if (error.code === 'P2025')
      return res.status(404).json({ error: 'Eintrag nicht gefunden. Bitte Liste neu laden.' });
    if (error.code === 'P2002')
      return res.status(409).json({ error: 'Dieser Key ist bereits vergeben.' });
    if (error instanceof multer.MulterError)
      return res.status(400).json({ error: 'Upload ungültig oder größer als 50 MB.' });
    const status = error.status || 500;
    if (status >= 500) console.error('[api]', error.code || error.name, error.message);
    res.status(status).json({
      error: status >= 500 ? 'Serverfehler. Bitte Serverprotokoll prüfen.' : error.message,
    });
  });
  return app;
}
