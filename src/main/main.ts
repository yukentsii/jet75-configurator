import { app, BrowserWindow, ipcMain, session } from 'electron';
import * as path from 'path';
import { Jet75 } from './device';
import { CONFIRMED_WRITES, Cmd, LightingPatch, Macro, Performance, Trigger } from './protocol';
import { PRESETS } from './presets';
import { runUiTest } from './ui-test';

let kb: Jet75 | null = null;

async function device(): Promise<Jet75> {
  if (!kb) kb = await Jet75.open();
  return kb;
}

// Every handler returns { ok, value } or { ok: false, error } so the renderer can show the message.
function handle(channel: string, fn: (...args: any[]) => Promise<unknown>) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      if (kb && /not found|could not|cannot write|no reply/i.test(String(err))) {
        await kb.close().catch(() => undefined);
        kb = null;
      }
      return { ok: false, error: (err as Error).message };
    }
  });
}

handle('connect', async () => {
  const d = await device();
  return {
    info: await d.info(),
    profiles: await d.profiles(),
    writes: {
      lighting: CONFIRMED_WRITES.has(Cmd.setFuncConfig),
      keymap: CONFIRMED_WRITES.has(Cmd.setKeyMatrix),
      profile: CONFIRMED_WRITES.has(Cmd.setBase),
      macros: CONFIRMED_WRITES.has(Cmd.setMacros),
    },
  };
});
handle('lighting', async (profile: number) => (await device()).lighting(profile));
handle('setLighting', async (profile: number, patch: LightingPatch) => (await device()).setLighting(profile, patch));
handle('keymap', async (profile: number, layer: number) => (await device()).keymap(profile, layer));
handle('setKey', async (profile: number, layer: number, index: number, usage: number) =>
  (await device()).setKey(profile, layer, index, usage));
handle('bindMacro', async (profile: number, layer: number, index: number, macro: number) =>
  (await device()).bindMacro(profile, layer, index, macro));
handle('switchProfile', async (profile: number) => {
  const d = await device();
  await d.switchProfile(profile);
  return d.profiles();
});
// Changing the rate of the active profile makes the keyboard re-enumerate on USB, so the write's reply
// can be lost. Reopen the device and read back to confirm.
handle('setReportRate', async (profile: number, index: number) => {
  try {
    return await (await device()).setReportRate(profile, index);
  } catch (err) {
    if (!/not connected|could not read|no reply/i.test(String(err))) throw err;
    await kb?.close().catch(() => undefined);
    kb = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const l = await (await device()).lighting(profile);
        if (l.reportRateIndex !== index) throw new Error('polling rate did not change');
        return l;
      } catch {
        await (kb as Jet75 | null)?.close().catch(() => undefined);
        kb = null;
      }
    }
    throw new Error('keyboard did not come back after changing the polling rate. reconnect it.');
  }
});
handle('performance', async (profile: number) => (await device()).performance(profile));
handle('setPerformance', async (profile: number, patch: Partial<Performance>) => (await device()).setPerformance(profile, patch));
handle('triggers', async (profile: number) => (await device()).triggers(profile));
handle('setTriggers', async (profile: number, keys: number[], patch: Partial<Trigger>) =>
  (await device()).setTriggers(profile, keys, patch));
handle('advanced', async (profile: number) => (await device()).advanced(profile));
handle('setAdvanced', async (profile: number, kind: 'dks' | 'mt' | 'tgl', slots: any[]) => {
  const d = await device();
  if (kind === 'dks') await d.setDks(profile, slots);
  else if (kind === 'mt') await d.setMt(profile, slots);
  else await d.setTgl(profile, slots);
  return d.advanced(profile);
});
handle('setKeyEntry', async (profile: number, layer: number, index: number, entry: number[]) =>
  (await device()).setKeyEntry(profile, layer, index, entry));

handle('presets', async () => PRESETS.map(({ id, name, help }) => ({ id, name, help })));
handle('applyPreset', async (profile: number, id: number) => {
  const def = PRESETS.find((p) => p.id === id);
  if (!def) throw new Error('unknown preset');
  const d = await device();
  await d.applyPreset(profile, await d.buildPreset(def));
});
handle('macros', async () => (await device()).macros());
handle('setMacros', async (macros: Macro[]) => (await device()).setMacros(macros));

app.whenReady().then(() => {
  // The app is fully offline: block every network request from the renderer.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !details.url.startsWith('file:') }));

  const win = new BrowserWindow({
    // Same viewport as the vendor screenshots; the layout is drawn at 1920 px wide and zoomed to fit.
    width: 1456,
    height: 818,
    useContentSize: true,
    minWidth: 1100,
    minHeight: 640,
    backgroundColor: '#f9f8f6',
    title: 'Jet 75',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: !process.env.JET75_SNAPSHOT,
    },
  });
  win.setMenuBarVisibility(false);
  const fit = () => win.webContents.setZoomFactor(Math.max(0.55, win.getContentSize()[0] / 1920));
  win.webContents.on('did-finish-load', fit);
  win.on('resize', fit);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.env.JET75_UI_TEST) {
    win.webContents.once('did-finish-load', async () => {
      try {
        console.log((await runUiTest(win, device)).join('\n'));
      } catch (err) {
        console.log('FAIL  ui test error: ' + (err as Error).message);
      }
      app.quit();
    });
  }

  // JET75_SNAPSHOT=<png path>: save a screenshot a few seconds after load, then quit (used for checks).
  // JET75_SNAPSHOT_TAB picks the tab (lighting, trigger, keys, macros, advanced, performance, others), JET75_SNAPSHOT_DARK=1 the dark theme.
  const snapshot = process.env.JET75_SNAPSHOT;
  if (snapshot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const tab = process.env.JET75_SNAPSHOT_TAB ?? 'lighting';
        await win.webContents.executeJavaScript(`
          document.documentElement.classList.toggle('dark', ${!!process.env.JET75_SNAPSHOT_DARK});
          document.querySelector('[data-tab="${tab === 'macros' ? 'keys' : tab}"]')?.click();
          if ('${tab}' === 'macros') document.querySelector('[data-sub="macros"]').click();
          if ('${tab}' === 'keys' || '${tab}' === 'macros') document.querySelector('#kbd .key[data-index="40"]').click();
          if ('${tab}' === 'trigger') { document.querySelector('[data-sel="wasd"]').click(); document.querySelector('[data-view="actuation"]').click(); }`);
        await new Promise((r) => setTimeout(r, 400));
        win.webContents.invalidate();
        await new Promise((r) => setTimeout(r, 300));
        require('fs').writeFileSync(snapshot, (await win.webContents.capturePage()).toPNG());
        app.quit();
      }, 4000);
    });
  }
});

app.on('window-all-closed', async () => {
  await kb?.close().catch(() => undefined);
  app.quit();
});
