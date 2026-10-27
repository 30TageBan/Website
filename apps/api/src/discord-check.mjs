/** Run inside the deployed app container: node apps/api/src/discord-check.mjs */
import dns from 'node:dns/promises';

const rawToken = process.env.DISCORD_BOT_TOKEN || '';
const token = rawToken.trim();
console.log('Token gesetzt:', Boolean(token));
console.log('Rand-Leerzeichen:', rawToken !== token);
console.log('Unerwartetes Bot-Praefix:', /^Bot\s/i.test(token));
try {
  const addresses = await dns.lookup('discord.com', { all: true });
  console.log('DNS erreichbar:', addresses.map(({ family }) => 'IPv' + family).join(', '));
} catch (error) {
  console.log('DNS-Fehler:', error.code || error.name);
}
if (token) {
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: 'Bot ' + token },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Discord HTTP:', response.status);
    if (response.status === 200) console.log('Bot-Authentifizierung erfolgreich.');
  } catch (error) {
    console.log('Verbindungsfehler:', error.name);
    const codes = [
      error.code,
      error.cause?.code,
      ...(error.cause?.errors || []).map((item) => item.code),
    ].filter(Boolean);
    console.log('Diagnosecodes:', [...new Set(codes)].join(', ') || 'unbekannt');
  }
}
