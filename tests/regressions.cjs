const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function modules() {
  return {
    ...(await import('../apps/api/src/app.mjs')),
    ...(await import('../apps/api/src/storage.mjs')),
    ...(await import('../apps/api/src/security.mjs')),
    ...(await import('../shared/platforms.ts')),
  };
}
const secret = 'test-only-session-secret-with-at-least-32-characters';
const csrf = 'a'.repeat(48);
async function fixture(t, overrides = {}, configOverrides = {}) {
  const { createApp, sign } = await modules();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrisg-angular-'));
  await fs.writeFile(
    path.join(dir, 'index.html'),
    '<html><head><title>chris-g.dev</title></head><body><app-root></app-root></body></html>',
  );
  const user = { id: 'admin-id', totpEnabled: false };
  const db = {
    user: { count: async () => 1, findFirst: async () => user, findUnique: async () => user },
    session: {
      findUnique: async () => ({ userId: user.id, expiresAt: new Date(Date.now() + 60000) }),
      deleteMany: async () => ({ count: 1 }),
    },
    portfolio: {
      findFirst: async () => ({
        id: 'portfolio',
        title: 'Chris',
        subtitle: 'Developer',
        links: [],
      }),
    },
    portfolioLink: { create: async ({ data }) => data, delete: async () => ({}) },
    fileObject: {
      findUnique: async () => null,
      create: async ({ data }) => data,
      update: async ({ data }) => data,
      findMany: async () => [],
    },
    shortLink: {
      findUnique: async () => null,
      updateMany: async () => ({ count: 1 }),
      findMany: async () => [],
    },
    ...overrides,
  };
  const config = {
    secret,
    dataDir: dir,
    frontendDir: dir,
    production: false,
    baseUrl: 'http://localhost:3000',
    ...configOverrides,
  };
  const server = createApp({ db, config }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const token = await sign({ sid: 'session-id' }, secret);
  async function request(
    url,
    { method = 'GET', body, auth = true, xsrf = true, headers = {} } = {},
  ) {
    const cookie = [auth ? 'cg_session=' + token : '', xsrf ? 'XSRF-TOKEN=' + csrf : '']
      .filter(Boolean)
      .join('; ');
    const multipart = body instanceof FormData;
    return fetch('http://127.0.0.1:' + server.address().port + url, {
      method,
      redirect: 'manual',
      headers: {
        cookie,
        ...(xsrf ? { 'X-XSRF-TOKEN': csrf } : {}),
        ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });
  }
  return { dir, db, config, request };
}

test('platform colors, aliases, URL detection and explicit overrides', async () => {
  const { linkAppearance, detectLinkType } = await modules();
  assert.equal(linkAppearance({ type: 'twitch' }).color, '#9146FF');
  assert.equal(linkAppearance({ type: 'auto', url: 'https://www.twitch.tv/chris' }).type, 'twitch');
  assert.equal(linkAppearance({ type: 'twitter' }).type, 'x');
  assert.equal(linkAppearance({ type: 'discord' }).color, '#5865F2');
  assert.equal(linkAppearance({ type: 'twitch', color: '#abcdef' }).color, '#abcdef');
  assert.equal(detectLinkType('https://twitch.tv.evil.example'), 'website');
  assert.equal(detectLinkType('https://youtu.be/test'), 'youtube');
});
test('existing encryption and session JWT formats remain compatible', async () => {
  const { encrypt, decrypt, sign, verify } = await modules();
  assert.equal(decrypt(encrypt('BASE32SECRET', secret), secret), 'BASE32SECRET');
  assert.equal(
    (await verify(await sign({ sid: 'old-session' }, secret), secret)).sid,
    'old-session',
  );
});
test('auth bootstrap sets XSRF cookie without requiring login', async (t) => {
  const { request } = await fixture(t);
  const response = await request('/api/auth/status', { auth: false, xsrf: false });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /XSRF-TOKEN=/);
  assert.deepEqual(await response.json(), { loggedIn: false, setupComplete: true });
});
test('admin API requires a valid session', async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/admin/files', { auth: false })).status, 401);
});
test('writes without CSRF fail before persistence', async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (await request('/api/admin/links', { method: 'POST', xsrf: false, body: {} })).status,
    403,
  );
});
test('new link automatically detects Twitch and stores automatic color as null', async (t) => {
  const { request } = await fixture(t);
  const response = await request('/api/admin/links', {
    method: 'POST',
    body: { type: 'auto', url: 'https://twitch.tv/chris' },
  });
  assert.equal(response.status, 200);
  const link = await response.json();
  assert.equal(link.type, 'twitch');
  assert.equal(link.color, null);
});
test('unsafe link protocols are rejected', async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (await request('/api/admin/links', { method: 'POST', body: { url: 'javascript:alert(1)' } }))
      .status,
    400,
  );
});
test('private flag is a boolean; string false is rejected', async (t) => {
  const { request } = await fixture(t);
  const response = await request('/api/admin/files/file-id', {
    method: 'PATCH',
    body: { isPublic: false },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).isPublic, false);
  assert.equal(
    (await request('/api/admin/files/file-id', { method: 'PATCH', body: { isPublic: 'false' } }))
      .status,
    400,
  );
});
test('private files and raw data stay hidden from anonymous requests', async (t) => {
  const { request } = await fixture(t, {
    fileObject: { findUnique: async () => ({ id: 'one', key: 'private', isPublic: false }) },
  });
  assert.equal((await request('/api/files/private', { auth: false })).status, 404);
  assert.equal((await request('/f/private/raw', { auth: false })).status, 404);
});
test('raw file route supports HEAD and byte ranges', async (t) => {
  const { request, dir } = await fixture(t, {
    fileObject: {
      findUnique: async () => ({ key: 'example', isPublic: true, mimeType: 'text/plain' }),
    },
  });
  await fs.mkdir(path.join(dir, 'files'));
  await fs.writeFile(path.join(dir, 'files/example'), 'abcdef');
  const head = await request('/f/example/raw', { method: 'HEAD', auth: false });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const range = await request('/f/example/raw', { auth: false, headers: { Range: 'bytes=1-3' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), 'bcd');
});
test('file viewer HEAD does not increment views', async (t) => {
  let views = 0;
  const { request } = await fixture(t, {
    fileObject: {
      findUnique: async () => ({
        id: 'one',
        key: 'example',
        isPublic: true,
        mimeType: 'image/png',
      }),
      update: async () => {
        views++;
      },
    },
  });
  assert.equal((await request('/api/files/example', { method: 'HEAD' })).status, 200);
  assert.equal(views, 0);
  assert.equal((await request('/api/files/example')).status, 200);
  assert.equal(views, 1);
});
test('duplicate upload preserves the original bytes', async (t) => {
  const { storeFile } = await modules();
  const { db, dir } = await fixture(t);
  await fs.mkdir(path.join(dir, 'files'));
  await fs.writeFile(path.join(dir, 'files/example'), 'original');
  await assert.rejects(
    storeFile(
      db,
      dir,
      { size: 3, buffer: Buffer.from('new'), mimetype: 'text/plain', originalname: 'test.txt' },
      { key: 'example' },
    ),
    /belegt/,
  );
  assert.equal(await fs.readFile(path.join(dir, 'files/example'), 'utf8'), 'original');
});
test('parallel uploads cannot overwrite one another', async (t) => {
  const { storeFile } = await modules();
  const { db, dir } = await fixture(t);
  const file = {
    size: 3,
    buffer: Buffer.from('new'),
    mimetype: 'text/plain',
    originalname: 'test.txt',
  };
  const results = await Promise.allSettled([
    storeFile(db, dir, file, { key: 'example' }),
    storeFile(db, dir, file, { key: 'example' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await fs.readFile(path.join(dir, 'files/example'), 'utf8'), 'new');
});
test('failed DB insert removes only the new upload', async (t) => {
  const { storeFile } = await modules();
  const { db, dir } = await fixture(t);
  db.fileObject.create = async () => {
    throw Error('DB failure');
  };
  await assert.rejects(
    storeFile(
      db,
      dir,
      { size: 3, buffer: Buffer.from('new'), mimetype: 'text/plain', originalname: 'test.txt' },
      { key: 'example' },
    ),
    /DB failure/,
  );
  await assert.rejects(fs.access(path.join(dir, 'files/example')));
});
test('shortlink HEAD and previews never count or redirect', async (t) => {
  let claims = 0;
  const { request } = await fixture(t, {
    shortLink: {
      findUnique: async () => ({
        key: 'test',
        destinationUrl: 'https://example.com',
        maxViews: null,
      }),
      updateMany: async () => {
        claims++;
        return { count: 1 };
      },
    },
  });
  assert.equal((await request('/s/test', { method: 'HEAD' })).status, 200);
  assert.equal((await request('/s/test', { headers: { 'User-Agent': 'Discordbot' } })).status, 200);
  assert.equal(claims, 0);
});
test('maxViews=1 allows exactly the first visitor', async (t) => {
  let views = 0;
  const { request } = await fixture(t, {
    shortLink: {
      findUnique: async () => ({
        id: 'one',
        key: 'test',
        destinationUrl: 'https://example.com',
        maxViews: 1,
        countdownSeconds: 0,
        requireClick: false,
      }),
      updateMany: async () => ({ count: views++ === 0 ? 1 : 0 }),
    },
  });
  assert.equal((await request('/s/test')).status, 302);
  assert.equal((await request('/s/test')).status, 410);
});
test('signed countdown ticket protects the redirect endpoint', async (t) => {
  const { request } = await fixture(t, {
    shortLink: {
      findUnique: async () => ({
        id: 'one',
        key: 'test',
        destinationUrl: 'https://example.com',
        maxViews: null,
        countdownSeconds: 10,
        requireClick: true,
      }),
      updateMany: async () => ({ count: 1 }),
    },
  });
  const landing = await request('/s/test');
  assert.equal(landing.status, 302);
  const url = new URL(landing.headers.get('location'), 'http://localhost');
  const ticket = url.searchParams.get('ticket');
  const info = await request('/api/resolve/test?ticket=' + ticket);
  assert.equal(info.status, 200);
  assert.ok((await info.json()).seconds > 0);
  assert.equal(
    (await request('/api/resolve/test', { method: 'POST', body: { ticket } })).status,
    410,
  );
  assert.equal((await request('/api/resolve/test?ticket=invalid')).status, 410);
});
test('SEO metadata is emitted in the server HTML and escapes content', async (t) => {
  const { request } = await fixture(t, {
    portfolio: {
      findFirst: async () => ({
        title: '<script>bad</script>',
        subtitle: 'Developer',
        bannerUrl: 'https://example.com/banner.png',
      }),
    },
  });
  const response = await request('/');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes('property="og:image"'));
  assert.ok(html.includes('<app-root>'));
});
test('portfolio saves empty optional image URLs and keeps background settings', async (t) => {
  let saved;
  const { request } = await fixture(t, {
    portfolio: {
      findFirst: async () => ({ id: 'one' }),
      update: async ({ data }) => {
        saved = data;
        return data;
      },
    },
  });
  const response = await request('/api/admin/portfolio', {
    method: 'PUT',
    body: {
      title: 'Chris',
      subtitle: 'Developer',
      avatarUrl: '',
      bannerUrl: '',
      seoOgImageUrl: '',
      backgroundPreset: 'midnight',
      overlayOpacity: 0.55,
      blur: 18,
      vignette: 0.35,
      spotifyTrackId: '5PMCjcejj6Xzt4r24s0rt1',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(saved.avatarUrl, '');
  assert.equal(saved.backgroundSettings.blur, 18);
});
test('login checks password and TOTP before issuing the compatible session cookie', async (t) => {
  const bcrypt = require('bcrypt');
  const speakeasy = require('speakeasy');
  const { encrypt } = await modules();
  const totpSecret = speakeasy.generateSecret().base32;
  const user = {
    id: 'admin-id',
    passwordHash: await bcrypt.hash('test-password', 4),
    totpEnabled: true,
    totpSecretEnc: encrypt(totpSecret, secret),
  };
  let sessions = 0;
  const { request } = await fixture(t, {
    user: { findFirst: async () => user },
    session: {
      create: async () => {
        sessions++;
        return { id: 'new-session' };
      },
    },
  });
  assert.equal(
    (
      await request('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { password: 'wrong', totp: '000000' },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { password: 'test-password', totp: 'wrong' },
      })
    ).status,
    401,
  );
  assert.equal(sessions, 0);
  const response = await request('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: {
      password: 'test-password',
      totp: speakeasy.totp({ secret: totpSecret, encoding: 'base32' }),
    },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /cg_session=/);
  assert.equal(sessions, 1);
});
test('completed setup cannot create another user', async (t) => {
  const { request } = await fixture(t, {
    $transaction: async (action) =>
      action({ $executeRaw: async () => {}, user: { count: async () => 1 } }),
  });
  const response = await request('/api/auth/setup', {
    method: 'POST',
    auth: false,
    body: { password: 'test-password', enableTotp: false },
  });
  assert.equal(response.status, 409);
});
test('multipart API upload preserves the private flag and file bytes', async (t) => {
  const { request, dir } = await fixture(t);
  const body = new FormData();
  body.set('file', new File(['upload test'], 'example.txt', { type: 'text/plain' }));
  body.set('key', 'upload-test');
  body.set('isPublic', 'false');
  const response = await request('/api/admin/files', { method: 'POST', body });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.isPublic, false);
  assert.equal(await fs.readFile(path.join(dir, 'files/upload-test'), 'utf8'), 'upload test');
});
test('editing existing links updates every editable field and can restore automatic colors', async (t) => {
  let saved;
  const { request } = await fixture(t, {
    portfolioLink: {
      findUnique: async () => ({ id: 'existing-link' }),
      update: async ({ where, data }) => {
        saved = { where, data };
        return { id: where.id, ...data };
      },
    },
  });
  const response = await request('/api/admin/links/existing-link', {
    method: 'PUT',
    body: {
      type: 'auto',
      label: 'Mein Twitch',
      url: 'https://twitch.tv/chris',
      color: '',
      sortOrder: 4,
    },
  });
  assert.equal(response.status, 200);
  assert.equal(saved.where.id, 'existing-link');
  assert.equal(saved.data.type, 'twitch');
  assert.equal(saved.data.color, null);
  assert.equal(saved.data.sortOrder, 4);
  assert.equal(saved.data.label, 'Mein Twitch');
});
test('editing an unknown link returns 404', async (t) => {
  const { request } = await fixture(t, { portfolioLink: { findUnique: async () => null } });
  assert.equal(
    (
      await request('/api/admin/links/missing', {
        method: 'PUT',
        body: { url: 'https://example.com' },
      })
    ).status,
    404,
  );
});
test('link editing remains protected by authentication and XSRF', async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (
      await request('/api/admin/links/existing', {
        method: 'PUT',
        auth: false,
        body: { url: 'https://example.com' },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/api/admin/links/existing', {
        method: 'PUT',
        xsrf: false,
        body: { url: 'https://example.com' },
      })
    ).status,
    403,
  );
});
test('custom buttons, service content and autoplay preference persist together', async (t) => {
  let saved;
  const { request } = await fixture(t, {
    portfolio: {
      findFirst: async () => ({ id: 'one' }),
      update: async ({ data }) => {
        saved = data;
        return data;
      },
    },
  });
  const content = {
    buttons: [
      { label: 'Kontakt', url: 'https://example.com/contact' },
      { label: 'Leistungen', url: '#services' },
    ],
    servicesTitle: 'Meine Leistungen',
    services: ['Angular', 'Automatisierung'],
    spotifyAutoplay: true,
    showLinkText: true,
    motion: 'subtle',
  };
  const response = await request('/api/admin/portfolio', {
    method: 'PUT',
    body: { title: 'Chris', subtitle: 'Developer', content },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(saved.content, content);
});
test('unsafe button targets cannot be stored', async (t) => {
  const { request } = await fixture(t);
  for (const url of [
    'javascript:alert(1)',
    '//evil.example',
    '/\\evil.example',
    'data:text/html,test',
  ]) {
    assert.equal(
      (
        await request('/api/admin/portfolio', {
          method: 'PUT',
          body: {
            title: 'Chris',
            subtitle: 'Developer',
            content: {
              buttons: [{ label: 'Unsafe', url }],
              servicesTitle: '',
              services: [],
              spotifyAutoplay: false,
            },
          },
        })
      ).status,
      400,
    );
  }
});
test('legacy portfolios retain defaults while empty custom sections stay empty', async () => {
  const { profileContent } = await import('../shared/portfolio.ts');
  const defaults = profileContent({});
  assert.equal(defaults.buttons[0].label, 'Homepage');
  assert.equal(defaults.buttons[1].url, '#services');
  assert.equal(defaults.servicesTitle, 'Services');
  assert.equal(defaults.spotifyAutoplay, false);
  const empty = profileContent({ buttons: [], services: [], servicesTitle: '' });
  assert.deepEqual(empty.buttons, []);
  assert.deepEqual(empty.services, []);
  assert.equal(empty.servicesTitle, '');
});
test('appearance settings preserve all presets, effects and audio preferences', async (t) => {
  let saved;
  const { request } = await fixture(t, {
    portfolio: {
      findFirst: async () => ({ id: 'one' }),
      update: async ({ data }) => {
        saved = data;
        return data;
      },
    },
  });
  const { profileContent } = await import('../shared/portfolio.ts');
  const content = profileContent({});
  content.appearance = {
    animation: 'aurora',
    speed: 'slow',
    cursor: 'sparkles',
    accent: '#c084fc',
    mediaType: 'video',
    mediaUrl: '/f/background/raw',
  };
  content.audio = { url: '/f/music/raw', title: 'Mein Song', autoplay: true };
  const response = await request('/api/admin/portfolio', {
    method: 'PUT',
    body: { title: 'Chris', subtitle: 'Developer', backgroundPreset: 'crimson', content },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(saved.content, content);
  assert.equal(saved.backgroundPreset, 'crimson');
});
test('unsupported effects and unsafe media URLs are rejected', async (t) => {
  const { request } = await fixture(t);
  const { profileContent } = await import('../shared/portfolio.ts');
  for (const changes of [
    { cursor: 'bad-effect' },
    { animation: 'bad-animation' },
    { mediaUrl: 'javascript:alert(1)' },
    { mediaUrl: '//evil.example/file.mp4' },
    { accent: 'red' },
  ]) {
    const content = profileContent({});
    Object.assign(content.appearance, changes);
    assert.equal(
      (
        await request('/api/admin/portfolio', {
          method: 'PUT',
          body: { title: 'Chris', subtitle: 'Developer', content },
        })
      ).status,
      400,
    );
  }
});
test('shortlink landing info and bot metadata do not disclose the destination', async (t) => {
  const destination = 'https://private-destination.example/secret';
  const { request } = await fixture(t, {
    shortLink: {
      findUnique: async () => ({
        id: 'one',
        key: 'private',
        destinationUrl: destination,
        maxViews: null,
        countdownSeconds: 5,
        requireClick: true,
      }),
      updateMany: async () => ({ count: 1 }),
    },
  });
  const preview = await request('/s/private', { headers: { 'User-Agent': 'Discordbot' } });
  assert.ok(!(await preview.text()).includes('private-destination.example'));
  const landing = await request('/s/private');
  const ticket = new URL(landing.headers.get('location'), 'http://localhost').searchParams.get(
    'ticket',
  );
  const info = await request('/api/resolve/private?ticket=' + ticket);
  const json = await info.json();
  assert.equal(json.host, undefined);
  assert.equal(json.destinationUrl, undefined);
  assert.equal(json.requireClick, true);
});
test('audio uploads support full native playback including byte ranges', async (t) => {
  const { request, dir, db } = await fixture(t);
  const body = new FormData();
  body.set('file', new File(['test-audio-content'], 'song.mp3', { type: 'audio/mpeg' }));
  body.set('key', 'my-audio');
  body.set('isPublic', 'true');
  const response = await request('/api/admin/files', { method: 'POST', body });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mimeType, 'audio/mpeg');
  assert.equal(await fs.readFile(path.join(dir, 'files/my-audio'), 'utf8'), 'test-audio-content');
  db.fileObject.findUnique = async () => result;
  const range = await request('/f/my-audio/raw', { auth: false, headers: { Range: 'bytes=0-3' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), 'test');
  assert.match(range.headers.get('content-type'), /audio\/mpeg/);
});
test('new appearance options retain backward-compatible defaults', async () => {
  const { profileContent } = await import('../shared/portfolio.ts');
  const content = profileContent({ spotifyAutoplay: true });
  assert.equal(content.appearance.cursor, 'none');
  assert.equal(content.appearance.animation, 'none');
  assert.equal(content.audio.url, '');
  assert.equal(content.spotifyAutoplay, true);
});
test('Discord profile URLs preserve animated avatar and banner without exposing extra account fields', async () => {
  const { discordProfile } = await import('../apps/api/src/discord.mjs');
  const p = discordProfile({
    id: '123456789012345678',
    username: 'chris',
    global_name: 'Chris',
    avatar: 'a_avatarhash',
    banner: 'a_bannerhash',
    accent_color: 255,
    email: 'private@example.com',
  });
  assert.match(p.avatarUrl, /\/avatars\/123456789012345678\/a_avatarhash\.gif/);
  assert.match(p.bannerUrl, /\/banners\/123456789012345678\/a_bannerhash\.gif/);
  assert.equal(p.displayName, 'Chris');
  assert.equal(p.accentColor, '#0000ff');
  assert.equal(p.email, undefined);
});
test('Discord client caches requests and uses only server-side Bot authorization', async () => {
  const { createDiscordClient } = await import('../apps/api/src/discord.mjs');
  let calls = 0;
  const get = createDiscordClient('test-bot-token', async (url, options) => {
    calls++;
    assert.equal(url, 'https://discord.com/api/v10/users/123456789012345678');
    assert.equal(options.headers.Authorization, 'Bot test-bot-token');
    return {
      ok: true,
      json: async () => ({
        id: '123456789012345678',
        username: 'chris',
        avatar: null,
        banner: null,
      }),
    };
  });
  const results = await Promise.all([get('123456789012345678'), get('123456789012345678')]);
  await get('123456789012345678');
  assert.equal(calls, 1);
  assert.ok(results[0].avatarUrl.includes('/embed/avatars/'));
  assert.equal(results[0].bannerUrl, '');
});
test('Discord sync preserves manual values on API failure and respects selected fields', async () => {
  const { applyDiscordProfile } = await import('../apps/api/src/discord.mjs');
  const p = {
    title: 'Manual',
    avatarUrl: 'manual-avatar',
    bannerUrl: 'manual-banner',
    content: {
      discord: {
        userId: '123456789012345678',
        syncName: false,
        syncAvatar: true,
        syncBanner: true,
      },
    },
  };
  assert.deepEqual(
    await applyDiscordProfile(p, async () => {
      throw Error('offline');
    }),
    p,
  );
  const result = await applyDiscordProfile(p, async () => ({
    displayName: 'Discord',
    avatarUrl: 'discord-avatar',
    bannerUrl: 'discord-banner',
  }));
  assert.equal(result.title, 'Manual');
  assert.equal(result.avatarUrl, 'discord-avatar');
  assert.equal(result.bannerUrl, 'discord-banner');
});
test('Discord setup status is private and missing configuration returns an actionable error', async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/admin/discord', { auth: false })).status, 401);
  const response = await request('/api/admin/discord');
  assert.deepEqual(await response.json(), { configured: false });
  const profile = await request('/api/admin/discord/123456789012345678');
  assert.equal(profile.status, 503);
  assert.match((await profile.json()).error, /DISCORD_BOT_TOKEN/);
});
test('title effects and Discord selections persist and unsupported effects are rejected', async (t) => {
  let saved;
  const { request } = await fixture(t, {
    portfolio: {
      findFirst: async () => ({ id: 'one' }),
      update: async ({ data }) => {
        saved = data;
        return data;
      },
    },
  });
  const { profileContent } = await import('../shared/portfolio.ts');
  const content = profileContent({});
  content.titleEffect = 'shimmer';
  content.tabTitleEffect = 'scroll';
  content.discord = {
    userId: '123456789012345678',
    syncName: true,
    syncAvatar: true,
    syncBanner: true,
  };
  const response = await request('/api/admin/portfolio', {
    method: 'PUT',
    body: { title: 'Chris', subtitle: 'Developer', content },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(saved.content, content);
  content.titleEffect = 'unsupported';
  assert.equal(
    (
      await request('/api/admin/portfolio', {
        method: 'PUT',
        body: { title: 'Chris', subtitle: 'Developer', content },
      })
    ).status,
    400,
  );
});
test('animated tab title frames preserve Unicode and default titles', async () => {
  const { tabTitleFrame } = await import('../shared/titles.ts');
  assert.equal(tabTitleFrame('Chris', 'none', 100), 'Chris');
  assert.equal(tabTitleFrame('🚀Chris', 'typewriter', 0), '🚀');
  assert.ok(tabTitleFrame('Chris', 'scroll', 1).startsWith('hris'));
});

test('portfolio views count entry once per signed 30-minute cookie and skip bots', async (t) => {
  let viewsCount = 4;
  const { request } = await fixture(t, {
    portfolio: {
      findFirst: async () => ({ id: 'profile', viewsCount }),
      update: async ({ data }) => {
        assert.deepEqual(data, { viewsCount: { increment: 1 } });
        return { viewsCount: ++viewsCount };
      },
    },
  });
  const first = await request('/api/portfolio/view', { method: 'POST', auth: false });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { viewsCount: 5 });
  const cookie = first.headers.get('set-cookie').split(';')[0];
  assert.match(first.headers.get('set-cookie'), /HttpOnly/);
  assert.match(first.headers.get('set-cookie'), /Max-Age=1800/);
  const repeat = await request('/api/portfolio/view', {
    method: 'POST',
    auth: false,
    headers: { cookie: 'XSRF-TOKEN=' + csrf + '; ' + cookie },
  });
  assert.deepEqual(await repeat.json(), { viewsCount: 5 });
  const bot = await request('/api/portfolio/view', {
    method: 'POST',
    auth: false,
    headers: { 'user-agent': 'ExampleBot' },
  });
  assert.deepEqual(await bot.json(), { viewsCount: 5 });
  const forged = await request('/api/portfolio/view', {
    method: 'POST',
    auth: false,
    headers: { cookie: 'XSRF-TOKEN=' + csrf + '; cg_portfolio_view=forged' },
  });
  assert.deepEqual(await forged.json(), { viewsCount: 6 });
  const invalid = await request('/api/portfolio/view', {
    method: 'POST',
    auth: false,
    xsrf: false,
  });
  assert.equal(invalid.status, 403);
  assert.equal(viewsCount, 6);
});

test('custom content sections persist in order, reject unsafe buttons, and stay optional for legacy profiles', async (t) => {
  const { profileContent } = await import('../shared/portfolio.ts');
  assert.deepEqual(profileContent({}).sections, []);
  let saved;
  const { request } = await fixture(t, {
    portfolio: {
      findFirst: async () => ({ id: 'one' }),
      update: async ({ data }) => {
        saved = data;
        return data;
      },
    },
  });
  const content = profileContent({});
  content.sections = [
    {
      title: 'Über mich',
      text: 'Hallo\nWelt',
      items: ['Angular'],
      buttons: [{ label: 'Kontakt', url: 'https://example.com' }],
    },
    { title: 'Projekte', text: '', items: [], buttons: [] },
  ];
  assert.equal(
    (
      await request('/api/admin/portfolio', {
        method: 'PUT',
        body: { title: 'Chris', subtitle: 'Dev', content },
      })
    ).status,
    200,
  );
  assert.deepEqual(saved.content.sections, content.sections);
  content.sections[0].buttons[0].url = 'javascript:alert(1)';
  assert.equal(
    (
      await request('/api/admin/portfolio', {
        method: 'PUT',
        body: { title: 'Chris', subtitle: 'Dev', content },
      })
    ).status,
    400,
  );
  content.sections = Array.from({ length: 13 }, () => ({
    title: 'Test',
    text: '',
    items: [],
    buttons: [],
  }));
  assert.equal(
    (
      await request('/api/admin/portfolio', {
        method: 'PUT',
        body: { title: 'Chris', subtitle: 'Dev', content },
      })
    ).status,
    400,
  );
});
test('Discord badges use public flags only and can be synced without overwriting manual profile fields', async () => {
  const { discordBadges, discordProfile, applyDiscordProfile } =
    await import('../apps/api/src/discord.mjs');
  assert.deepEqual(
    discordBadges((1 << 6) | (1 << 9) | (1 << 4)).map((b) => b.id),
    ['bravery', 'early-supporter'],
  );
  assert.deepEqual(discordBadges(undefined), []);
  assert.deepEqual(discordBadges(-1), []);
  assert.deepEqual(
    discordProfile({ id: '123456789012345678', flags: 1 << 0, premium_type: 2 }).badges,
    [],
  );
  const portfolio = {
    title: 'Manual',
    content: {
      discord: {
        userId: '123456789012345678',
        syncName: false,
        syncAvatar: false,
        syncBanner: false,
        showBadges: true,
      },
    },
  };
  const badges = discordBadges(1 << 8);
  const result = await applyDiscordProfile(portfolio, async () => ({ badges }));
  assert.equal(result.title, 'Manual');
  assert.deepEqual(result.discordBadges, badges);
  portfolio.content.discord.showBadges = false;
  assert.equal(
    await applyDiscordProfile(portfolio, async () => {
      throw Error('must not fetch');
    }),
    portfolio,
  );
});

test('admin portfolio editor reads manual fallback values while public profile stays resolved', async (t) => {
  const manual = {
    id: 'profile',
    title: 'Manual fallback',
    avatarUrl: 'https://example.com/avatar.png',
    links: [],
    content: {
      discord: {
        userId: '123456789012345678',
        syncName: false,
        syncAvatar: false,
        syncBanner: false,
        showBadges: false,
      },
    },
  };
  const { request } = await fixture(t, { portfolio: { findFirst: async () => manual } });
  assert.equal((await request('/api/admin/portfolio', { auth: false })).status, 401);
  assert.deepEqual(await (await request('/api/admin/portfolio')).json(), manual);
  assert.deepEqual(await (await request('/api/portfolio', { auth: false })).json(), manual);
});
test('stale record edits return a helpful 404 instead of a server error', async (t) => {
  const { request } = await fixture(t, {
    fileObject: {
      update: async () => {
        throw Object.assign(Error('record missing'), { code: 'P2025' });
      },
    },
  });
  const response = await request('/api/admin/files/stale', {
    method: 'PATCH',
    body: { isPublic: false },
  });
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /neu laden/);
});
test('production config rejects placeholder secrets and prefers PUBLIC_BASE_URL', async () => {
  const { getConfig } = await import('../apps/api/src/config.mjs');
  const keys = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'NODE_ENV',
    'PUBLIC_BASE_URL',
    'NEXT_PUBLIC_BASE_URL',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://test@localhost/test',
      NODE_ENV: 'production',
      SESSION_SECRET: 'change-me-please-change-me-please-change-me',
      PUBLIC_BASE_URL: 'https://new.example',
      NEXT_PUBLIC_BASE_URL: 'https://old.example',
    });
    assert.throws(() => getConfig(), /Platzhalter/);
    process.env.SESSION_SECRET = 'test-only-random-value-for-production-config';
    assert.equal(getConfig().baseUrl, 'https://new.example');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('audit logs mask paths, keep bodies and tokens out of Discord, and bound local history', async () => {
  const { createAuditLog, safeLogPath } = await import('../apps/api/src/audit.mjs');
  assert.equal(safeLogPath('/go/secret-key?ticket=secret'), '/go/[key]');
  assert.equal(safeLogPath('/api/admin/files/private-id'), '/api/admin/files/[id]');
  assert.equal(safeLogPath('/api/admin/security/arbitrary-secret'), '[andere Route]');
  let payload;
  const audit = createAuditLog({
    token: 'test-token',
    channelId: '123456789012345678',
    delay: 60000,
    fetcher: async (url, options) => {
      assert.equal(url, 'https://discord.com/api/v10/channels/123456789012345678/messages');
      payload = JSON.parse(options.body);
      return { ok: true, status: 200 };
    },
  });
  audit.record('login.failed', {
    path: '/api/auth/login?password=never-send',
    method: 'POST',
    status: 401,
    password: 'never-send',
  });
  await audit.flush();
  assert.ok(audit.snapshot().lastSentAt);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.ok(!JSON.stringify(payload).includes('never-send'));
  assert.ok(!JSON.stringify(audit.snapshot()).includes('test-token'));
  for (let i = 0; i < 250; i++) audit.record('page.view', { path: '/' });
  assert.equal(audit.snapshot().events.length, 100);
  assert.ok(audit.snapshot().queued <= 200);
  assert.equal(audit.snapshot().dropped, 50);
  audit.close();
});
test('Discord log delivery retains events on rate limit and surfaces missing channel permissions', async () => {
  const { createAuditLog } = await import('../apps/api/src/audit.mjs');
  let status = 429;
  const audit = createAuditLog({
    token: 'test',
    channelId: '123456789012345678',
    delay: 60000,
    fetcher: async () => ({ ok: status === 200, status, json: async () => ({ retry_after: 20 }) }),
  });
  audit.record('system.test');
  await audit.flush();
  assert.equal(audit.snapshot().queued, 1);
  assert.match(audit.snapshot().lastError, /Rate-Limit/);
  status = 403;
  await audit.flush();
  assert.match(audit.snapshot().lastError, /Schreibrechte/);
  assert.equal(audit.snapshot().queued, 1);
  status = 200;
  await audit.flush();
  assert.equal(audit.snapshot().queued, 0);
  assert.equal(audit.snapshot().lastError, '');
  audit.close();
});
test('audit endpoints are private and client events require CSRF and a permitted path', async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/admin/logs', { auth: false })).status, 401);
  assert.equal(
    (
      await request('/api/events/page', {
        method: 'POST',
        auth: false,
        xsrf: false,
        body: { path: '/' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/events/page', {
        method: 'POST',
        auth: false,
        body: { path: '/private?token=secret' },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/api/events/page', { method: 'POST', auth: false, body: { path: '/' } }))
      .status,
    200,
  );
  assert.equal(
    (await request('/api/events/error', { method: 'POST', auth: false, body: { path: '/' } }))
      .status,
    200,
  );
  const logs = await (await request('/api/admin/logs')).json();
  assert.ok(logs.events.some((e) => e.type === 'page.view'));
  assert.ok(logs.events.some((e) => e.type === 'client.error'));
  assert.equal(logs.configured, false);
});
test('particle background modes and density persist and unsupported modes fail validation', async (t) => {
  const { profileContent } = await import('../shared/portfolio.ts');
  let saved;
  const { request } = await fixture(t, {
    portfolio: {
      findFirst: async () => ({ id: 'one' }),
      update: async ({ data }) => {
        saved = data;
        return data;
      },
    },
  });
  for (const animation of [
    'particles',
    'constellation',
    'bubbles',
    'embers',
    'meteors',
    'waves',
    'matrix',
  ]) {
    const content = profileContent({});
    Object.assign(content.appearance, { animation, density: 'high', interactive: false });
    assert.equal(
      (
        await request('/api/admin/portfolio', {
          method: 'PUT',
          body: { title: 'Chris', subtitle: 'Dev', content },
        })
      ).status,
      200,
    );
    assert.equal(saved.content.appearance.animation, animation);
    assert.equal(saved.content.appearance.density, 'high');
    assert.equal(saved.content.appearance.interactive, false);
  }
  const content = profileContent({});
  content.appearance.density = 'extreme';
  assert.equal(
    (
      await request('/api/admin/portfolio', {
        method: 'PUT',
        body: { title: 'Chris', subtitle: 'Dev', content },
      })
    ).status,
    400,
  );
});

test('viewport motion follows the full window and scales with viewport dimensions', async () => {
  const { viewportMotion } = await import('../shared/motion.ts');
  const center = viewportMotion(720, 450, 1440, 900, 'card', 'lively');
  assert.equal(center['--move-x'], '0px');
  assert.equal(center['--move-y'], '0px');
  assert.equal(center['--pointer-x'], '50%');
  const corner = viewportMotion(0, 0, 1440, 900, 'card', 'lively');
  assert.equal(corner['--tilt-y'], '-13deg');
  assert.equal(corner['--tilt-x'], '10deg');
  assert.ok(parseFloat(corner['--move-x']) < 0);
  const opposite = viewportMotion(1440, 900, 1440, 900, 'card', 'lively');
  assert.equal(opposite['--tilt-y'], '13deg');
  assert.equal(opposite['--tilt-x'], '-10deg');
  assert.equal(viewportMotion(99999, -50, 1440, 900, 'entry', 'lively')['--pointer-x'], '100%');
  const smaller = viewportMotion(800, 600, 800, 600, 'entry', 'lively');
  assert.ok(Math.abs(parseFloat(smaller['--move-x']) - 28) < 0.001);
  const subtle = viewportMotion(1440, 900, 1440, 900, 'card', 'subtle');
  assert.equal(parseFloat(subtle['--tilt-y']), 5.2);
  assert.equal(viewportMotion(1440, 900, 1440, 900, 'card', 'none')['--move-x'], '0px');
  for (const value of Object.values(viewportMotion(0, 0, 0, 0, 'entry', 'lively'))) {
    assert.ok(!value.includes('NaN') && !value.includes('Infinity'));
  }
});

test('visitor context detects browsers, operating systems, devices and normalizes page and IP', async () => {
  const { requestLogContext, userAgentDetails } = await import('../apps/api/src/audit-context.mjs');
  const chrome =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';
  assert.deepEqual(userAgentDetails(chrome), {
    browser: 'Chrome 130.0.0.0',
    os: 'Windows 10/11',
    device: 'Desktop/Laptop',
  });
  assert.equal(userAgentDetails(chrome + ' Edg/130.0.1.0').browser, 'Edge 130.0.1.0');
  assert.equal(
    userAgentDetails(
      'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit Chrome/130.0.0.0 Safari/537.36',
    ).device,
    'Tablet',
  );
  assert.equal(
    userAgentDetails(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1',
    ).os,
    'iOS/iPadOS 18.0',
  );
  assert.equal(userAgentDetails('ExampleBot/1.0').device, 'Bot/Crawler');
  const context = requestLogContext({
    ip: '::ffff:203.0.113.12',
    path: '/api/auth/login',
    get: (name) =>
      name === 'user-agent'
        ? chrome
        : name === 'referer'
          ? 'https://example.com/login?token=secret'
          : undefined,
  });
  assert.equal(context.ip, '203.0.113.12');
  assert.equal(context.page, '/login');
  assert.ok(!JSON.stringify(context).includes('secret'));
  assert.equal(
    requestLogContext({ ip: 'spoofed', path: '/api/admin/files/id', get: () => undefined }).ip,
    'Unbekannt',
  );
});
test('Discord logs include native timestamps and visitor context without exceeding message limits', async () => {
  const { createAuditLog, discordLogMessage } = await import('../apps/api/src/audit.mjs');
  const messages = [];
  const audit = createAuditLog({
    token: 'test',
    channelId: '123456789012345678',
    delay: 60000,
    fetcher: async (_url, options) => {
      messages.push(JSON.parse(options.body));
      return { ok: true, status: 200 };
    },
  });
  for (let i = 0; i < 12; i++)
    audit.record('page.view', {
      path: '/admin/portfolio',
      page: '/admin/portfolio',
      ip: '2001:db8::1',
      browser: 'Chrome ' + '1'.repeat(70),
      os: 'Windows 10/11',
      device: 'Desktop/Laptop',
    });
  while (audit.snapshot().queued) await audit.flush();
  assert.ok(messages.length > 1);
  for (const message of messages) {
    assert.ok(message.content.length <= 2000);
    assert.match(message.content, /<t:\d+:F>/);
    assert.match(message.content, /<t:\d+:R>/);
    assert.match(message.content, /2001:db8::1/);
    assert.match(message.content, /Seite:\*\* \/admin\/portfolio/);
    assert.deepEqual(message.allowed_mentions, { parse: [] });
  }
  assert.match(
    discordLogMessage({ ...audit.snapshot().events[0], time: '2026-10-24T12:00:00Z' }),
    new RegExp('<t:' + Math.floor(Date.parse('2026-10-24T12:00:00Z') / 1000) + ':F>'),
  );
  audit.close();
});
test('page and failed-login logs capture request metadata instead of body-supplied visitor details', async (t) => {
  const { request } = await fixture(t);
  const headers = {
    'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0 Mobile Safari/537.36',
    'x-forwarded-for': '203.0.113.20',
  };
  const response = await request('/api/events/page', {
    method: 'POST',
    auth: false,
    headers,
    body: { path: '/admin/portfolio', ip: '198.51.100.99', browser: 'Fake Browser' },
  });
  assert.equal(response.status, 200);
  await request('/api/auth/login', {
    method: 'POST',
    auth: false,
    headers: { ...headers, referer: 'http://localhost:3000/login?token=hidden' },
    body: { password: '' },
  });
  const logs = await (await request('/api/admin/logs')).json();
  const visit = logs.events.find((e) => e.type === 'page.view');
  assert.equal(visit.page, '/admin/portfolio');
  assert.equal(visit.ip, '203.0.113.20');
  assert.equal(visit.browser, 'Chrome 130.0.0.0');
  assert.equal(visit.device, 'Smartphone');
  const failed = logs.events.find((e) => e.type === 'login.failed');
  assert.equal(failed.page, '/login');
  assert.equal(failed.ip, '203.0.113.20');
  assert.ok(!JSON.stringify(logs).includes('hidden'));
});

test('untrusted forwarded IPs are ignored when proxy trust is disabled', async (t) => {
  const { request } = await fixture(t, {}, { trustProxy: false });
  await request('/api/events/page', {
    method: 'POST',
    auth: false,
    headers: { 'x-forwarded-for': '203.0.113.20' },
    body: { path: '/' },
  });
  const logs = await (await request('/api/admin/logs')).json();
  assert.equal(logs.events.find((e) => e.type === 'page.view').ip, '127.0.0.1');
});

test('Discord failures distinguish DNS, timeout, TLS, token rejection and invalid responses without disclosing secrets', async () => {
  const { createDiscordClient } = await import('../apps/api/src/discord.mjs');
  const id = '123456789012345678';
  for (const [error, code] of [
    [
      Object.assign(Error('private network details'), { cause: { code: 'EAI_AGAIN' } }),
      'DISCORD_DNS_FAILED',
    ],
    [Object.assign(Error('private network details'), { name: 'TimeoutError' }), 'DISCORD_TIMEOUT'],
    [
      Object.assign(Error('private network details'), { cause: { code: 'CERT_HAS_EXPIRED' } }),
      'DISCORD_TLS_FAILED',
    ],
    [
      Object.assign(Error('private network details'), {
        cause: { errors: [{ code: 'ENETUNREACH' }, { code: 'ETIMEDOUT' }] },
      }),
      'DISCORD_TIMEOUT',
    ],
  ]) {
    const get = createDiscordClient('test-token', async () => {
      throw error;
    });
    await assert.rejects(
      get(id),
      (e) => e.code === code && e.status === 503 && !e.message.includes('private'),
    );
  }
  const rejected = createDiscordClient('test-token', async () => ({ ok: false, status: 401 }));
  await assert.rejects(
    rejected(id),
    (e) =>
      e.code === 'DISCORD_HTTP_401' &&
      e.upstreamStatus === 401 &&
      !e.message.includes('test-token'),
  );
  const malformed = createDiscordClient('test-token', async () => ({
    ok: true,
    json: async () => {
      throw Error('secret body');
    },
  }));
  await assert.rejects(
    malformed(id),
    (e) => e.code === 'DISCORD_INVALID_RESPONSE' && !e.message.includes('secret'),
  );
  const normalized = createDiscordClient('  test-token\n', async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bot test-token');
    return { ok: true, json: async () => ({ id, username: 'Test' }) };
  });
  assert.equal((await normalized(id)).userId, id);
});
