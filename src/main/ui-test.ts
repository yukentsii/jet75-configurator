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

  // quick trigger switches on the selected key: rapid trigger on (mode 2), then quick trigger off (mode 0).
  // Rapid trigger only works while quick trigger is on, so turn that on first if this profile has it off.
  if ((await kb.triggers(profile))[0].keyMode === 0) {
    await click('#t-rt');
    await wait(1000);
  }
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

  const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  const keyArea = (layer: number) => 512 * (4 * profile + layer);

  // Key Config lists: Media → Volume + on matrix #0
  await click('[data-tab="keys"]');
  await click('#layers [data-layer="0"]');
  await wait(800);
  await click('#kbd .key[data-index="0"]');
  await click('[data-sub="media"]');
  await click('.funcs .func[data-code="30e900"]');
  await wait(800);
  const vol = (await kb.keymap(profile, 0))[0];
  check('ui media list: Volume + on #0', vol.type === 0x30 && vol.code1 === 0xe9 && vol.code2 === 0);
  check('ui key cap names the entry', String(await js(`document.querySelector('#kbd .key[data-index="0"]').textContent`)) === 'Vol +');
  await kb.setKeyEntry(profile, 0, 0, [original.type, original.code1, original.code2]);

  // Restore defaults on Win Fn writes the factory map of that layer
  const fnRaw = await kb.rawRegion(0x08, keyArea(1), 384);
  await click('#layers [data-layer="1"]');
  await wait(800);
  await click('#restore-layer');
  await click('#confirm-ok');
  await wait(2500);
  const factory = (await kb.defaultKeys(1)).flat();
  check('ui restore defaults writes the factory Win Fn map', same(await kb.rawRegion(0x08, keyArea(1), 384), factory));
  await kb.writeRawRegion(0x09, keyArea(1), fnRaw);
  check('Win Fn layer restored byte-for-byte', same(await kb.rawRegion(0x08, keyArea(1), 384), fnRaw));
  await click('#layers [data-layer="0"]');

  // RS: A (#10) and D (#11) through Bind Key1 / Bind Key2
  const mtRaw = await kb.rawRegion(0xa4, 256 * profile, 256);
  const [a0, d0] = [(await kb.keymap(profile, 0))[10], (await kb.keymap(profile, 0))[11]];
  await click('[data-tab="advanced"]');
  await click('.adv-kind[data-kind="rs"]');
  await click('#kbd .key[data-index="10"]');
  await click('#kbd .key[data-index="11"]');
  await click('#adv-save');
  await wait(2000);
  const [ra, rd] = [(await kb.keymap(profile, 0))[10], (await kb.keymap(profile, 0))[11]];
  const rsSlot = ra.code1;
  const mts = (await kb.advanced(profile)).mt;
  check('ui RS pair stored as [0x93, s, partner]', ra.type === 0x93 && ra.code2 === 11 && rd.type === 0x93 && rd.code1 === rsSlot + 1 &&
    rd.code2 === 10 && mts[rsSlot].tap.join() === '16,0,4' && mts[rsSlot].hold.join() === '16,0,7' && mts[rsSlot + 1].tap.join() === '16,0,7');
  await kb.setKeyEntry(profile, 0, 10, [a0.type, a0.code1, a0.code2]);
  await kb.setKeyEntry(profile, 0, 11, [d0.type, d0.code1, d0.code2]);
  await kb.writeRawRegion(0xa5, 256 * profile, mtRaw);
  check('RS keys and MT slots restored', same(await kb.rawRegion(0xa4, 256 * profile, 256), mtRaw) &&
    (await kb.keymap(profile, 0))[10].code2 === a0.code2 && (await kb.keymap(profile, 0))[11].code2 === d0.code2);

  // LOGO light effect and backlight direction
  const funcRaw = await kb.funcConfig(profile);
  await click('[data-tab="lighting"]');
  await click('#light-zone [data-zone="logo"]');
  const logoBefore = (await kb.lighting(profile)).sideEffect;
  const logoEffect = logoBefore === 4 ? 9 : 4;
  await click(`#effects [data-effect="${logoEffect}"]`);
  await wait(1000);
  const afterLogo = await kb.lighting(profile);
  check(`ui LOGO light effect -> ${logoEffect} (backlight untouched)`, afterLogo.sideEffect === logoEffect && afterLogo.effect === funcRaw[8]);
  await click('#light-zone [data-zone="back"]');
  const dir = afterLogo.direction ? 0 : 1;
  await click(`#direction [data-dir="${dir}"]`);
  await wait(1000);
  check(`ui direction -> ${dir ? 'Right to Left' : 'Left to Right'}`, (await kb.lighting(profile)).direction === dir);
  await kb.writeRawRegion(0x06, 64 * profile, funcRaw);
  check('lighting restored byte-for-byte', same(await kb.funcConfig(profile), funcRaw));
  // sidebar: rename through the ⋮ menu and dialog, then drag built-in configurations with real mouse input
  const base = await kb.profiles();
  const target = base.order.slice(0, base.count).find((p) => p !== base.active);
  if (target == null) {
    check('sidebar tests (need a second enabled profile)', false);
    return out;
  }
  const extra = base.count < 3 ? base.order[base.count] : -1; // the profile a drop on "Drag config here" enables
  const areas = (p: number): [number, number, number, number][] => [
    ...[0, 1, 2, 3].map((layer): [number, number, number, number] => [0x08, 0x09, 512 * (4 * p + layer), 384]),
    [0x05, 0x06, 64 * p, 64], [0xa0, 0xa1, 1024 * p, 1024], [0xa2, 0xa3, 768 * p, 768],
    [0xa4, 0xa5, 256 * p, 256], [0xa6, 0xa7, 128 * p, 128],
  ];
  // [read cmd, write cmd, offset, size] for everything these steps can write
  const regions: [number, number, number, number][] = [
    ...areas(target), ...(extra >= 0 ? areas(extra) : []),
    ...[0, 1, 2, 3].map((p): [number, number, number, number] => [0xf1, 0xf2, 1024 * p + 336, 280]),
  ];
  const backup: number[][] = [];
  for (const [r, , off, size] of regions) backup.push(await kb.rawRegion(r, off, size));
  const table = base.raw.slice();

  // rename
  await click(`#profiles [data-profile="${target}"] .profile-more`);
  const menuShown = !(await js(`document.getElementById('profile-menu').hidden`));
  await click('#profile-menu [data-act="rename"]');
  const okDisabledAtFirst = await js(`document.getElementById('rename-ok').disabled`);
  await js(`(() => { const i = document.getElementById('rename-input'); i.value = 'Renamed by test'; i.dispatchEvent(new Event('input')); })()`);
  const counter = String(await js(`document.getElementById('rename-count').textContent`));
  await click('#rename-ok');
  await wait(1500);
  check('ui rename via menu and dialog stored on keyboard', menuShown && okDisabledAtFirst && counter === '15/15' &&
    (await kb.profileNames())[target] === 'Renamed by test' &&
    String(await js(`document.querySelector('#profiles [data-profile="${target}"] .profile-name').textContent`)) === 'Renamed by test');

  // real mouse drag: press on the preset, move in steps, release over the target
  const zoom = win.webContents.getZoomFactor();
  const centre = async (sel: string) => {
    const r = await js(`(() => { const b = document.querySelector('${sel}').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`) as number[];
    return { x: Math.round(r[0] * zoom), y: Math.round(r[1] * zoom) };
  };
  const mouseDrag = async (fromSel: string, toSel: string) => {
    const a = await centre(fromSel);
    const b = await centre(toSel);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + ((b.x - a.x) * i) / 12), y: Math.round(a.y + ((b.y - a.y) * i) / 12), button: 'left' });
      await wait(25);
    }
    win.webContents.sendInputEvent({ type: 'mouseUp', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await wait(300);
  };

  const fps = await kb.buildPreset(PRESETS.find((p) => p.name === 'FPS Game')!);
  await mouseDrag(`[data-preset="${fps.id}"]`, `#profiles [data-profile="${target}"]`);
  const replaceAsked = String(await js(`document.getElementById('confirm-text').textContent`)).includes(fps.name) &&
    !(await js(`document.getElementById('confirm').hidden`));
  await click('#confirm-ok');
  // applying a configuration takes a few seconds; wait until the name is written (last step), up to 20 s
  for (let i = 0; i < 40 && (await kb.profileNames())[target] !== fps.name; i++) await wait(500);
  const t = await kb.triggers(target);
  check(`ui mouse drag of ${fps.name} onto a profile replaces it`, replaceAsked &&
    fps.triggers.every((p, i) => t[i].actuation === p.actuation && t[i].keyMode === p.keyMode) &&
    (await kb.profileNames())[target] === fps.name);

  if (extra >= 0) {
    const office = await kb.buildPreset(PRESETS.find((p) => p.name === 'Office Work')!);
    await mouseDrag(`[data-preset="${office.id}"]`, '#onboard-drop');
    await wait(8000);
    const after = await kb.profiles();
    const te = await kb.triggers(extra);
    check(`ui mouse drag of ${office.name} onto "Drag config here" adds an onboard config`,
      after.count === base.count + 1 && te.every((x, i) => x.actuation === office.triggers[i].actuation) &&
      (await kb.profileNames())[extra] === office.name &&
      (await js(`document.querySelectorAll('#profiles .profile').length`)) === base.count + 1);
  }

  await kb.writeRawRegion(0x0e, 0, table);
  for (let i = 0; i < regions.length; i++) await kb.writeRawRegion(regions[i][1], regions[i][2], backup[i]);
  let restored = (await kb.profiles()).raw.every((b, j) => b === table[j]);
  for (let i = 0; i < regions.length; i++) {
    const now = await kb.rawRegion(regions[i][0], regions[i][2], regions[i][3]);
    restored &&= now.every((b, j) => b === backup[i][j]);
  }
  check('profiles, names and configs restored byte-for-byte after sidebar tests', restored);
  return out;
}
