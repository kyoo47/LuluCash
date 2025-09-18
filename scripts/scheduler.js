/**
 * scripts/scheduler.js
 * Runs the capture -> OCR-crop pipeline automatically at:
 *   - minute 11 of each hour 10-21 (10:11, 11:11, ..., 21:11)
 *   - minute 41 of each hour 10-21 (10:41, 11:41, ..., 21:41)
 * Timezone: America/New_York
 *
 * It sequentially runs:
 *   node scripts/capture-and-post.js
 *   node scripts/crop-and-ocr.js
 *
 * Use:
 *   node scripts/scheduler.js --once       # run one pipeline now and exit
 *   node scripts/scheduler.js --once --debug
 */

const cron = require('node-cron');
const { spawn } = require('child_process');

const TZ = 'America/New_York';

const ARGV = new Set(process.argv.slice(2));
const DEBUG = ARGV.has('--debug');

function run(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cmd, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { process.stdout.write(d); out += d.toString(); });
    p.stderr.on('data', (d) => { process.stderr.write(d); err += d.toString(); });

    p.on('close', (code) => {
      if (code === 0) return resolve({ out, err });
      reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function runPipeline() {
  const start = new Date().toISOString();
  console.log(`\n=== PIPELINE START ${start} ===`);
  try {
    console.log('? Step 1: capture-and-post');
    await run('scripts/capture-and-post.js', DEBUG ? ['--debug'] : []);

    console.log('? Step 2: crop-and-ocr');
    await run('scripts/crop-and-ocr.js', DEBUG ? ['--debug'] : []);

    console.log(`? Pipeline OK (${new Date().toISOString()})`);
  } catch (e) {
    console.error('? Pipeline error:', e && e.message ? e.message : e);
  } finally {
    console.log(`=== PIPELINE END   ${new Date().toISOString()} ===\n`);
  }
}

// Schedules (NY time)
// Minute 11 of 10-21 hours each day
cron.schedule('11 10-21 * * *', runPipeline, { timezone: TZ });
// Minute 41 of 10-21 hours each day
cron.schedule('41 10-21 * * *', runPipeline, { timezone: TZ });

console.log('Scheduler ready.');
console.log('Will run at :11 and :41 from 10:00–21:59 America/New_York.');

if (ARGV.has('--once') || ARGV.has('--now')) {
  console.log('Running one pipeline now (because of --once/--now)...');
  runPipeline().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  console.log('Waiting for the next scheduled time…');
}