#!/usr/bin/env node
/**
 * Tiny supervisor used for the "restart the worker while a workflow is running" demo.
 *
 * The worker process exits with code 17 when the UI (or `POST /admin/restart`) asks for a
 * restart; this supervisor then respawns it. Temporal replays the workflow history on the new
 * worker, so running claims continue exactly where they left off.
 */
import { spawn } from 'node:child_process';

const RESTART_EXIT_CODE = 17;
const prod = process.argv.includes('--prod');
const command = prod ? 'node' : 'ts-node';
const args = prod ? ['dist/main.js'] : ['--transpile-only', 'src/main.ts'];

let child = null;
let shuttingDown = false;
let generation = 0;

function start() {
  generation += 1;
  child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, WORKER_GENERATION: String(generation) },
    shell: process.platform === 'win32',
  });

  child.on('exit', (code, signal) => {
    child = null;
    if (shuttingDown) {
      process.exit(code ?? 0);
    }
    if (code === RESTART_EXIT_CODE) {
      console.log(
        `[supervisor] worker requested a restart — respawning (generation ${generation + 1})`,
      );
      setTimeout(start, 300);
      return;
    }
    console.log(`[supervisor] worker exited (code=${code} signal=${signal}) — stopping supervisor`);
    process.exit(code ?? 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
    if (child) {
      child.kill(signal);
    } else {
      process.exit(0);
    }
  });
}

start();
