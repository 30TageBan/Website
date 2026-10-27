import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export function encrypt(plain, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    crypto.createHash('sha256').update(secret).digest(),
    iv,
  );
  const text = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), text]).toString('base64url');
}
export function decrypt(text, secret) {
  const bytes = Buffer.from(text, 'base64url');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    crypto.createHash('sha256').update(secret).digest(),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
export function equal(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export const verifyTotp = (token, secret) =>
  typeof token === 'string' &&
  speakeasy.totp.verify({ secret, encoding: 'base32', token: token.replace(/\s/g, ''), window: 1 });
export async function provisioning() {
  const secret = speakeasy.generateSecret({ name: 'chris-g.dev:admin', issuer: 'chris-g.dev' });
  return {
    base32: secret.base32,
    otpauthUrl: secret.otpauth_url,
    qrDataUrl: await QRCode.toDataURL(secret.otpauth_url),
  };
}
export async function sign(payload, secret, expires = '30d') {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(expires)
    .sign(new TextEncoder().encode(secret));
}
export async function verify(token, secret) {
  try {
    return (await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] }))
      .payload;
  } catch {
    return null;
  }
}
export async function userId(req, db, config) {
  const payload = await verify(req.cookies?.cg_session, config.secret);
  if (!payload?.sid || typeof payload.sid !== 'string') return null;
  const session = await db.session.findUnique({ where: { id: payload.sid } });
  return session && session.expiresAt > new Date() ? session.userId : null;
}
export async function createSession(res, id, db, config) {
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  const session = await db.session.create({ data: { userId: id, expiresAt } });
  res.cookie('cg_session', await sign({ sid: session.id }, config.secret), {
    httpOnly: true,
    secure: config.production,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}
