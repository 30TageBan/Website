import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
// Bestehende lokale Konfiguration bleibt nach der Next.js-Migration nutzbar.
dotenv.config({ path: path.join(root, 'apps/web/.env.local'), quiet: true });
dotenv.config({ path: path.join(root, 'packages/db/.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env'), quiet: true });

export function getConfig() {
  if (!process.env.DATABASE_URL)
    throw Error('DATABASE_URL fehlt. Lokale Datenbankkonfiguration prüfen.');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw Error('SESSION_SECRET muss mindestens 32 Zeichen haben.');
  if (
    process.env.NODE_ENV === 'production' &&
    /change-me|replace[-_ ]?me|your[-_ ]?secret/i.test(process.env.SESSION_SECRET)
  )
    throw Error(
      'SESSION_SECRET enthält einen unsicheren Platzhalter. Ein dauerhaftes zufälliges Secret konfigurieren.',
    );
  return {
    secret: process.env.SESSION_SECRET,
    trustProxy:
      process.env.TRUST_PROXY === 'false'
        ? false
        : /^\d+$/.test(process.env.TRUST_PROXY || '')
          ? Number(process.env.TRUST_PROXY)
          : process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? 1 : 'loopback'),
    discordLogChannelId: process.env.DISCORD_LOG_CHANNEL_ID || '',
    discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
    dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')),
    production: process.env.NODE_ENV === 'production',
    frontendDir: path.join(root, 'apps/web/dist/website/browser'),
    baseUrl:
      process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  };
}
