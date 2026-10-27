// Only public user flags; private/internal account flags never create a badge.
const PUBLIC_BADGES = [
  [0, 'staff', 'Discord-Mitarbeiter', '✦', '#5865f2'],
  [1, 'partner', 'Discord-Partner', '∞', '#5865f2'],
  [2, 'hypesquad', 'HypeSquad Events', '✧', '#fbb848'],
  [3, 'bug-hunter', 'Bug Hunter', '⌘', '#58c98b'],
  [6, 'bravery', 'HypeSquad Bravery', '◆', '#9c84ef'],
  [7, 'brilliance', 'HypeSquad Brilliance', '✧', '#ef9a85'],
  [8, 'balance', 'HypeSquad Balance', '◇', '#67c4b5'],
  [9, 'early-supporter', 'Early Supporter', '♥', '#ee8ad7'],
  [14, 'bug-hunter-gold', 'Bug Hunter Gold', '⌘', '#f7cf68'],
  [16, 'verified-bot', 'Verifizierter Bot', '✓', '#7d9bf5'],
  [17, 'early-developer', 'Early Verified Bot Developer', '⚒', '#7d9bf5'],
  [18, 'moderator', 'Moderator Programs Alumni', '❖', '#61c7e1'],
];
export function discordBadges(flags) {
  if (!Number.isSafeInteger(flags) || flags < 0) return [];
  return PUBLIC_BADGES.filter(([bit]) => (BigInt(flags) & (1n << BigInt(bit))) !== 0n).map(
    ([, id, label, symbol, color]) => ({ id, label, symbol, color }),
  );
}
export function discordProfile(user) {
  if (!user || !/^\d{17,20}$/.test(user.id)) throw Error('Ungültige Discord-Antwort.');
  const asset = (folder, hash, size) =>
    hash && /^[a-zA-Z0-9_]+$/.test(hash)
      ? `https://cdn.discordapp.com/${folder}/${user.id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=${size}`
      : '';
  const fallback =
    Number(user.discriminator) > 0
      ? Number(user.discriminator) % 5
      : Number((BigInt(user.id) >> 22n) % 6n);
  return {
    badges: discordBadges(user.public_flags),
    userId: user.id,
    displayName: user.global_name || user.username || 'Discord',
    username: user.username || '',
    avatarUrl:
      asset('avatars', user.avatar, 256) ||
      `https://cdn.discordapp.com/embed/avatars/${fallback}.png`,
    bannerUrl: asset('banners', user.banner, 1024),
    accentColor:
      Number.isInteger(user.accent_color) && user.accent_color >= 0 && user.accent_color <= 0xffffff
        ? '#' + user.accent_color.toString(16).padStart(6, '0')
        : null,
  };
}

/** Return only known diagnostic codes; never surface network messages or request headers. */
export function discordConnectionError(error) {
  const causes = [error, error?.cause, ...(error?.cause?.errors || [])];
  const codes = causes.map((item) => item?.code).filter((code) => typeof code === 'string');
  let code = 'DISCORD_CONNECTION_FAILED';
  let message =
    'Der Server kann Discord nicht erreichen. Ausgehende HTTPS-Verbindung und Container-Netzwerk prüfen.';
  if (codes.some((code) => ['ENOTFOUND', 'EAI_AGAIN'].includes(code))) {
    code = 'DISCORD_DNS_FAILED';
    message =
      'Der Server kann discord.com nicht auflösen. DNS-Konfiguration des Containers prüfen.';
  } else if (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    codes.some((code) =>
      ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code),
    )
  ) {
    code = 'DISCORD_TIMEOUT';
    message =
      'Die Verbindung vom Server zu Discord hat das Zeitlimit überschritten. Routing, Firewall und IPv4/IPv6 prüfen.';
  } else if (
    codes.some(
      (code) =>
        /^(CERT_|ERR_TLS_)/.test(code) ||
        [
          'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
          'DEPTH_ZERO_SELF_SIGNED_CERT',
          'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
        ].includes(code),
    )
  ) {
    code = 'DISCORD_TLS_FAILED';
    message =
      'Der Server kann das TLS-Zertifikat von Discord nicht prüfen. Zertifikatsspeicher und Serverzeit prüfen.';
  }
  return Object.assign(Error(message), { status: 503, code });
}

export function createDiscordClient(token, fetcher = fetch) {
  token = typeof token === 'string' ? token.trim() : '';
  const cache = new Map();
  const pending = new Map();
  return async function getProfile(id) {
    if (!/^\d{17,20}$/.test(id))
      throw Object.assign(Error('Eine gültige Discord-Benutzer-ID eingeben.'), { status: 400 });
    if (!token)
      throw Object.assign(
        Error(
          'Discord ist noch nicht eingerichtet. DISCORD_BOT_TOKEN auf dem Server setzen und die API neu starten.',
        ),
        { status: 503 },
      );
    const cached = cache.get(id);
    if (cached && cached.until > Date.now()) {
      if (cached.error) throw cached.error;
      return cached.profile;
    }
    if (pending.has(id)) return pending.get(id);
    const request = (async () => {
      let response;
      try {
        response = await fetcher(`https://discord.com/api/v10/users/${id}`, {
          headers: { Authorization: `Bot ${token}` },
          signal: AbortSignal.timeout(8000),
        });
      } catch (error) {
        throw discordConnectionError(error);
      }
      if (!response.ok) {
        const messages = {
          401: 'Discord lehnt den Bot-Token ab (HTTP 401). Den tatsächlich im App-Container gesetzten DISCORD_BOT_TOKEN prüfen.',
          403: 'Discord verweigert die Profilanfrage (HTTP 403). Bot-Zugriff und mögliche Sperre der Server-IP prüfen.',
          404: 'Discord-Benutzer nicht gefunden.',
          429: 'Discord begrenzt gerade die Anfragen (HTTP 429). Bitte später erneut versuchen.',
        };
        throw Object.assign(
          Error(
            messages[response.status] ||
              'Discord antwortet mit HTTP ' + response.status + '. Bitte später erneut versuchen.',
          ),
          {
            status: response.status === 404 ? 404 : 503,
            code: 'DISCORD_HTTP_' + response.status,
            upstreamStatus: response.status,
          },
        );
      }
      let profile;
      try {
        profile = discordProfile(await response.json());
      } catch {
        throw Object.assign(Error('Discord hat keine gültigen Profildaten geliefert.'), {
          status: 503,
          code: 'DISCORD_INVALID_RESPONSE',
        });
      }
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(id, { profile, until: Date.now() + 5 * 60000 });
      return profile;
    })();
    pending.set(id, request);
    try {
      return await request;
    } catch (error) {
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(id, { error, until: Date.now() + 30000 });
      throw error;
    } finally {
      pending.delete(id);
    }
  };
}

export async function applyDiscordProfile(portfolio, getProfile) {
  const settings = portfolio?.content?.discord;
  if (
    !portfolio ||
    !settings?.userId ||
    !(
      settings.syncAvatar ||
      settings.syncBanner ||
      settings.syncName ||
      settings.showBadges !== false
    )
  )
    return portfolio;
  try {
    const profile = await getProfile(settings.userId);
    return {
      ...portfolio,
      ...(settings.showBadges !== false ? { discordBadges: profile.badges || [] } : {}),
      ...(settings.syncAvatar ? { avatarUrl: profile.avatarUrl } : {}),
      ...(settings.syncBanner
        ? { bannerUrl: profile.bannerUrl, discordAccentColor: profile.accentColor }
        : {}),
      ...(settings.syncName ? { title: profile.displayName } : {}),
    };
  } catch {
    return portfolio;
  }
}
