import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

// Do not launch half a stack when an earlier dev server still owns a port.
async function available(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
try {
  for (const port of [3000, Number(process.env.PORT || 3001)]) await available(port);
} catch (error) {
  console.error(
    error.code === 'EADDRINUSE'
      ? 'Ein benötigter Port (3000 oder API-Port) ist bereits belegt. Den laufenden Devserver verwenden oder zuerst mit Strg+C beenden.'
      : 'Die Entwicklungsports konnten nicht geöffnet werden: ' + error.message,
  );
  process.exit(1);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32')
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 400);
}
for (const [entry, args, cwd] of [
  ['apps/api/src/server.mjs', ['--watch'], root],
  ['node_modules/@angular/cli/bin/ng.js', [], path.join(root, 'apps/web')],
]) {
  const cliArgs = entry.includes('/cli/') ? ['serve', '--host', '127.0.0.1', '--port', '3000'] : [];
  const child = spawn(process.execPath, [...args, path.join(root, entry), ...cliArgs], {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);
  child.on('exit', (code) => stop(code ?? 1));
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
