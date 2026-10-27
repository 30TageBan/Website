import { getConfig } from './config.mjs';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.mjs';

const config = getConfig();
const db = new PrismaClient();
const port = Number(process.env.PORT || (config.production ? 3000 : 3001));
const app = createApp({ db, config });
const server = app.listen(port, config.production ? '0.0.0.0' : '127.0.0.1', () =>
  console.log(`API: http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    app.locals.audit.close();
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    });
  });
