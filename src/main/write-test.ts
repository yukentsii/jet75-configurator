// Hardware write test: `node dist/main/write-test.js`.
// Each step writes, reads back, and restores the original bytes. No boot, ROM, calibration or factory-reset commands.
import { Jet75 } from './device';
import { keyRef, mtEntry } from './protocol';
import { PRESETS } from './presets';

function same(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function main() {
  const kb = await Jet75.open();
  const results: string[] = [];
  const check = (name: string, ok: boolean) => results.push(`${ok ? 'pass' : 'FAIL'}  ${name}`);
  try {
    // lighting via TS layer
    const block = await kb.funcConfig(0);
    const l = await kb.setLighting(0, { brightness: 40 });
    check('lighting write reads back brightness 40', l.brightness === 40);
    await kb.write(0x06, 0, block);
    check('lighting restored byte-for-byte', same(await kb.funcConfig(0), block));

    // report rate
    const r = await kb.setReportRate(0, 2);
    check('report rate index 2 reads back', r.reportRateIndex === 2);
    await kb.write(0x06, 0, block);
    check('report rate restored', same(await kb.funcConfig(0), block));

    // key remap through TS layer (profile 1, layer 1, matrix #0)
    const before = (await kb.keymap(0, 0))[0];
    await kb.setKey(0, 0, 0, 0x1b);
    check('remap #0 -> X reads back', (await kb.keymap(0, 0))[0].code2 === 0x1b);
    await kb.setKeyEntry(0, 0, 0, [before.type, before.code1, before.code2]);
    const k = (await kb.keymap(0, 0))[0];
    check('remap restored', k.type === before.type && k.code1 === before.code1 && k.code2 === before.code2);

    // macros: keep existing macros, add a test macro in slot 15, then restore the raw region
    const region = await kb.macroRegion();
    const macros = await kb.macros();
    const test = macros.map((m) => ({ ...m }));
    test[15] = {
      mode: 0,
      actions: [
        { kind: 'key', down: true, code: 0x04, delay: 20 },
        { kind: 'key', down: false, code: 0x04, delay: 20 },
      ],
    };
    const back = await kb.setMacros(test);
    check('macro slot 15 reads back (a down/up, 20 ms)', JSON.stringify(back[15].actions) === JSON.stringify(test[15].actions));
    check('existing macro 0 preserved', JSON.stringify(back[0].actions) === JSON.stringify(macros[0].actions));

    // bind macro 15 to an unused matrix position (#127 on profile 1, layer 4), then clear it
    const spare = (await kb.keymap(0, 3))[127];
    await kb.bindMacro(0, 3, 127, 15);
    const bound = (await kb.keymap(0, 3))[127];
    check('macro binding reads back as 70 0F 00', bound.type === 0x70 && bound.code1 === 15 && bound.code2 === 0);
    await kb.setKeyEntry(0, 3, 127, [spare.type, spare.code1, spare.code2]);
    const restored = (await kb.keymap(0, 3))[127];
    check('binding restored', restored.type === spare.type && restored.code2 === spare.code2);

    await kb.writeMacroRegion(region);
    check('macro region restored byte-for-byte', same(await kb.macroRegion(), region));

    // performance switches (profile 1): win lock, mac mode, debounce
    const perfBlock = await kb.funcConfig(0);
    const perf = await kb.setPerformance(0, { lockWin: true, macMode: true, debounce: 2 });
    check('performance: win lock, mac mode, debounce 2 read back', perf.lockWin && perf.macMode && perf.debounce === 2);
    await kb.write(0x06, 0, perfBlock);
    check('performance restored byte-for-byte', same(await kb.funcConfig(0), perfBlock));

    // per-key trigger (profile 1, key #0): actuation 2.00 mm, rapid trigger 0.30/0.40 mm
    const trigRaw = await kb.rawRegion(0xa0, 0, 8);
    const trig = (await kb.setTriggers(0, [0], { actuation: 200, rtPress: 30, rtRelease: 40 }))[0];
    check('trigger #0 reads back 200/30/40', trig.actuation === 200 && trig.rtPress === 30 && trig.rtRelease === 40);
    await kb.writeRawRegion(0xa1, 0, trigRaw);
    check('trigger restored byte-for-byte', same(await kb.rawRegion(0xa0, 0, 8), trigRaw));

    // advanced key slots (profile 1): mt, tgl, dks slot 0
    const mtRaw = await kb.rawRegion(0xa4, 0, 256);
    const tglRaw = await kb.rawRegion(0xa6, 0, 128);
    const dksRaw = await kb.rawRegion(0xa2, 0, 768);
    const adv = await kb.advanced(0);
    adv.mt[0] = { tap: keyRef(0x04), hold: keyRef(0xe1) };
    adv.tgl[0] = [0x10, 0, 0x05];
    adv.dks[0] = { points: [10, 30, 30, 10], keys: [{ key: [0x10, 0, 0x06], phases: 0b0001001001 }, ...adv.dks[0].keys.slice(1)] };
    await kb.setMt(0, adv.mt);
    await kb.setTgl(0, adv.tgl);
    await kb.setDks(0, adv.dks);
    const back2 = await kb.advanced(0);
    check('mt slot 0 reads back (tap a, hold lshift)', back2.mt[0].tap[2] === 0x04 && back2.mt[0].hold[1] === 0x02);
    check('tgl slot 0 reads back (b)', back2.tgl[0][2] === 0x05);
    check('dks slot 0 reads back (c, phases 0x49)', back2.dks[0].keys[0].key[2] === 0x06 && back2.dks[0].keys[0].phases === 0x49);

    // bind mt slot 0 to an unused matrix position and read it back
    const spare2 = (await kb.keymap(0, 3))[126];
    await kb.setKeyEntry(0, 3, 126, mtEntry(0));
    const advKey = (await kb.keymap(0, 3))[126];
    check('mt binding reads back as 92 00 0F (150 ms hold)', advKey.type === 0x92 && advKey.code1 === 0 && advKey.code2 === 15);
    await kb.setKeyEntry(0, 3, 126, [spare2.type, spare2.code1, spare2.code2]);

    await kb.writeRawRegion(0xa5, 0, mtRaw);
    await kb.writeRawRegion(0xa7, 0, tglRaw);
    await kb.writeRawRegion(0xa3, 0, dksRaw);
    check('mt/tgl/dks restored byte-for-byte', same(await kb.rawRegion(0xa4, 0, 256), mtRaw) &&
      same(await kb.rawRegion(0xa6, 0, 128), tglRaw) && same(await kb.rawRegion(0xa2, 0, 768), dksRaw));

    // official preset "MOBA Game" applied to profile 1 (not the active one), then presetRestored from a raw backup
    const moba = await kb.buildPreset(PRESETS.find((p) => p.name === 'MOBA Game')!);
    const regions: [number, number, number, number][] = [
      ...[0, 1, 2, 3].map((layer): [number, number, number, number] => [0x08, 0x09, 512 * layer, 384]),
      [0x05, 0x06, 0, 64], [0xa0, 0xa1, 0, 1024], [0xa2, 0xa3, 0, 768], [0xa4, 0xa5, 0, 256], [0xa6, 0xa7, 0, 128],
    ];
    const backup = [];
    for (const [r, , off, size] of regions) backup.push(await kb.rawRegion(r, off, size));
    await kb.applyPreset(0, moba);
    const pTrig = await kb.triggers(0);
    check('preset triggers read back (128 keys)', moba.triggers.every((t, i) =>
      pTrig[i].actuation === t.actuation && pTrig[i].keyMode === t.keyMode && pTrig[i].rtPress === t.rtPress && pTrig[i].rtRelease === t.rtRelease));
    const pKeys = await kb.keymap(0, 0);
    check('preset key map layer 1 reads back', moba.keys[0].every((k, i) => pKeys[i].type === k[0] && pKeys[i].code1 === k[1] && pKeys[i].code2 === k[2]));
    const pLight = await kb.lighting(0);
    check(`preset lighting reads back (effect ${moba.lighting.effect}, ${moba.lighting.brightness}%)`,
      pLight.effect === moba.lighting.effect && pLight.brightness === moba.lighting.brightness);
    check('polling rate untouched by preset', pLight.reportRateIndex === (backup[4][4] & 0x0f));
    for (let i = 0; i < regions.length; i++) await kb.writeRawRegion(regions[i][1], regions[i][2], backup[i]);
    let presetRestored = true;
    for (let i = 0; i < regions.length; i++) presetRestored &&= same(await kb.rawRegion(regions[i][0], regions[i][2], regions[i][3]), backup[i]);
    check('profile 1 restored byte-for-byte after preset', presetRestored);

    // profile switch
    const p = await kb.profiles();
    const other = p.order.slice(0, p.count).find((x) => x !== p.active)!;
    await kb.switchProfile(other);
    check(`profile switch ${p.active} -> ${other}`, (await kb.profiles()).active === other);
    await kb.switchProfile(p.active);
    check('profile restored', (await kb.profiles()).active === p.active);
  } finally {
    await kb.close();
    console.log(results.join('\n'));
  }
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
