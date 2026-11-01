// node-hid transport for the Jet 75 command interface (MI_01, usage page 0x0001 / usage 0x0000).
import HID from 'node-hid';
import * as P from './protocol';
import { PresetDef, PRESET_LIGHTING, PRESET_PERFORMANCE, presetTriggers } from './presets';

export class Jet75 {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private hid: HID.HIDAsync, readonly path: string) {}

  static async open(): Promise<Jet75> {
    const devices = await HID.devicesAsync(P.VENDOR_ID, P.PRODUCT_ID);
    // node-hid reports usage 0 as undefined on Windows, so match on the interface number too.
    const info = devices.find(
      (d) => d.interface === P.INTERFACE && d.usagePage === P.USAGE_PAGE && (d.usage ?? 0) === P.USAGE && d.path,
    );
    if (!info?.path) throw new Error('jet 75 not found. connect it with the usb-c cable.');
    return new Jet75(await HID.HIDAsync.open(info.path), info.path);
  }

  close() {
    return this.hid.close();
  }

  // Commands run one at a time; replies are matched on flag, command and offset.
  private exec<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async transact(cmd: number, offset: number, len: number, data?: number[]): Promise<number[]> {
    const pkt = P.frame(cmd, offset, len, data);
    for (let attempt = 0; attempt < 3; attempt++) {
      const out = new Array(65).fill(0);
      pkt.forEach((b, i) => (out[i + 1] = b)); // out[0] = report ID 0
      await this.hid.write(out);
      const deadline = Date.now() + 1000;
      while (Date.now() < deadline) {
        const buf = await this.hid.read(Math.max(1, deadline - Date.now()));
        if (!buf || buf.length === 0) break;
        const r = Array.from(buf);
        if (P.isReply(r, cmd, offset, len)) return r.slice(8, 8 + r[4]);
      }
    }
    throw new Error(`no reply to command 0x${cmd.toString(16)} at offset ${offset}`);
  }

  read(cmd: number, offset: number, size: number): Promise<number[]> {
    if (!P.READ_CMDS.has(cmd)) return Promise.reject(new Error(`0x${cmd.toString(16)} is not a read command`));
    return this.exec(async () => {
      const out: number[] = [];
      for (let i = 0; i < size; i += P.MAX_DATA) out.push(...(await this.transact(cmd, offset + i, Math.min(P.MAX_DATA, size - i))));
      return out;
    });
  }

  write(cmd: number, offset: number, data: number[]): Promise<void> {
    if (!P.CONFIRMED_WRITES.has(cmd)) return Promise.reject(new Error(`write 0x${cmd.toString(16)} is not confirmed on hardware yet`));
    return this.exec(async () => {
      for (let i = 0; i < data.length; i += P.MAX_DATA) {
        const chunk = data.slice(i, i + P.MAX_DATA);
        await this.transact(cmd, offset + i, chunk.length, chunk);
      }
    });
  }

  async info() {
    return P.parseInfo(await this.read(P.Cmd.getInfo, 0, 56));
  }

  async profiles() {
    return P.parseBase(await this.read(P.Cmd.getBase, 0, 56));
  }

  funcConfig(profile: number) {
    return this.read(P.Cmd.getFuncConfig, P.FUNC_SIZE * profile, P.FUNC_SIZE);
  }

  async lighting(profile: number) {
    return P.parseLighting(await this.funcConfig(profile));
  }

  async setLighting(profile: number, patch: P.LightingPatch) {
    const block = await this.funcConfig(profile);
    await this.write(P.Cmd.setFuncConfig, P.FUNC_SIZE * profile, P.applyLighting(block, patch));
    return this.lighting(profile);
  }

  async keymap(profile: number, layer: number) {
    return P.parseKeymap(await this.read(P.Cmd.getKeyMatrix, P.keymapOffset(profile, layer), 3 * P.KEY_COUNT));
  }

  async setKey(profile: number, layer: number, index: number, hidUsage: number) {
    await this.setKeyEntry(profile, layer, index, P.keyRef(hidUsage));
  }

  setKeyEntry(profile: number, layer: number, index: number, entry: number[]) {
    return this.write(P.Cmd.setKeyMatrix, P.keyWriteOffset(profile, layer, index), entry.map((b) => b & 0xff));
  }

  // A macro key is entry type 0x70: code1 = macro index, code2 = the macro's mode.
  async bindMacro(profile: number, layer: number, index: number, macro: number) {
    const macros = await this.macros();
    await this.setKeyEntry(profile, layer, index, [0x70, macro, macros[macro].mode]);
  }

  async setReportRate(profile: number, index: number) {
    const block = await this.funcConfig(profile);
    await this.write(P.Cmd.setFuncConfig, P.FUNC_SIZE * profile, P.applyReportRate(block, index));
    return this.lighting(profile);
  }

  async performance(profile: number) {
    return P.parsePerformance(await this.funcConfig(profile));
  }

  async setPerformance(profile: number, patch: Partial<P.Performance>) {
    const block = await this.funcConfig(profile);
    await this.write(P.Cmd.setFuncConfig, P.FUNC_SIZE * profile, P.applyPerformance(block, patch));
    return this.performance(profile);
  }

  async triggers(profile: number) {
    return P.parseTriggers(await this.read(P.Cmd.getTrigger, P.TRIGGER_SIZE * profile, 8 * P.KEY_COUNT));
  }

  // Writes only the 8-byte records of the listed keys.
  async setTriggers(profile: number, keys: number[], patch: Partial<P.Trigger>) {
    const all = await this.triggers(profile);
    for (const k of keys) {
      const t = { ...all[k], ...patch };
      await this.write(P.Cmd.setTrigger, P.TRIGGER_SIZE * profile + 8 * k, P.encodeTrigger(t));
    }
    return this.triggers(profile);
  }

  private async slots(cmd: number, size: number, profile: number) {
    return this.read(cmd, size * profile, size);
  }

  async advanced(profile: number) {
    return {
      dks: P.parseDks(await this.slots(P.Cmd.getDks, P.DKS.size, profile)),
      mt: P.parseMt(await this.slots(P.Cmd.getMt, P.MT.size, profile)),
      tgl: P.parseTgl(await this.slots(P.Cmd.getTgl, P.TGL.size, profile)),
    };
  }

  async setMt(profile: number, slots: P.MtSlot[]) {
    await this.write(P.Cmd.setMt, P.MT.size * profile, P.encodeMt(slots));
  }

  async setTgl(profile: number, slots: P.KeyRef[]) {
    await this.write(P.Cmd.setTgl, P.TGL.size * profile, P.encodeTgl(slots));
  }

  async setDks(profile: number, slots: P.DksSlot[]) {
    await this.write(P.Cmd.setDks, P.DKS.size * profile, P.encodeDks(slots));
  }

  // The factory key map, as stored on the keyboard (0x07), for one layer.
  async defaultKeys(layer: number): Promise<P.KeyRef[]> {
    const d = await this.read(P.Cmd.getDefaultKeyMatrix, P.KEY_AREA * layer, 3 * P.KEY_COUNT);
    return Array.from({ length: P.KEY_COUNT }, (_, i) => d.slice(3 * i, 3 * i + 3) as P.KeyRef);
  }

  // Writes the factory key map of one layer back over the user map.
  async restoreLayer(profile: number, layer: number) {
    const keys = await this.defaultKeys(layer);
    await this.write(P.Cmd.setKeyMatrix, P.keyWriteOffset(profile, layer, 0), keys.flat());
    return this.keymap(profile, layer);
  }

  async buildPreset(def: PresetDef): Promise<P.Preset> {
    const keys: P.KeyRef[][] = [];
    for (let layer = 0; layer < P.LAYERS; layer++) keys.push(await this.defaultKeys(layer));
    return {
      id: def.id, name: def.name, help: def.help, keys,
      lighting: PRESET_LIGHTING, performance: PRESET_PERFORMANCE, triggers: presetTriggers(def, P.KEY_COUNT),
    };
  }

  resetProfile(profile: number) {
    return this.write(P.Cmd.reset, 0, [profile & 0x03]);
  }

  // Resets every profile, macro and setting. The keyboard reconnects afterwards.
  factoryReset() {
    return this.write(P.Cmd.reset, 0, [0xff]);
  }

  // Everything that belongs to one profile, as raw bytes: an exact copy that can be saved, exported and restored.
  async snapshot(profile: number): Promise<P.Snapshot> {
    const keys: number[][] = [];
    for (let layer = 0; layer < P.LAYERS; layer++) {
      keys.push(await this.read(P.Cmd.getKeyMatrix, P.keymapOffset(profile, layer), 3 * P.KEY_COUNT));
    }
    return {
      format: P.SNAPSHOT_FORMAT,
      keys,
      settings: await this.funcConfig(profile),
      triggers: await this.read(P.Cmd.getTrigger, P.TRIGGER_SIZE * profile, P.TRIGGER_SIZE),
      dks: await this.read(P.Cmd.getDks, P.DKS.size * profile, P.DKS.size),
      mt: await this.read(P.Cmd.getMt, P.MT.size * profile, P.MT.size),
      tgl: await this.read(P.Cmd.getTgl, P.TGL.size * profile, P.TGL.size),
    };
  }

  // A built-in configuration as a snapshot, without writing it anywhere. Settings start from `base`'s.
  async presetSnapshot(def: PresetDef, base: number): Promise<P.Snapshot> {
    const preset = await this.buildPreset(def);
    let settings = P.applyLighting(await this.funcConfig(base), {
      effect: preset.lighting.effect, brightness: preset.lighting.brightness, speed: preset.lighting.speed, color: preset.lighting.color,
    });
    settings[11] = preset.lighting.direction;
    settings[12] = preset.lighting.customColorDisabled ? 1 : 0;
    settings = P.applyPerformance(settings, preset.performance);
    return {
      format: P.SNAPSHOT_FORMAT,
      keys: preset.keys.map((layer) => layer.flat()),
      settings,
      triggers: preset.triggers.flatMap(P.encodeTrigger),
      dks: new Array(P.DKS.size).fill(0),
      mt: new Array(P.MT.size).fill(0),
      tgl: new Array(P.TGL.size).fill(0),
    };
  }

  // Writes a snapshot into a profile. The target keeps its own polling rate, like built-in configurations do.
  async restoreSnapshot(profile: number, s: P.Snapshot) {
    P.checkSnapshot(s);
    for (let layer = 0; layer < P.LAYERS; layer++) {
      await this.write(P.Cmd.setKeyMatrix, P.keyWriteOffset(profile, layer, 0), s.keys[layer]);
    }
    const current = await this.funcConfig(profile);
    const settings = s.settings.slice();
    settings[4] = (settings[4] & 0xf0) | (current[4] & 0x0f);
    await this.write(P.Cmd.setFuncConfig, P.FUNC_SIZE * profile, settings);
    await this.write(P.Cmd.setTrigger, P.TRIGGER_SIZE * profile, s.triggers);
    await this.write(P.Cmd.setDks, P.DKS.size * profile, s.dks);
    await this.write(P.Cmd.setMt, P.MT.size * profile, s.mt);
    await this.write(P.Cmd.setTgl, P.TGL.size * profile, s.tgl);
  }

  // Profile table: byte 0 = position of the active profile in the order, byte 1 = enabled count, bytes 2–5 = order.
  // Profiles past `count` in the order are disabled.
  private async writeTable(order: number[], count: number, active: number) {
    const base = (await this.profiles()).raw.slice();
    order.forEach((p, i) => (base[2 + i] = p));
    base[1] = count;
    base[0] = order.indexOf(active);
    await this.write(P.Cmd.setBase, 0, base);
    return this.profiles();
  }

  // Enables the next disabled profile and returns its index.
  async addProfile(): Promise<number> {
    const t = await this.profiles();
    if (t.count >= P.MAX_ONBOARD) throw new Error(`the keyboard holds at most ${P.MAX_ONBOARD} onboard configs`);
    await this.writeTable(t.order, t.count + 1, t.active);
    return t.order[t.count];
  }

  // Disables a profile by moving it behind the enabled ones. The active profile moves to the first remaining one.
  async deleteProfile(profile: number) {
    const t = await this.profiles();
    const enabled = t.order.slice(0, t.count);
    if (!enabled.includes(profile)) throw new Error('profile is not enabled');
    if (t.count <= 1) throw new Error('the keyboard needs at least one onboard config');
    const rest = enabled.filter((p) => p !== profile);
    const order = [...rest, profile, ...t.order.slice(t.count)];
    return this.writeTable(order, t.count - 1, t.active === profile ? rest[0] : t.active);
  }

  async profileNames(): Promise<string[]> {
    return P.decodeNames(await this.read(P.Cmd.getCustom, P.NAMES_OFFSET, P.NAMES_SIZE));
  }

  async setProfileNames(names: string[]) {
    const bytes = P.encodeNames(names);
    for (let p = 0; p < P.PROFILES; p++) await this.write(P.Cmd.setCustom, P.CUSTOM_SIZE * p + P.NAMES_OFFSET, bytes);
    return this.profileNames();
  }

  async renameProfile(profile: number, name: string) {
    const names = await this.profileNames();
    while (names.length < P.PROFILES) names.push('');
    names[profile] = name.trim();
    return this.setProfileNames(names);
  }

  async applyPreset(profile: number, preset: P.Preset) {
    for (let layer = 0; layer < P.LAYERS; layer++) {
      await this.write(P.Cmd.setKeyMatrix, P.keyWriteOffset(profile, layer, 0), preset.keys[layer].flat());
    }
    const l = preset.lighting;
    let block = await this.funcConfig(profile);
    block = P.applyLighting(block, { effect: l.effect, brightness: l.brightness, speed: l.speed, color: l.color });
    block[11] = l.direction;
    block[12] = l.customColorDisabled ? 1 : 0;
    block = P.applyPerformance(block, preset.performance);
    await this.write(P.Cmd.setFuncConfig, P.FUNC_SIZE * profile, block);
    await this.write(P.Cmd.setTrigger, P.TRIGGER_SIZE * profile, preset.triggers.flatMap(P.encodeTrigger));
    await this.write(P.Cmd.setDks, P.DKS.size * profile, new Array(P.DKS.size).fill(0));
    await this.write(P.Cmd.setMt, P.MT.size * profile, new Array(P.MT.size).fill(0));
    await this.write(P.Cmd.setTgl, P.TGL.size * profile, new Array(P.TGL.size).fill(0));
  }

  rawRegion(cmd: number, offset: number, size: number) {
    return this.read(cmd, offset, size);
  }

  writeRawRegion(cmd: number, offset: number, bytes: number[]) {
    return this.write(cmd, offset, bytes);
  }

  // Per-key colours (effect 0), '#rrggbb' per matrix index 0..127.
  async keyColors(profile: number): Promise<string[]> {
    const d = await this.read(P.Cmd.getKeyColors, P.KEY_COLORS_SIZE * profile, 3 * P.KEY_COUNT);
    return Array.from({ length: P.KEY_COUNT }, (_, i) =>
      '#' + d.slice(3 * i, 3 * i + 3).map((v) => v.toString(16).padStart(2, '0')).join(''));
  }

  // Writes only the listed keys: runs of neighbouring keys go out as one write.
  async setKeyColors(profile: number, entries: [number, string][]) {
    const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const sorted = [...entries].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[j][0] + 1) j++;
      const data = sorted.slice(i, j + 1).flatMap(([, c]) => rgb(c));
      await this.write(P.Cmd.setKeyColors, P.KEY_COLORS_SIZE * profile + 3 * sorted[i][0], data);
      i = j + 1;
    }
    return this.keyColors(profile);
  }

  // One live frame: 384 bytes, RGB per key index.
  stream(frame: number[]) {
    return this.write(P.Cmd.stream, 0, frame.slice(0, 3 * P.KEY_COUNT).map((b) => b & 0xff));
  }

  macroRegion() {
    return this.read(P.Cmd.getMacros, 0, P.MACRO_READ_SIZE);
  }

  async macros() {
    return P.parseMacros(await this.macroRegion());
  }

  async setMacros(macros: P.Macro[]) {
    await this.write(P.Cmd.setMacros, 0, P.encodeMacros(macros));
    return this.macros();
  }

  writeMacroRegion(bytes: number[]) {
    return this.write(P.Cmd.setMacros, 0, bytes);
  }

  async switchProfile(profile: number) {
    const base = (await this.profiles()).raw.slice();
    const pos = base.slice(2, 2 + P.PROFILES).indexOf(profile);
    if (pos < 0 || pos >= base[1]) throw new Error(`profile ${profile} is not enabled`);
    base[0] = pos;
    await this.write(P.Cmd.setBase, 0, base);
  }
}
