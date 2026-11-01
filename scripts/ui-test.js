// Starts the app in UI-test mode and prints the results.
const { spawnSync } = require('child_process');
const electron = require('electron');
const r = spawnSync(electron, ['.'], { cwd: require('path').join(__dirname, '..'), env: { ...process.env, JET75_UI_TEST: '1' }, encoding: 'utf8' });
process.stdout.write(r.stdout || '');
process.exit(/FAIL/.test(r.stdout || 'FAIL') ? 1 : 0);
