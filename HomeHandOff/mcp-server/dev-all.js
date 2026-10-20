import { spawn } from 'node:child_process';
import net from 'node:net';

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)));
  });
}
async function choosePort(start) {
  for (let port = start; port < start + 30; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in ${start}-${start + 29}`);
}

const apiPort = Number(process.env.HH_API_PORT || await choosePort(3001));
const frontendPort = Number(process.env.HH_VITE_PORT || await choosePort(5173));
const childEnv = { ...process.env, HH_API_PORT: String(apiPort), HH_VITE_PORT: String(frontendPort) };
console.log(`Starting HomeHandoff services on API port ${apiPort} and frontend port ${frontendPort}.`);
const children = [
  spawn(process.execPath, ['mcp-server/http.js'], { stdio: 'inherit', env: childEnv }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env: childEnv }),
];
for (const child of children) {
  child.on('error', (error) => { console.error('Could not start a HomeHandoff service:', error.message); stop(1); });
  child.on('exit', (code) => { if (code && code !== 0) { process.exitCode = code; stop(code); } });
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 700).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
