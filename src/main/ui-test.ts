// End-to-end UI test, run with JET75_UI_TEST=1. Drives the renderer like a user, checks the keyboard,
// and restores every change it makes.
import { BrowserWindow } from 'electron';
import { Jet75 } from './device';
import { PRESETS } from './presets';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runUiTest(win: BrowserWindow, getDevice: () => Promise<Jet75>): Promise<string[]> {
  const js = (code: string) => win.webContents.executeJavaScript(code);
  const out: string[] = [];
  const check = (name: string, ok: boolean) => out.push(`${ok ? 'pass' : 'FAIL'}  ${name}`);
  const key = (type: string, code: string) =>
    js(`window.dispatchEvent(new KeyboardEvent('${type}', { code: '${code}', bubbles: true }))`);
  const click = (sel: string) => js(`document.querySelector('${sel}').click()`);

  await wait(3000);
  const kb = await getDevice();
  const profile = (await kb.profiles()).active;
  const original = (await kb.keymap(profile, 0))[0];
  const spare = (await kb.keymap(profile, 3))[79];
  const region = await kb.macroRegion();

  check('ui connected', /connected/i.test(String(await js(`document.getElementById('status').textContent`))));
  check('sidebar marks the active profile', await js(`document.querySelector('.profile.active')?.dataset.profile === '${profile}'`));
  check('keyboard shows 80 keys', (await js(`document.querySelectorAll('#kbd .key').length`)) === 80);

  // key config: select matrix #0 on the keyboard and press X
  await click('[data-tab="keys"]');
  check('layer buttons shown on key config', !(await js(`document.getElementById('layers').hidden`)));
  await click('#kbd .key[data-index="0"]');
  check('key selects on click', await js(`document.querySelector('#kbd .key[data-index="0"]').classList.contains('sel')`));
  await key('keydown', 'KeyX');
  await wait(800);
  check('ui remap #0 -> X on keyboard', (await kb.keymap(profile, 0))[0].code2 === 0x1b);
  await kb.setKeyEntry(profile, 0, 0, [original.type, original.code1, original.code2]);

  // shortcut record: record m16 as a down, a up
  await click('[data-sub="macros"]');
  await click('.macro[data-macro="15"] .macro-edit');
  await click('#macro-record');
  await key('keydown', 'KeyA');
  await wait(60);
  await key('keyup', 'KeyA');
  await click('#macro-record');
  await click('#macro-save');
  await wait(1500);
  const m = (await kb.macros())[15];
  check('ui macro 16 saved as a down/up', m.actions.length === 2 && m.actions[0].code === 0x04 && m.actions[0].down && !m.actions[1].down);

  // bind m16 to matrix #79 on layer 4 through the ui
  await click('#layers [data-layer="3"]');
  await wait(800);
  await click('#kbd .key[data-index="79"]');
  await click('.macro[data-macro="15"] .macro-bind');
  await wait(1000);
  const bound = (await kb.keymap(profile, 3))[79];
  check('ui macro bind on keyboard', bound.type === 0x70 && bound.code1 === 15);
  await kb.setKeyEntry(profile, 3, 79, [spare.type, spare.code1, spare.code2]);

  // performance: flip win key lock with its switch
  const perf = await kb.performance(profile);
  await click('[data-tab="performance"]');
  await click('#p-lockWin');
  await wait(1000);
  check('ui win key lock toggled on keyboard', (await kb.performance(profile)).lockWin === !perf.lockWin);
  await kb.setPerformance(profile, { lockWin: perf.lockWin });

  // stability mode: turning it off goes through the confirmation dialog
  await kb.setPerformance(profile, { stability: true });
  await click('[data-tab="lighting"]');
  await click('#connect');
  await wait(3000);
  await click('[data-tab="performance"]');
  await click('#p-stability');
  const asked = !(await js(`document.getElementById('confirm').hidden`));
  await click('#confirm-ok');
  await wait(1000);
  check('ui stability off after confirm on keyboard', asked && !(await kb.performance(profile)).stability);
  await kb.setPerformance(profile, { stability: perf.stability });

  // trigger: select matrix #0, set actuation 2.00 mm, apply
  const trig = (await kb.triggers(profile))[0];
  await click('[data-tab="trigger"]');
  await click('#kbd .key[data-index="0"]');
  await js(`(() => { const r = document.getElementById('t-actuation'); r.value = '2.00'; r.dispatchEvent(new Event('change')); })()`);
  await wait(1500);
  check('ui actuation #0 -> 2.00 mm on keyboard', (await kb.triggers(profile))[0].actuation === 200);

  // quick trigger switches on the selected key: rapid trigger on (mode 2), then quick trigger off (mode 0)
  await click('#t-rapid');
  await wait(1000);
  const rapid = (await kb.triggers(profile))[0].keyMode;
  await click('#t-rt');
  await wait(1000);
  check('ui rapid trigger -> mode 2, quick trigger off -> mode 0', rapid === 2 && (await kb.triggers(profile))[0].keyMode === 0);
  await kb.setTriggers(profile, [0], trig);

  // advanced key: mod tap on matrix #79, tap a / hold shift
  const adv = await kb.advanced(profile);
  const base79 = (await kb.keymap(profile, 0))[79];
  await click('[data-tab="advanced"]');
  await click('.adv-kind[data-kind="mt"]');
  await click('#kbd .key[data-index="79"]');
  const slot = Number(String(await js(`document.querySelector('#adv-editor .empty-txt').textContent`)).match(/slot (\d+)/)![1]) - 1;
  await js(`document.getElementById('adv-tap').value = '4'; document.getElementById('adv-hold').value = '225'; document.getElementById('adv-holdtime').value = '300';`);
  await click('#adv-save');
  await wait(1500);
  const mt = (await kb.advanced(profile)).mt[slot];
  const e79 = (await kb.keymap(profile, 0))[79];
  check('ui mod tap hold time 300 ms reads back', e79.code2 === 30);
  check('ui mod tap saved and bound on keyboard', e79.type === 0x92 && e79.code1 === slot &&
    mt.tap.join() === '16,0,4' && mt.hold.join() === '16,2,0');
  await kb.setMt(profile, adv.mt);
  await kb.setKeyEntry(profile, 0, 79, [base79.type, base79.code1, base79.code2]);
  check('performance, trigger and mod tap restored',
    JSON.stringify(await kb.performance(profile)) === JSON.stringify(perf) &&
    JSON.stringify((await kb.triggers(profile))[0]) === JSON.stringify(trig) &&
    JSON.stringify((await kb.advanced(profile)).mt) === JSON.stringify(adv.mt) &&
    (await kb.keymap(profile, 0))[79].type === base79.type);

  await kb.writeMacroRegion(region);
  const restoredKey = (await kb.keymap(profile, 0))[0];
  const restoredSpare = (await kb.keymap(profile, 3))[79];
  check('keys restored', restoredKey.code2 === original.code2 && restoredKey.type === original.type &&
    restoredSpare.type === spare.type && restoredSpare.code1 === spare.code1 && restoredSpare.code2 === spare.code2);
  check('macro region restored', (await kb.macroRegion()).every((b, i) => b === region[i]));
  // official preset: drag "FPS Game" onto a non-active onboard profile, confirm, check its triggers, restore from a raw backup
  const base = await kb.profiles();
  const target = base.order.slice(0, base.count).find((p) => p !== base.active);
  if (target == null) {
    check('preset applied by drag (needs a second enabled profile)', false);
    return out;
  }
  const preset = await kb.buildPreset(PRESETS.find((p) => p.name === 'FPS Game')!);
  // [read cmd, write cmd, offset, size] for every area a preset writes, for profile `target`
  const regions: [number, number, number, number][] = [
    ...[0, 1, 2, 3].map((layer): [number, number, number, number] => [0x08, 0x09, 512 * (4 * target + layer), 384]),
    [0x05, 0x06, 64 * target, 64], [0xa0, 0xa1, 1024 * target, 1024], [0xa2, 0xa3, 768 * target, 768],
    [0xa4, 0xa5, 256 * target, 256], [0xa6, 0xa7, 128 * target, 128],
  ];
  const backup: number[][] = [];
  for (const [r, , off, size] of regions) backup.push(await kb.rawRegion(r, off, size));
  await js(`(() => {
    const src = document.querySelector('[data-preset="${preset.id}"]');
    const dst = document.querySelector('#profiles [data-profile="${target}"]');
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
  })()`);
  await wait(300);
  const presetAsked = String(await js(`document.getElementById('confirm-text').textContent`)).includes(preset.name);
  await click('#confirm-ok');
  await wait(8000);
  const t = await kb.triggers(target);
  check(`ui preset ${preset.name} applied to profile ${target + 1} by drag`, presetAsked &&
    preset.triggers.every((p, i) => t[i].actuation === p.actuation && t[i].keyMode === p.keyMode));
  for (let i = 0; i < regions.length; i++) await kb.writeRawRegion(regions[i][1], regions[i][2], backup[i]);
  let restored = true;
  for (let i = 0; i < regions.length; i++) {
    const now = await kb.rawRegion(regions[i][0], regions[i][2], regions[i][3]);
    restored &&= now.every((b, j) => b === backup[i][j]);
  }
  check(`profile ${target + 1} restored byte-for-byte after preset`, restored);
  return out;
}
