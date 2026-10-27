import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const allowedMime = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'text/plain',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
]);
export function filePath(dataDir, key) {
  if (!/^[\w-]{3,64}$/.test(key))
    throw Object.assign(Error('Ungültiger Datei-Key.'), { status: 400 });
  return path.join(dataDir, 'files', key);
}
export async function storeFile(db, dataDir, file, input) {
  if (!file?.size) throw Object.assign(Error('Keine oder leere Datei.'), { status: 400 });
  if (!allowedMime.has(file.mimetype))
    throw Object.assign(Error('Dateityp nicht erlaubt.'), { status: 400 });
  const key = input.key?.trim() || crypto.randomBytes(8).toString('hex');
  const dest = filePath(dataDir, key);
  if (await db.fileObject.findUnique({ where: { key } }))
    throw Object.assign(Error('Key ist bereits belegt.'), { status: 409 });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  let handle;
  try {
    handle = await fs.open(dest, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST')
      throw Object.assign(Error('Key ist bereits belegt.'), { status: 409 });
    throw error;
  }
  try {
    try {
      await handle.writeFile(file.buffer);
    } finally {
      await handle.close();
    }
    return await db.fileObject.create({
      data: {
        key,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: dest,
        isPublic: input.isPublic !== 'false' && input.isPublic !== false,
      },
    });
  } catch (error) {
    await fs.unlink(dest).catch(() => {});
    throw error;
  }
}
