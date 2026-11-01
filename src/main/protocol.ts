// GLW packet framing and payload decoding for the Jet 75 II. Byte layouts and evidence: ../../../PROTOCOL.md.

export const VENDOR_ID = 0x41e4;
export const PRODUCT_ID = 0x211a;
export const USAGE_PAGE = 0x0001;
export const USAGE = 0x0000;
export const INTERFACE = 1;

export const MAX_DATA = 56;
export const FUNC_SIZE = 64;
export const KEY_AREA = 512;
export const LAYERS = 4;
export const KEY_COUNT = 128;
export const PROFILES = 4;
// The official app offers 3 onboard configs on this model ("Onboard config (2/3)").
export const MAX_ONBOARD = 3;

export const Cmd = {
  getInfo: 0x03,
  getBase: 0x04,
  getFuncConfig: 0x05,
  setFuncConfig: 0x06,
  getDefaultKeyMatrix: 0x07,
  getKeyMatrix: 0x08,
  setKeyMatrix: 0x09,
  getKeyColors: 0x0a,
  setKeyColors: 0x0b,
  getMacros: 0x0c,
  setMacros: 0x0d,
  setBase: 0x0e,
  getCustom: 0xf1,
  // 0xEE + profile index resets that profile to factory settings; 0xEE + 0xFF resets the whole keyboard.
  // Verified on hardware by backing everything up, resetting, comparing and restoring.
  reset: 0xee,
  setCustom: 0xf2,
  getTrigger: 0xa0,
  setTrigger: 0xa1,
  getDks: 0xa2,
  setDks: 0xa3,
  getMt: 0xa4,
  setMt: 0xa5,
  getTgl: 0xa6,
  setTgl: 0xa7,
  // live lighting: 3 bytes RGB per key index; shown while frames keep coming, the saved effect returns ~3 s after the last
  stream: 0xdd,
} as const;

export const READ_CMDS = new Set<number>([
  Cmd.getInfo, Cmd.getBase, Cmd.getFuncConfig, Cmd.getDefaultKeyMatrix, Cmd.getKeyMatrix, Cmd.getMacros,
  Cmd.getTrigger, Cmd.getDks, Cmd.getMt, Cmd.getTgl, Cmd.getCustom, Cmd.getKeyColors,
]);

// Write commands that have been sent to the hardware and read back correctly.
// Add a command here only after its first write has been verified on the keyboard.
export const CONFIRMED_WRITES = new Set<number>([
  Cmd.setFuncConfig, Cmd.setKeyMatrix, Cmd.setBase, Cmd.setMacros,
  Cmd.setTrigger, Cmd.setDks, Cmd.setMt, Cmd.setTgl, Cmd.setCustom, Cmd.reset, Cmd.setKeyColors, Cmd.stream,
]);

// Per-key colours of the Custom effect (effect 0): 512 bytes per profile, RGB per matrix index.
export const KEY_COLORS_SIZE = 512;

// [0x55, cmd, 0, sum(bytes 4..) & 0xFF, len, offLo, offHi, 0, data...]
export function frame(cmd: number, offset: number, len: number, data: number[] = []): number[] {
  const body = [len, offset & 0xff, (offset >> 8) & 0xff, 0, ...data];
  const sum = body.reduce((a, b) => a + b, 0) & 0xff;
  const pkt = [0x55, cmd, 0, sum, ...body];
  if (pkt.length > 64) throw new Error('packet longer than 64 bytes');
  return pkt;
}

export function isReply(r: number[], cmd: number, offset: number, len: number): boolean {
  return r[0] === 0xaa && r[1] === cmd && r[5] === (offset & 0xff) && r[6] === ((offset >> 8) & 0xff) && r[4] <= len;
}

export interface Info { firmware: string; buildDate: string; reportRateBoost: boolean }

export function parseInfo(d: number[]): Info {
  return {
    firmware: ((d[1] << 8) | d[0]).toString(16),
    buildDate: String.fromCharCode(...d.slice(2, 22)).replace(/\0+$/, ''),
    reportRateBoost: (d[6] & 1) === 1,
  };
}

export interface Profiles { active: number; count: number; order: number[]; raw: number[] }

export function parseBase(d: number[]): Profiles {
  const order = d.slice(2, 2 + PROFILES);
  return { active: order[d[0]], count: d[1], order, raw: d };
}

export interface Lighting {
  effect: number;
  brightness: number;
  speed: number;
  direction: number;
  customColorDisabled: boolean;
  color: string;
  sideEffect: number;
  sideBrightness: number;
  sideSpeed: number;
  sideColor: string;
  sideCustomColorDisabled: boolean;
  reportRateIndex: number;
}

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

export function parseLighting(e: number[]): Lighting {
  return {
    effect: e[8],
    brightness: e[9],
    speed: 4 - e[10],
    direction: e[11],
    customColorDisabled: e[12] === 1,
    color: hex(e[14], e[15], e[16]),
    sideEffect: e[24],
    sideBrightness: e[25],
    sideSpeed: 4 - e[26],
    sideColor: hex(e[29], e[30], e[31]),
    sideCustomColorDisabled: e[27] === 1,
    reportRateIndex: e[4] & 0x0f,
  };
}

export type LightingPatch = Partial<Pick<Lighting, 'effect' | 'brightness' | 'speed' | 'color' | 'direction' | 'customColorDisabled'
  | 'sideEffect' | 'sideBrightness' | 'sideSpeed' | 'sideColor' | 'sideCustomColorDisabled'>>;

// Applies a patch to a copy of the 64-byte block; untouched bytes stay as read.
export function applyLighting(block: number[], p: LightingPatch): number[] {
  const e = block.slice();
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  if (p.effect != null) e[8] = byte(p.effect);
  if (p.brightness != null) e[9] = byte(p.brightness);
  if (p.speed != null) e[10] = 4 - Math.max(0, Math.min(4, Math.round(p.speed)));
  if (p.direction != null) e[11] = byte(p.direction);
  // picking a colour turns custom colour on, like the vendor's palette
  const rgb = (c: string, at: number, flag: number) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    if (!m) throw new Error('colour must be #rrggbb');
    e[flag] = 0;
    for (let i = 0; i < 3; i++) e[at + i] = parseInt(m[i + 1], 16);
  };
  if (p.color) rgb(p.color, 14, 12);
  if (p.customColorDisabled != null) e[12] = p.customColorDisabled ? 1 : 0;
  // LOGO (side) light: bytes 24 effect, 25 brightness, 26 = 4 - speed, 27 custom colour off, 29-31 colour
  if (p.sideEffect != null) e[24] = byte(p.sideEffect);
  if (p.sideBrightness != null) e[25] = byte(p.sideBrightness);
  if (p.sideSpeed != null) e[26] = 4 - Math.max(0, Math.min(4, Math.round(p.sideSpeed)));
  if (p.sideColor) rgb(p.sideColor, 29, 27);
  if (p.sideCustomColorDisabled != null) e[27] = p.sideCustomColorDisabled ? 1 : 0;
  return e;
}

export interface KeyEntry { index: number; type: number; code1: number; code2: number }

export function parseKeymap(d: number[]): KeyEntry[] {
  const keys: KeyEntry[] = [];
  for (let i = 0; i < KEY_COUNT; i++) keys.push({ index: i, type: d[3 * i], code1: d[3 * i + 1], code2: d[3 * i + 2] });
  return keys;
}

export type ReportRatePatch = { reportRateIndex: number };

export function applyReportRate(block: number[], index: number): number[] {
  const e = block.slice();
  e[4] = (e[4] & 0xf0) | (index & 0x0f);
  return e;
}

// Macros: one shared 8 KB region (Jet 75 II has ordered profiles, see PROTOCOL.md).
// Layout: 16 LE pointers, then [0x81, 0x7E, mode x16, pad], then 4-byte actions from offset 64.
export const MACRO_COUNT = 16;
export const MACRO_HEADER = 64;
export const MACRO_READ_SIZE = 1024;
export const MIN_MACRO_DELAY = 5;

export interface MacroAction { kind: 'key' | 'modifier' | 'mouse'; down: boolean; code: number; delay: number }
export interface Macro { mode: number; actions: MacroAction[] }

const MOD_BITS: Record<number, number> = { 1: 0xe0, 2: 0xe1, 4: 0xe2, 8: 0xe3, 16: 0xe4, 32: 0xe5, 64: 0xe6, 128: 0xe7 };

export function parseMacros(d: number[]): Macro[] {
  const hasModes = d[32] === 0x81 && d[33] === 0x7e;
  const macros: Macro[] = [];
  for (let m = 0; m < MACRO_COUNT; m++) {
    const actions: MacroAction[] = [];
    for (let p = d[2 * m] | (d[2 * m + 1] << 8); p + 4 <= d.length; p += 4) {
      const [lo, hi, flags, code] = d.slice(p, p + 4);
      const kind = flags & 0x3f;
      if (kind === 1 || kind === 2 || kind === 3) {
        actions.push({
          kind: kind === 1 ? 'modifier' : kind === 2 ? 'key' : 'mouse',
          down: (flags & 0x40) !== 0,
          code: kind === 1 ? MOD_BITS[code] ?? 0 : code,
          delay: (lo | (hi << 8)) + 1,
        });
      }
      if (flags & 0x80) break;
    }
    macros.push({ mode: hasModes ? d[34 + m] : 0, actions });
  }
  return macros;
}

function encodeActions(actions: MacroAction[]): number[] {
  if (actions.length === 0) return [0, 0, 0x80, 0];
  return actions.flatMap((a, i) => {
    const delay = Math.max(MIN_MACRO_DELAY, Math.min(0xffff, Math.round(a.delay))) - 1;
    const kind = a.kind === 'modifier' || a.code >= 0xe0 ? 1 : a.kind === 'mouse' ? 3 : 2;
    const flags = kind | (a.down ? 0x40 : 0) | (i === actions.length - 1 ? 0x80 : 0);
    return [delay & 0xff, (delay >> 8) & 0xff, flags, kind === 1 ? 1 << (a.code & 0x0f) : a.code & 0xff];
  });
}

export function encodeMacros(macros: Macro[]): number[] {
  const pointers = new Array(2 * MACRO_COUNT).fill(0);
  const modes = new Array(2 * MACRO_COUNT).fill(0);
  modes[0] = 0x81;
  modes[1] = 0x7e;
  const data = encodeActions([]); // shared empty macro at offset 64
  for (let m = 0; m < MACRO_COUNT; m++) {
    const macro = macros[m] ?? { mode: 0, actions: [] };
    let ptr = MACRO_HEADER;
    if (macro.actions.length > 0) {
      ptr = MACRO_HEADER + data.length;
      data.push(...encodeActions(macro.actions));
    }
    pointers[2 * m] = ptr & 0xff;
    pointers[2 * m + 1] = (ptr >> 8) & 0xff;
    modes[m + 2] = macro.mode & 0xff;
  }
  return [...pointers, ...modes, ...data];
}

// Performance switches in the funcConfig block (see docs/PROTOCOL.md, "Settings block").
export interface Performance {
  macMode: boolean; // byte 1 bit 1, confirmed by toggling it in the vendor app; bit 3 is set on this unit and must be kept
  lockWin: boolean;
  lockAltTab: boolean;
  lockAltF4: boolean;
  tachyon: boolean;
  stability: boolean; // anti-mistouch
  adaptiveCalibration: boolean; // the SDK's travelCheck
  debounce: number;
}

export function parsePerformance(e: number[]): Performance {
  return {
    macMode: ((e[1] >> 1) & 1) === 1,
    lockWin: (e[6] & 1) === 1,
    lockAltTab: ((e[6] >> 1) & 1) === 1,
    lockAltF4: ((e[6] >> 2) & 1) === 1,
    tachyon: (e[7] & 1) === 1,
    stability: ((e[7] >> 1) & 1) === 1,
    adaptiveCalibration: ((e[7] >> 2) & 1) === 1,
    debounce: (e[7] >> 5) & 7,
  };
}

export function applyPerformance(block: number[], p: Partial<Performance>): number[] {
  const e = block.slice();
  const bit = (byte: number, n: number, on?: boolean) => {
    if (on != null) e[byte] = on ? e[byte] | (1 << n) : e[byte] & ~(1 << n);
  };
  bit(1, 1, p.macMode);
  bit(6, 0, p.lockWin);
  bit(6, 1, p.lockAltTab);
  bit(6, 2, p.lockAltF4);
  bit(7, 0, p.tachyon);
  bit(7, 1, p.stability);
  bit(7, 2, p.adaptiveCalibration);
  if (p.debounce != null) e[7] = (e[7] & ~0xe0) | ((p.debounce & 7) << 5);
  return e;
}

// Per-key trigger (magnetic switches): 8 bytes per key, 1024 bytes per profile (see docs/PROTOCOL.md, "Per-key trigger").
// Distances are in 0.01 mm. keyMode 1 is the factory setting; which mode enables rapid trigger is [unverified].
export const TRIGGER_SIZE = 1024;
export interface Trigger {
  switchType: number;
  keyMode: number;
  priority: number;
  actuation: number;
  pressPrecision: number;
  releasePrecision: number;
  rtPress: number;
  rtRelease: number;
  pressDeadzone: number;
  releaseDeadzone: number;
}

export function parseTriggers(d: number[]): Trigger[] {
  const out: Trigger[] = [];
  for (let i = 0; i + 8 <= d.length && i / 8 < KEY_COUNT; i += 8) {
    const o = d.slice(i, i + 8);
    out.push({
      switchType: o[0] & 0x0f,
      keyMode: o[1] & 0x0f,
      priority: o[1] >> 4,
      actuation: (o[2] | ((o[3] & 1) << 8)) + 1,
      pressPrecision: (o[3] >> 3) & 3,
      releasePrecision: (o[3] >> 1) & 3,
      rtPress: (o[4] | ((o[5] & 1) << 8)) + 1,
      rtRelease: (o[6] | ((o[7] & 1) << 8)) + 1,
      pressDeadzone: (o[5] >> 1) & 0x7f,
      releaseDeadzone: (o[7] >> 1) & 0x7f,
    });
  }
  return out;
}

export function encodeTrigger(t: Trigger): number[] {
  const a = Math.max(0, t.actuation - 1);
  const p = Math.max(0, t.rtPress - 1);
  const r = Math.max(0, t.rtRelease - 1);
  return [
    0xa0 | (t.switchType & 0x0f),
    t.priority ? (t.priority << 4) | t.keyMode : t.keyMode,
    a & 0xff,
    ((a >> 8) & 1) | ((t.pressPrecision & 3) << 3) | ((t.releasePrecision & 3) << 1),
    p & 0xff,
    ((p >> 8) & 1) | (Math.max(0, t.pressDeadzone) << 1),
    r & 0xff,
    ((r >> 8) & 1) | (Math.max(0, t.releaseDeadzone) << 1),
  ];
}

// A plain key entry: modifiers (HID 0xE0–0xE7) are a bit in code1 with code2 = 0, as in the vendor's
// default keymap ({type:16, code1:2, code2:0} = Shift); other keys are [0x10, 0, usage].
export const keyRef = (usage: number): KeyRef =>
  usage >= 0xe0 && usage <= 0xe7 ? [0x10, 1 << (usage - 0xe0), 0] : [0x10, 0, usage & 0xff];

// MT key entries carry the hold time in code2, in 10 ms steps (vendor default 150 ms = 15; 0 makes the key dead).
// Confirmed by saving an MT in the vendor app: F11 became [0x92, 0, 0x0c] for 120 ms.
export const MT_DEFAULT_HOLD_MS = 150;
export const mtEntry = (slot: number, holdMs = MT_DEFAULT_HOLD_MS): KeyRef =>
  [0x92, slot, Math.max(1, Math.min(255, Math.round(holdMs / 10)))];

// Advanced keys: 32 slots per profile each. A key bound to slot n is [0x90 dks | 0x91 tgl | 0x92 mt, n, x]
// (see docs/PROTOCOL.md, "Key entries").
export const ADV_SLOTS = 32;
export const AdvType = { dks: 0x90, tgl: 0x91, mt: 0x92 } as const;
export const DKS = { size: 768, slot: 24 } as const;
export const MT = { size: 256, slot: 6 } as const;
export const TGL = { size: 128, slot: 3 } as const;

export type KeyRef = [number, number, number];
export interface MtSlot { tap: KeyRef; hold: KeyRef }
export interface DksSlot { points: number[]; keys: { key: KeyRef; phases: number }[] }

export const parseMt = (d: number[]): MtSlot[] =>
  Array.from({ length: ADV_SLOTS }, (_, i) => ({
    tap: d.slice(6 * i, 6 * i + 3) as KeyRef,
    hold: d.slice(6 * i + 3, 6 * i + 6) as KeyRef,
  }));
export const encodeMt = (slots: MtSlot[]): number[] => slots.flatMap((s) => [...s.tap, ...s.hold]);

export const parseTgl = (d: number[]): KeyRef[] =>
  Array.from({ length: ADV_SLOTS }, (_, i) => d.slice(3 * i, 3 * i + 3) as KeyRef);
export const encodeTgl = (slots: KeyRef[]): number[] => slots.flat();

// DKS slot: 4 trigger points, then 4 × [key type, code1, code2, phase bits lo, hi] (see docs/PROTOCOL.md).
export const parseDks = (d: number[]): DksSlot[] =>
  Array.from({ length: ADV_SLOTS }, (_, i) => {
    const s = d.slice(24 * i, 24 * i + 24);
    return {
      points: s.slice(0, 4),
      keys: [0, 1, 2, 3].map((k) => ({
        key: s.slice(5 * k + 4, 5 * k + 7) as KeyRef,
        phases: s[5 * k + 7] | (s[5 * k + 8] << 8),
      })),
    };
  });
export const encodeDks = (slots: DksSlot[]): number[] =>
  slots.flatMap((s) => {
    const out = new Array(24).fill(0);
    s.points.forEach((p, i) => (out[i] = p));
    s.keys.forEach((k, i) => {
      out[5 * i + 4] = k.key[0];
      out[5 * i + 5] = k.key[1];
      out[5 * i + 6] = k.key[2];
      out[5 * i + 7] = k.phases & 0xff;
      out[5 * i + 8] = (k.phases >> 8) & 0xff;
    });
    return out;
  });

// A resolved built-in configuration (see presets.ts). Applying one writes the key map, lighting,
// performance switches and per-key triggers of a profile, and clears its advanced keys. The polling rate is left as it is.
export interface Preset {
  id: number;
  name: string;
  help: string;
  keys: KeyRef[][];
  lighting: { effect: number; brightness: number; speed: number; direction: number; customColorDisabled: boolean; color: string };
  performance: Partial<Performance>;
  triggers: Trigger[];
}

// A whole profile as raw bytes. Used for custom configs (saved in the app) and exported .json files.
export const SNAPSHOT_FORMAT = 'jet75-profile/1';
export interface Snapshot {
  format: string;
  keys: number[][]; // 4 layers × 384 bytes
  settings: number[]; // 64
  triggers: number[]; // 1024
  dks: number[]; // 768
  mt: number[]; // 256
  tgl: number[]; // 128
}

export function checkSnapshot(s: Snapshot) {
  const bytes = (a: unknown, n: number) =>
    Array.isArray(a) && a.length === n && a.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);
  if (!s || s.format !== SNAPSHOT_FORMAT) throw new Error('not a Jet 75 configuration file');
  if (!Array.isArray(s.keys) || s.keys.length !== LAYERS || !s.keys.every((l) => bytes(l, 3 * KEY_COUNT)) ||
    !bytes(s.settings, FUNC_SIZE) || !bytes(s.triggers, TRIGGER_SIZE) || !bytes(s.dks, DKS.size) ||
    !bytes(s.mt, MT.size) || !bytes(s.tgl, TGL.size)) {
    throw new Error('the configuration file is damaged or incomplete');
  }
}

// Profile names: a JSON array of all names, UTF-8, padded with 0xFF, stored in each profile's custom data
// area (1024 bytes per profile) at offset 336, 280 bytes long. Written to every profile at once.
export const CUSTOM_SIZE = 1024;
export const NAMES_OFFSET = 336;
export const NAMES_SIZE = 280;

export function decodeNames(d: number[]): string[] {
  const end = d.indexOf(0xff);
  try {
    const v = JSON.parse(Buffer.from(d.slice(0, end < 0 ? d.length : end)).toString('utf8'));
    return Array.isArray(v) ? v.map((s) => (typeof s === 'string' ? s : '')) : [];
  } catch {
    return [];
  }
}

// Returns the bytes to write: the JSON rounded up to whole 56-byte packets.
export function encodeNames(names: string[]): number[] {
  const json = Array.from(Buffer.from(JSON.stringify(names), 'utf8'));
  if (json.length > NAMES_SIZE) throw new Error('profile names are too long');
  const out = new Array(NAMES_SIZE).fill(0xff);
  json.forEach((b, i) => (out[i] = b));
  return out.slice(0, Math.min(56 * Math.ceil((json.length + 1) / 56), NAMES_SIZE));
}

export const keymapOffset = (profile: number, layer: number) => KEY_AREA * (LAYERS * profile + layer);
export const keyWriteOffset = (profile: number, layer: number, index: number) =>
  LAYERS * KEY_AREA * profile + KEY_AREA * layer + 3 * index;
