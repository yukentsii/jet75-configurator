// Renderer: plain script (no modules), talks to the main process through window.jet75.
// Layout and flow follow the vendor driver: profiles in a sidebar, six tabs over a centred keyboard,
// per-tab panels below. Changes apply to the keyboard straight away, like the vendor's.

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
interface Lighting {
  effect: number; brightness: number; speed: number; direction: number; customColorDisabled: boolean;
  color: string; sideEffect: number; sideBrightness: number; sideSpeed: number; sideColor: string;
  sideCustomColorDisabled: boolean; reportRateIndex: number;
}
interface KeyEntry { index: number; type: number; code1: number; code2: number }
interface Profiles { active: number; count: number; order: number[] }
interface MacroAction { kind: 'key' | 'modifier' | 'mouse'; down: boolean; code: number; delay: number }
interface Macro { mode: number; actions: MacroAction[] }
interface Connected {
  info: { firmware: string; buildDate: string };
  profiles: Profiles;
  writes: { lighting: boolean; keymap: boolean; profile: boolean; macros: boolean };
}
interface Performance {
  macMode: boolean; lockWin: boolean; lockAltTab: boolean; lockAltF4: boolean; tachyon: boolean; stability: boolean; adaptiveCalibration: boolean; debounce: number;
}
interface Trigger {
  switchType: number; keyMode: number; priority: number; actuation: number; pressPrecision: number; releasePrecision: number;
  rtPress: number; rtRelease: number; pressDeadzone: number; releaseDeadzone: number;
}
type KeyRef = [number, number, number];
interface MtSlot { tap: KeyRef; hold: KeyRef }
interface DksSlot { points: number[]; keys: { key: KeyRef; phases: number }[] }
interface Advanced { dks: DksSlot[]; mt: MtSlot[]; tgl: KeyRef[] }
type AdvKind = 'rs' | 'socd' | 'mt' | 'tgl' | 'dks';
interface Preset { id: number; name: string; help: string }
interface LightStore { schemes: { id: string; name: string; colors: string[] }[]; gifs: { id: string; name: string; frames: string[][]; delays: number[] }[] }
declare const jet75: Record<string, (...args: unknown[]) => Promise<Result<any>>>;

// Physical position of each matrix index: [x, y, width] in key units, plus the HID usage it sends by default
// (0xff = fn). Read from the keyboard's factory layer and placed on the jet 75's 75% plate.
const LAYOUT: [number, number, number, number][] = [
  [1.72,2.43,1,20],[3.91,2.43,1,8],[7.19,2.43,1,28],[12.05,1.33,1,45],[14.07,3.53,2.38,40],[8.07,0,1,63],[4.67,4.62,1,6],
  [11.24,4.62,1,55],[14.36,5.72,1,80],[16.55,0,1,76],[2.03,3.53,1,4],[4.22,3.53,1,7],[6.41,3.53,1,10],[10.48,2.43,1,18],
  [16.55,2.43,1,75],[6.98,0,1,62],[3.57,4.62,1,27],[10.14,4.62,1,54],[15.45,4.62,1,82],[16.55,1.33,1,74],[2.48,4.62,1,29],
  [5,2.43,1,21],[7.5,3.53,1,11],[11.57,2.43,1,19],[16.55,3.53,1,78],[5.48,0,1,61],[6.86,4.62,1,5],[9.69,3.53,1,14],
  [13.43,4.62,1.93,229],[15.45,5.72,1,81],[1.1,1.33,1,30],[4.38,1.33,1,33],[7.67,1.33,1,36],[10.95,1.33,1,39],
  [14.86,2.43,1.6,49],[9.17,0,1,64],[5.76,4.62,1,25],[11.22,5.72,1.29,255],[12.6,5.72,1.29,228],[16.55,5.72,1,79],
  [0,1.33,1,53],[3.29,1.33,1,32],[6.1,2.43,1,23],[9.38,2.43,1,12],[14.24,1.33,2.21,42],[10.26,0,1,65],[0,5.72,1.29,224],
  [8.6,3.53,1,13],[10.79,3.53,1,15],[15.05,0,1,69],[0,0,1,41],[2.19,1.33,1,31],[5.48,1.33,1,34],[8.76,1.33,1,37],
  [13.14,1.33,1,46],[4.38,0,1,60],[2.76,5.72,1.29,226],[9.05,4.62,1,16],[12.33,4.62,1,56],[13.95,0,1,68],[0,3.53,1.93,57],
  [3.12,3.53,1,22],[5.31,3.53,1,9],[8.29,2.43,1,24],[13.76,2.43,1,48],[2.19,0,1,58],[0,4.62,2.38,225],[7.95,4.62,1,17],
  [11.88,3.53,1,51],[11.76,0,1,66],[0,2.43,1.62,43],[2.81,2.43,1,26],[6.57,1.33,1,35],[9.86,1.33,1,38],[12.67,2.43,1,47],
  [3.29,0,1,59],[1.38,5.72,1.29,227],[4.14,5.72,6.98,44],[12.98,3.53,1,52],[12.86,0,1,67],
];
// The plate is 17.55 × 6.72 key units. On screen the key caps are 1 unit minus the gap the layout leaves.
const KBD_W = 17.55;
const KBD_H = 6.72;

// Full-size picker for the basic sub-tab: rows of [usage, width] with null gaps, numpad keys may be 2 high.
type PickRow = (number | [number, number] | [number, number, number] | null | [null, number])[];
const PICK_ROWS: PickRow[] = [
  [0x29, [null, 1], 0x3a, 0x3b, 0x3c, 0x3d, [null, 0.5], 0x3e, 0x3f, 0x40, 0x41, [null, 0.5], 0x42, 0x43, 0x44, 0x45, [null, 0.25], 0x46, 0x47, 0x48],
  [0x35, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x2d, 0x2e, [0x2a, 2], [null, 0.25], 0x49, 0x4a, 0x4b, [null, 0.25], 0x53, 0x54, 0x55, 0x56],
  [[0x2b, 1.5], 0x14, 0x1a, 0x08, 0x15, 0x17, 0x1c, 0x18, 0x0c, 0x12, 0x13, 0x2f, 0x30, [0x31, 1.5], [null, 0.25], 0x4c, 0x4d, 0x4e, [null, 0.25], 0x5f, 0x60, 0x61, [0x57, 1, 2]],
  [[0x39, 1.75], 0x04, 0x16, 0x07, 0x09, 0x0a, 0x0b, 0x0d, 0x0e, 0x0f, 0x33, 0x34, [0x28, 2.25], [null, 3.5], 0x5c, 0x5d, 0x5e],
  [[0xe1, 2.25], 0x1d, 0x1b, 0x06, 0x19, 0x05, 0x11, 0x10, 0x36, 0x37, 0x38, [0xe5, 2.75], [null, 1.25], 0x52, [null, 1.25], 0x59, 0x5a, 0x5b, [0x58, 1, 2]],
  [[0xe0, 1.25], [0xe3, 1.25], [0xe2, 1.25], [0x2c, 6.25], [0xe6, 1.25], [0xe7, 1.25], [0x65, 1.25], [0xe4, 1.25], [null, 0.25], 0x50, 0x51, 0x4f, [null, 0.25], [0x62, 2], 0x63],
];

// Effect values and names, see docs/PROTOCOL.md.
// Each effect with the icon its button uses.
const EFFECTS: Record<number, [string, string]> = {
  0: ['Custom', 'e-dot'], 1: ['Rainbow Cycle', 'e-rainbow'], 2: ['Linear Grad', 'e-linear'], 3: ['Constant On', 'e-const'],
  4: ['Breath', 'e-breath'], 5: ['Disco', 'e-disco'], 6: ['Horiz Wave', 'e-hwave'], 7: ['Vert Wave', 'e-vwave'],
  8: ['Center Spread', 'e-spread'], 9: ['Star Twinkle', 'e-star'], 10: ['Center Spin', 'e-spin'], 11: ['Bottom Up', 'e-bottom'],
  12: ['Recip Rebound', 'e-recip'], 13: ['Key Ripple', 'e-kripple'], 14: ['Solid Ripple', 'e-ripple'], 15: ['Key Trail', 'e-trail'],
  16: ['Key Firework', 'e-kfire'], 17: ['Key Beam', 'e-beam'], 18: ['Diag Flow', 'e-diag'], 19: ['Laser Rain', 'e-rain'],
  20: ['Dot Twinkle', 'e-dots'], 21: ['Fireworks', 'e-fire'], 22: ['Triangle Bounce', 'e-tri'],
};
// The vendor's grid order, row by row.
const EFFECT_ORDER = [6, 7, 8, 9, 4, 1, 5, 3, 2, 11, 12, 10, 18, 19, 20, 21, 22, 14, 13, 15, 16, 17];
const EFFECT_OFF = 255;
// The LOGO light has its own short list (funcConfig byte 24); 3 is off.
const LOGO_EFFECTS: [number, string, string][] = [[0, 'Rainbow Cycle', 'e-rainbow'], [1, 'Constant On', 'e-const'], [2, 'Breath', 'e-breath'], [3, 'Off', 'e-dot']];
const LOGO_OFF = 3;
const EFFECT_CUSTOM = 0;
// The official app offers 3 onboard configs on this model.
const MAX_ONBOARD = 3;
// Stored rate index for each vendor option, verified by setting each option in the vendor app and reading it back.
const RATES: [string, number][] = [['1k', 4], ['2k', 3], ['4k', 2], ['8k', 1]];
const SWATCHES = ['#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'];

const HID_NAMES: Record<number, string> = (() => {
  const n: Record<number, string> = { 0: 'None', 0xff: 'Fn' };
  for (let i = 0; i < 26; i++) n[0x04 + i] = String.fromCharCode(65 + i);
  '1234567890'.split('').forEach((c, i) => (n[0x1e + i] = c));
  Object.assign(n, {
    0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space', 0x2d: '-', 0x2e: '=', 0x2f: '[', 0x30: ']',
    0x31: '\\', 0x33: ';', 0x34: "'", 0x35: '`', 0x36: ',', 0x37: '.', 0x38: '/', 0x39: 'Caps', 0x46: 'Print',
    0x47: 'Scroll', 0x48: 'Pause', 0x49: 'Insert', 0x4a: 'Home', 0x4b: 'PgUp', 0x4c: 'Delete', 0x4d: 'End', 0x4e: 'PgDn',
    0x4f: '→', 0x50: '←', 0x51: '↓', 0x52: '↑', 0x53: 'Num', 0x54: '/', 0x55: '*', 0x56: '-', 0x57: '+', 0x58: 'Enter',
    0x62: '0', 0x63: '.', 0x64: 'ISO \\', 0x65: 'Menu',
    0xe0: 'Ctrl', 0xe1: 'Shift', 0xe2: 'Alt', 0xe3: 'Win', 0xe4: 'Ctrl', 0xe5: 'Shift', 0xe6: 'Alt', 0xe7: 'Win',
  });
  for (let i = 0; i < 9; i++) n[0x59 + i] = String(i + 1);
  for (let i = 0; i < 12; i++) n[0x3a + i] = 'F' + (i + 1);
  return n;
})();
// Caps show both legends, like printed keycaps.
const SHIFTED: Record<number, string> = {
  0x35: '` ~', 0x1e: '1 !', 0x1f: '2 @', 0x20: '3 #', 0x21: '4 $', 0x22: '5 %', 0x23: '6 ^', 0x24: '7 &', 0x25: '8 *',
  0x26: '9 (', 0x27: '0 )', 0x2d: '- _', 0x2e: '= +', 0x2f: '[ {', 0x30: '] }', 0x31: '\\ |', 0x33: '; :', 0x34: '\' "',
  0x36: ', <', 0x37: '. >', 0x38: '/ ?',
};
const capLabel = (usage: number) => SHIFTED[usage] ?? HID_NAMES[usage] ?? `0x${usage.toString(16)}`;

// KeyboardEvent.code -> HID usage, for remapping by key press and for recording macros.
const CODE_TO_HID: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < 26; i++) m['Key' + String.fromCharCode(65 + i)] = 0x04 + i;
  for (let i = 1; i <= 9; i++) m['Digit' + i] = 0x1d + i;
  m.Digit0 = 0x27;
  for (let i = 1; i <= 12; i++) m['F' + i] = 0x39 + i;
  Object.assign(m, {
    Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c, Minus: 0x2d, Equal: 0x2e, BracketLeft: 0x2f,
    BracketRight: 0x30, Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35, Comma: 0x36, Period: 0x37,
    Slash: 0x38, CapsLock: 0x39, PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48, Insert: 0x49, Home: 0x4a, PageUp: 0x4b,
    Delete: 0x4c, End: 0x4d, PageDown: 0x4e, ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52,
    IntlBackslash: 0x64, ContextMenu: 0x65, ControlLeft: 0xe0, ShiftLeft: 0xe1, AltLeft: 0xe2, MetaLeft: 0xe3,
    ControlRight: 0xe4, ShiftRight: 0xe5, AltRight: 0xe6, MetaRight: 0xe7,
  });
  return m;
})();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = (tag: string, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const icon = (id: string, cls = 'ic') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls);
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#' + id);
  s.append(u);
  return s;
};

const state = {
  tab: 'lighting',
  sub: 'basic',
  zone: 'back' as 'back' | 'logo',
  lightMode: 'normal' as 'normal' | 'custom' | 'music',
  keyColors: [] as string[], // per-key colours of the Custom effect
  paintSel: new Set<number>(),
  paint: '#ffffff',
  lights: { schemes: [], gifs: [] } as LightStore,
  scheme: 'default', // selected static lighting entry
  playing: '', // name of the effect being streamed, '' when none
  liveFrame: null as string[] | null,
  showKbd: true,
  profile: 0,
  layer: 0,
  writes: { lighting: false, keymap: false, profile: false, macros: false },
  profiles: null as Profiles | null,
  lighting: null as Lighting | null,
  keys: [] as KeyEntry[],
  macros: [] as Macro[],
  selected: -1,
  editingMacro: -1,
  recorded: [] as MacroAction[],
  recording: false,
  lastEventAt: 0,
  perf: null as Performance | null,
  triggers: [] as Trigger[],
  trigSel: new Set<number>(),
  trigView: 'actuation',
  separate: false,
  adv: null as Advanced | null,
  base: [] as KeyEntry[], // layer 1 of the profile, where advanced keys are bound
  advKind: 'mt' as AdvKind,
  advKey: -1,
  rsKey2: -1,
  rsPick: 1 as 1 | 2, // which RS key the next keyboard click sets
  socdMode: -1, // SOCD trigger condition being edited, -1 until loaded
  travel: [] as number[], // live key travel per matrix index
  presets: [] as Preset[],
  names: [] as string[],
  custom: [] as CustomItem[],
  testPress: [] as string[],
  testRelease: [] as string[],
};

function showError(msg: string | null) {
  $('error').hidden = !msg;
  $('error').textContent = msg ?? '';
}

let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 2200);
}

async function call<T>(name: string, ...args: unknown[]): Promise<T | null> {
  const r = await jet75[name](...args);
  if (!r.ok) { showError(r.error); return null; }
  showError(null);
  return r.value as T;
}

// Key Config sub-tab lists, as the vendor shows them: [keycode (type << 16 | code1 << 8 | code2), name, short cap label].
type FuncItem = [number, string, string?];
const FUNC_LISTS: Record<string, FuncItem[]> = {
  mouse: [
    [0x200100, 'Left mouse button', 'LMB'], [0x200200, 'Right mouse button', 'RMB'], [0x200400, 'Middle mouse button', 'MMB'],
    [0x201000, 'Mouse forward', 'M Fwd'], [0x200800, 'Mouse backward', 'M Back'], [0x210001, 'Wheel up', 'Wheel ↑'], [0x2100ff, 'Wheel down', 'Wheel ↓'],
  ],
  media: [
    [0x30cd00, 'Play/Pause', 'Play'], [0x30e200, 'Mute'], [0x30b700, 'Stop'], [0x30b600, 'Previous Song', 'Prev'],
    [0x30b500, 'Next Song', 'Next'], [0x30e900, 'Volume +', 'Vol +'], [0x30ea00, 'Volume -', 'Vol -'],
  ],
  lighting: [
    [0xf02f00, 'Backlight Mode Switch→', 'Mode →'], [0xf02e00, 'Backlight Mode Switch←', 'Mode ←'],
    [0xf03200, 'Backlight brightness +', 'Bri +'], [0xf03300, 'Backlight brightness -', 'Bri -'],
    [0xf03600, 'Backlight speed +', 'Spd +'], [0xf03700, 'Backlight speed -', 'Spd -'],
    [0xf03d00, 'Switch backlight color→', 'Color →'], [0xf03c00, 'Switch backlight color←', 'Color ←'],
    [0xf03500, 'Toggle keyboard backlight', 'Light'], [0xf0a000, 'LOGO Light Mode Switch', 'Logo Mode'],
    [0xf01500, 'LOGO Light +', 'Logo +'], [0xf01600, 'LOGO Light -', 'Logo -'], [0xf01800, 'Logo Light Speed+', 'Logo Spd+'],
    [0xf01700, 'LOGO Light Speed-', 'Logo Spd-'], [0xf01900, 'LOGO Light Speed Switch', 'Logo Spd'],
    [0xf01a00, 'LOGO Light Color Switch', 'Logo Color'], [0xf01c00, 'LOGO Light On/Off', 'Logo On'],
  ],
  ext: [
    [0x10012d, 'Zoom out'], [0x10012e, 'Zoom in'], [0x100127, 'Reset'], [0x10011c, 'Restore'], [0x10011d, 'Undo'],
    [0x100104, 'Select all', 'Sel All'], [0x100111, 'Create'], [0x100106, 'Copy'], [0x10011b, 'Cut'], [0x100119, 'Paste'],
    [0x100116, 'Save'], [0x100112, 'Open'], [0x100117, 'New Item', 'New'], [0x10011a, 'Close item', 'Close'],
    [0x100450, 'Back (keyboard)', 'Back'], [0x10044f, 'Forward (keyboard)', 'Fwd'], [0x10082b, 'switch window', 'Switch'],
    [0x100807, 'Show desktop', 'Desktop'], [0x100958, 'Open navigation', 'Nav'], [0x100817, 'Cycle taskbar Apps', 'Taskbar'],
    [0x100804, 'Action center', 'Action'], [0x100808, 'File Explorer', 'Explorer'], [0x10080c, 'Windows settings center', 'Settings'],
    [0x10080f, 'Lock computer', 'Lock'], [0x10080e, 'Cast screen to other devices', 'Cast'], [0x100805, 'Jump to tray', 'Tray'],
    [0x10080a, 'Start Xbox game bar', 'Game Bar'], [0x100815, 'Run'], [0x100816, 'Search'], [0x100818, 'Display settings', 'Display'],
    [0x10081b, 'Simple menu', 'Menu'], [0x100837, 'Emoji box', 'Emoji'], [0x100129, 'Start menu', 'Start'], [0x10042b, 'Taskbar'],
    [0x10043d, 'Close window', 'Close Win'], [0x100429, 'Switch to next App', 'Next App'], [0x302302, 'Browser homepage', 'Home Page'],
    [0x309201, 'Calculator', 'Calc'], [0x308a01, 'Mail'], [0x309401, 'My computer', 'My PC'], [0x302a02, 'Favorites', 'Fav'],
    [0x10054c, 'Windows security screen', 'Security'], [0x100329, 'Task Manager', 'Task Mgr'], [0x306f00, 'Screen brightness +', 'Scr +'],
    [0x307000, 'Screen brightness -', 'Scr -'], [0x302102, 'Search (Web)', 'Web Search'], [0x302702, 'Refresh (web page)', 'Refresh'],
    [0xf0fa00, 'Switch to onboard', 'Onboard'], [0x100000, 'Disable', 'None'], [0xf0ff01, 'Win Fn'],
  ],
};
const FUNC_BY_CODE = new Map<number, FuncItem>(Object.values(FUNC_LISTS).flat().map((f) => [f[0], f]));
const codeOf = (k: { type: number; code1: number; code2: number }) => (k.type << 16) | (k.code1 << 8) | k.code2;

const MOD_NAMES = ['Ctrl', 'Shift', 'Alt', 'Win', 'RCtrl', 'RShift', 'RAlt', 'RWin'];

function keyName(k: KeyEntry): string {
  const f = FUNC_BY_CODE.get(codeOf(k));
  if (f) return f[2] ?? f[1];
  if (k.type === 0xf0) return 'Fn';
  if (k.type === 0x93) return `RS${Math.floor(k.code1 / 2) + 1}`;
  if (k.type === 0x94) return `SOCD${Math.floor(k.code1 / 2) + 1}`;
  if (k.type === 0x70) return `M${k.code1 + 1}`;
  if (k.type === 0x90) return `DKS${k.code1 + 1}`;
  if (k.type === 0x91) return `TGL${k.code1 + 1}`;
  if (k.type === 0x92) return `MT${k.code1 + 1}`;
  if (k.type === 0x10) {
    if (k.code1 && !k.code2) return MOD_NAMES.filter((_, i) => k.code1 & (1 << i)).join('+');
    return capLabel(k.code2);
  }
  return `${k.type.toString(16)}:${k.code1.toString(16)}:${k.code2.toString(16)}`;
}

// The HID usage an entry sends, comparable with LAYOUT's default (modifier bits → 0xe0+bit).
function entryUsage(k: KeyEntry): number {
  if (k.type === 0xf0) return 0xff;
  if (k.type === 0x10 && k.code1 && !k.code2) return 0xe0 + Math.log2(k.code1);
  return k.type === 0x10 ? k.code2 : -1;
}

function actionText(a: MacroAction): string {
  return `${HID_NAMES[a.code] ?? (a.kind === 'mouse' ? 'Mouse ' + a.code : '0x' + a.code.toString(16))} ${a.down ? '↓' : '↑'} ${a.delay}ms`;
}

// Range inputs paint their filled part from --p.
function paintRange(r: HTMLInputElement) {
  const p = ((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100;
  r.style.setProperty('--p', `${p}%`);
}

// tabs

function setTab(tab: string) {
  const wasLive = state.tab === 'trigger' || state.tab === 'advanced';
  const live = tab === 'trigger' || tab === 'advanced';
  if (live !== wasLive && state.lighting) setTravel(live);
  state.tab = tab;
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  $('stage').hidden = tab === 'performance' || tab === 'others';
  if (tab !== 'keys') state.selected = -1;
  renderKeyboard();
  if (tab === 'trigger') renderTriggerPanel();
  if (tab === 'advanced') renderAdvanced();
}

function setSub(sub: string) {
  state.sub = sub;
  document.querySelectorAll<HTMLButtonElement>('#key-subtabs button[data-sub]').forEach((b) => b.classList.toggle('on', b.dataset.sub === sub));
  document.querySelectorAll<HTMLElement>('[data-sub-panel]').forEach((p) => (p.hidden = p.dataset.subPanel !== sub));
}

// keyboard views

function placeKey(b: HTMLElement, x: number, y: number, w: number, h = 1, gap = 0) {
  b.style.left = `calc(var(--pad, 0px) + var(--u) * ${x})`;
  b.style.top = `calc(var(--pad, 0px) + var(--u) * ${y})`;
  b.style.width = `calc(var(--u) * ${w - gap})`;
  b.style.height = `calc(var(--u) * ${h - gap})`;
}

function sizeBoard(board: HTMLElement) {
  board.style.width = `calc(var(--u) * ${KBD_W} + 2 * var(--pad))`;
  board.style.height = `calc(var(--u) * ${KBD_H} + 2 * var(--pad))`;
}

function renderKeyboard() {
  const kbd = $('kbd');
  const editing = state.tab === 'keys';
  const trig = state.tab === 'trigger';
  const adv = state.tab === 'advanced';
  const paint = state.tab === 'lighting' && state.zone === 'back' && state.lightMode === 'custom' && !state.playing;
  const colours = state.tab === 'lighting' ? state.liveFrame ?? (paint ? state.keyColors : null) : null;
  kbd.classList.toggle('pick', (editing && state.writes.keymap) || trig || adv || paint);
  sizeBoard(kbd);
  kbd.replaceChildren(...LAYOUT.map(([x, y, w, def], i) => {
    const b = el('button', 'key');
    b.dataset.index = String(i);
    placeKey(b, x, y, w);
    const entry = editing ? state.keys[i] : adv ? state.base[i] : undefined;
    if (entry) {
      b.textContent = keyName(entry);
      if (entryUsage(entry) !== def) b.classList.add('changed');
    } else {
      b.textContent = capLabel(def);
    }
    if (trig && state.trigView !== 'preview' && state.triggers[i]) b.append(el('span', 'v', triggerLabel(state.triggers[i])));
    if (trig && state.trigView === 'preview') b.append(el('span', 'v travel-v'));
    if (colours?.[i]) {
      b.style.background = colours[i];
      b.style.color = luminance(colours[i]) > 0.55 ? '#111' : '#f4ebd7';
    }
    if (trig ? state.trigSel.has(i) : adv ? i === state.advKey || i === state.rsKey2 : paint ? state.paintSel.has(i) : i === state.selected) b.classList.add('sel');
    b.onclick = () => (editing ? selectKey(i) : trig ? toggleTrigKey(i) : adv ? selectAdvKey(i) : undefined);
    // custom lighting: click or drag across keys to select them
    if (paint) {
      b.onpointerdown = (e) => { e.preventDefault(); paintDrag = !state.paintSel.has(i); togglePaint(i, paintDrag); };
      b.onpointerenter = (e) => { if (e.buttons & 1 && paintDrag != null) togglePaint(i, paintDrag); };
    }
    return b;
  }));

  $('trig-select').hidden = !trig;
  $('trig-views').hidden = !trig;
  // Layer buttons stand where the vendor has win / mac layers; layer n is stored at index n.
  $('layers').hidden = !(editing || adv);
  const names = [['i-win', 'Win Default'], ['i-win', 'Win Fn'], ['i-apple', 'Mac Default'], ['i-apple', 'Mac Fn']];
  const restore = el('button', 'outline-btn', 'Restore defaults') as HTMLButtonElement;
  restore.id = 'restore-layer';
  restore.disabled = adv || !state.writes.keymap;
  restore.onclick = restoreLayer;
  $('layers').replaceChildren(...names.map(([ic, label], i) => {
    const b = el('button', 'outline-btn' + ((adv ? 0 : state.layer) === i ? ' on' : '')) as HTMLButtonElement;
    b.dataset.layer = String(i);
    b.title = `layer ${i + 1}`;
    b.append(icon(ic), label);
    b.disabled = adv && i !== 0;
    b.onclick = () => { state.layer = i; state.selected = -1; loadKeys(); };
    return b;
  }), restore);
}

function renderPhotoKeyboard() {
  const p = $('photo-kbd');
  sizeBoard(p);
  p.replaceChildren(...LAYOUT.map(([x, y, w, def]) => {
    const b = el('span', 'key', capLabel(def));
    placeKey(b, x, y, w, 1, 0.02);
    return b;
  }));
}

// profiles sidebar

interface CustomItem { id: string; name: string }
type ListItem = { kind: 'preset'; id: number } | { kind: 'custom'; id: string };
type StoreResult = { custom?: CustomItem[]; profile?: number; names?: string[]; profiles?: Profiles };

const NAME_MAX = 15;
const MAX_CUSTOM = 19;

// A name the keyboard's own app stores as a reference to a built-in configuration, e.g. 'EQ<official@-5:0>QE'.
// Its number counts the vendor's list, which has one extra entry before the six configurations.
function profileName(i: number): string {
  const raw = state.names[i] ?? '';
  const ref = /^EQ<official@-(\d+):\d+>QE$/.exec(raw);
  if (ref) return state.presets.find((p) => p.id === Number(ref[1]) - 1)?.name ?? `Profile ${i + 1}`;
  return raw || `Profile ${i + 1}`;
}

function moreButton(label: string, open: (b: HTMLButtonElement) => void) {
  const more = el('button', 'icon-btn profile-more') as HTMLButtonElement;
  more.setAttribute('aria-label', `More for ${label}`);
  more.append(icon('i-dots'));
  more.onclick = (e) => { e.stopPropagation(); open(more); };
  return more;
}

function renderProfiles() {
  const p = state.profiles!;
  const enabled = p.order.slice(0, p.count);
  $('profile-count').textContent = `(${p.count}/${MAX_ONBOARD})`;
  const item = (i: number) => {
    const b = el('div', 'profile' + (i === p.active ? ' active' : '')) as HTMLDivElement;
    b.dataset.profile = String(i);
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    b.append(el('span', 'profile-name', profileName(i)), el('span', 'spacer'),
      moreButton(profileName(i), (m) => openMenu(m, { kind: 'onboard', profile: i })));
    b.onclick = () => i !== p.active && switchProfile(i);
    b.onkeydown = (e) => { if (e.key === 'Enter' && e.target === b) b.click(); };
    return b;
  };
  $('profiles').replaceChildren(...enabled.map(item));
  $('onboard-drop').classList.toggle('full', p.count >= MAX_ONBOARD);
}

// ⋮ menu: the same items for onboard configs and custom configs, like the official app's

type MenuTarget = { kind: 'onboard'; profile: number } | { kind: 'custom'; id: string };
let menuTarget: MenuTarget | null = null;

function openMenu(anchor: HTMLElement, target: MenuTarget) {
  const menu = $('profile-menu');
  if (!menu.hidden && JSON.stringify(menuTarget) === JSON.stringify(target)) { closeMenu(); return; }
  menuTarget = target;
  for (const b of Array.from(menu.querySelectorAll<HTMLButtonElement>("button"))) b.hidden = !(b.dataset.for ?? '').split(' ').includes(target.kind);
  (menu.querySelector('[data-act="delete"]') as HTMLButtonElement).disabled = target.kind === 'onboard' && state.profiles!.count <= 1;
  (menu.querySelector('[data-act="move"]') as HTMLButtonElement).disabled = state.custom.length >= MAX_CUSTOM;
  const r = anchor.getBoundingClientRect();
  menu.style.left = `${r.left - 150}px`;
  menu.style.top = `${r.bottom + 4}px`;
  menu.hidden = false;
}

function closeMenu() {
  $('profile-menu').hidden = true;
  menuTarget = null;
}

function initMenu() {
  $('profile-menu').onclick = async (e) => {
    const act = (e.target as HTMLElement).closest('button')?.dataset.act;
    const t = menuTarget;
    if (!act || !t) return;
    closeMenu();
    const name = t.kind === 'onboard' ? profileName(t.profile) : state.custom.find((c) => c.id === t.id)?.name ?? '';
    if (act === 'rename') openRename(t, name);
    if (act === 'delete') deleteTarget(t, name);
    if (act === 'export') {
      const ok = await call<boolean>(t.kind === 'onboard' ? 'exportProfile' : 'exportCustom', ...(t.kind === 'onboard' ? [t.profile, name] : [t.id]));
      if (ok) toast(`${name} exported`);
    }
    if (act === 'move' && t.kind === 'onboard') {
      const list = await call<CustomItem[]>('moveToCustom', t.profile, name);
      if (list) { state.custom = list; showList('custom'); toast(`${name} copied to custom configs`); }
    }
  };
  document.addEventListener('click', (e) => {
    if (!$('profile-menu').hidden && !(e.target as HTMLElement).closest('#profile-menu, .profile-more')) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeDialogs(); } });
}

// rename dialog: 15 characters, Confirm only once the name changed

let renameTarget: MenuTarget | null = null;

function openRename(target: MenuTarget, name: string) {
  renameTarget = target;
  const input = $<HTMLInputElement>('rename-input');
  input.value = name.slice(0, NAME_MAX);
  input.dataset.original = input.value;
  updateRenameState();
  $('rename').hidden = false;
  input.focus();
  input.select();
}

function updateRenameState() {
  const input = $<HTMLInputElement>('rename-input');
  $('rename-count').textContent = `${input.value.length}/${NAME_MAX}`;
  $<HTMLButtonElement>('rename-ok').disabled = !input.value.trim() || input.value.trim() === input.dataset.original;
}

async function confirmRename() {
  const name = $<HTMLInputElement>('rename-input').value.trim();
  const t = renameTarget;
  if (!name || !t) return;
  $('rename').hidden = true;
  renameTarget = null;
  if (t.kind === 'onboard') {
    const names = await call<string[]>('renameProfile', t.profile, name);
    if (names) { state.names = names; renderProfiles(); toast(`Renamed to ${name}`); }
  } else {
    const list = await call<CustomItem[]>('renameCustom', t.id, name);
    if (list) { state.custom = list; renderList(); toast(`Renamed to ${name}`); }
  }
}

function initRename() {
  const input = $<HTMLInputElement>('rename-input');
  input.oninput = updateRenameState;
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !$<HTMLButtonElement>('rename-ok').disabled) confirmRename();
    if (e.key === 'Escape') $('rename').hidden = true;
  };
  $('rename-ok').onclick = confirmRename;
  $('rename-cancel').onclick = () => ($('rename').hidden = true);
  $('rename-x').onclick = () => ($('rename').hidden = true);
}

async function deleteTarget(t: MenuTarget, name: string) {
  if (t.kind === 'custom') {
    if (!(await confirmDialog(`Delete ${name}? This custom config is removed from this PC.`, 'Delete'))) return;
    const list = await call<CustomItem[]>('deleteCustom', t.id);
    if (list) { state.custom = list; renderList(); toast(`${name} deleted`); }
    return;
  }
  if (!(await confirmDialog(`Delete ${name}? It is removed from the keyboard's onboard configs.`, 'Delete'))) return;
  const r = await call<{ profiles: Profiles; names: string[] }>('deleteProfile', t.profile);
  if (!r) return;
  const switched = r.profiles.active !== state.profiles!.active;
  state.profiles = r.profiles;
  state.names = r.names;
  renderProfiles();
  toast(`${name} deleted`);
  if (switched) {
    state.profile = r.profiles.active;
    await loadProfile();
  }
}

// Custom / Official lists below the onboard configs

let listTab: 'custom' | 'official' = 'official';
let selectedItem = '';

function showList(tab: 'custom' | 'official') {
  listTab = tab;
  for (const b of Array.from($("list-tabs").querySelectorAll<HTMLButtonElement>("button"))) b.classList.toggle('on', b.dataset.list === tab);
  renderList();
}

function renderList() {
  const custom = listTab === 'custom';
  $('list-head').replaceChildren(document.createTextNode(custom ? 'Custom Config ' : 'Official configuration'));
  if (custom) $('list-head').append(el('span', 'muted', `(${state.custom.length}/${MAX_CUSTOM})`));
  const items: { item: ListItem; name: string; help?: string }[] = custom
    ? state.custom.map((c) => ({ item: { kind: 'custom', id: c.id } as ListItem, name: c.name }))
    : state.presets.map((p) => ({ item: { kind: 'preset', id: p.id } as ListItem, name: p.name, help: p.help }));
  $('presets').replaceChildren(...items.map(({ item, name, help }) => {
    const key = `${item.kind}:${item.id}`;
    const b = el('div', 'profile preset' + (key === selectedItem ? ' sel' : '')) as HTMLDivElement;
    b.dataset[item.kind === 'preset' ? 'preset' : 'custom'] = String(item.id);
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    b.append(el('span', 'profile-name', name), el('span', 'spacer'));
    if (help) {
      b.title = help;
      b.append(icon('i-help', 'ic sm'));
    } else if (item.kind === 'custom') {
      const id = item.id;
      b.append(moreButton(name, (m) => openMenu(m, { kind: 'custom', id })));
    }
    b.onpointerdown = (e) => startDrag(e, item, b);
    b.onclick = () => {
      if (dragMoved) return;
      selectedItem = key;
      renderList();
    };
    return b;
  }));
  $('preset-drop').hidden = !custom;
}

// Drag with pointer events: a copy of the row follows the pointer, the drop target lights up.
let dragMoved = false;

function startDrag(e: PointerEvent, item: ListItem, row: HTMLElement) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('.profile-more')) return;
  const sx = e.clientX, sy = e.clientY;
  let ghost: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  dragMoved = false;
  const findTarget = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    return (hit?.closest('#onboard-drop:not(.full), #profiles .profile') as HTMLElement | null) ?? null;
  };
  const move = (ev: PointerEvent) => {
    if (!dragMoved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    if (!dragMoved) {
      dragMoved = true;
      ghost = row.cloneNode(true) as HTMLElement;
      ghost.classList.add('drag-ghost');
      ghost.style.width = `${row.getBoundingClientRect().width}px`;
      document.body.append(ghost);
      row.classList.add('dragging');
      document.body.classList.add('dragging-preset');
    }
    ghost!.style.left = `${ev.clientX - 20}px`;
    ghost!.style.top = `${ev.clientY - 18}px`;
    const t = findTarget(ev.clientX, ev.clientY);
    if (t !== target) {
      target?.classList.remove('drop-target');
      t?.classList.add('drop-target');
      target = t;
    }
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    ghost?.remove();
    row.classList.remove('dragging');
    document.body.classList.remove('dragging-preset');
    target?.classList.remove('drop-target');
    if (!dragMoved) return;
    const t = findTarget(ev.clientX, ev.clientY);
    if (t?.id === 'onboard-drop') addToOnboard(item);
    else if (t?.dataset.profile != null) replaceProfile(item, Number(t.dataset.profile));
    // the click that follows pointerup must not count as a selection
    setTimeout(() => (dragMoved = false), 0);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

const itemName = (item: ListItem) =>
  item.kind === 'preset' ? state.presets.find((p) => p.id === item.id)?.name ?? '' : state.custom.find((c) => c.id === item.id)?.name ?? '';

function applyStoreResult(r: StoreResult) {
  if (r.custom) { state.custom = r.custom; showList('custom'); }
  if (r.names) state.names = r.names;
  if (r.profiles) { state.profiles = r.profiles; renderProfiles(); }
}

async function addToOnboard(item: ListItem) {
  const r = item.kind === 'preset'
    ? await call<StoreResult>('addPresetProfile', item.id)
    : await call<StoreResult>('addCustomProfile', item.id);
  if (!r) return;
  applyStoreResult(r);
  toast(`${itemName(item)} added to onboard configs`);
}

async function replaceProfile(item: ListItem, profile: number) {
  const name = itemName(item);
  const target = profileName(profile);
  if (!(await confirmDialog(`Replace ${target} with ${name}? Its keys, lighting and trigger settings are overwritten.`, 'Replace'))) return;
  const names = item.kind === 'preset'
    ? await call<string[]>('applyPreset', profile, item.id)
    : await call<string[]>('applyCustom', item.id, profile);
  if (names === null) return;
  state.names = names;
  renderProfiles();
  toast(`${target} replaced with ${name}`);
  // the app shows the active profile; reload it when that is the one that changed
  if (profile === state.profile) {
    state.trigSel = new Set();
    state.advKey = -1;
    await loadProfile();
  }
}

async function switchProfile(i: number) {
  const p = await call<Profiles>('switchProfile', i);
  if (!p) return;
  state.profiles = p;
  state.profile = p.active;
  renderProfiles();
  toast(`${profileName(p.active)} active`);
  await loadProfile();
}

// Create and Import dialogs

type StoreKind = 'custom' | 'onboard';

function cards(container: HTMLElement, options: { value: string; title: string; text: string; disabled?: boolean }[], value: string, onPick: (v: string) => void) {
  container.replaceChildren(...options.map((o) => {
    const b = el('button', 'card-opt' + (o.value === value ? ' on' : '')) as HTMLButtonElement;
    b.dataset.value = o.value;
    b.disabled = !!o.disabled;
    b.append(el('b', '', o.title), el('span', '', o.text));
    b.onclick = () => onPick(o.value);
    return b;
  }));
}

function storageCards(container: HTMLElement, value: StoreKind, onPick: (v: StoreKind) => void) {
  const full = state.profiles!.count >= MAX_ONBOARD;
  const customFull = state.custom.length >= MAX_CUSTOM;
  cards(container, [
    { value: 'custom', title: 'Custom Config', text: 'Stored in the driver, drag to onboard to use.', disabled: customFull },
    { value: 'onboard', title: 'Onboard config', text: full ? `The keyboard already holds ${MAX_ONBOARD} onboard configs.` : 'Stored directly on the device, accessible anytime.', disabled: full },
  ], value, (v) => onPick(v as StoreKind));
}

const defaultStorage = (): StoreKind => (state.custom.length >= MAX_CUSTOM ? 'onboard' : 'custom');

let createSource = 'selected';
let createStorage: StoreKind = 'custom';

function renderCreate() {
  const sources = [
    { value: 'selected', title: 'Selected configuration', text: 'Reuse the trigger settings from the selected configuration.' },
    ...state.presets.slice(0, 3).map((p) => ({ value: String(p.id), title: p.name, text: p.help })),
  ];
  cards($('create-sources'), sources, createSource, (v) => { createSource = v; renderCreate(); });
  storageCards($('create-storage'), createStorage, (v) => { createStorage = v; renderCreate(); });
  const name = $<HTMLInputElement>('create-name').value;
  $('create-count').textContent = `${name.length}/${NAME_MAX}`;
  const blocked = createStorage === 'custom' ? state.custom.length >= MAX_CUSTOM : state.profiles!.count >= MAX_ONBOARD;
  $<HTMLButtonElement>('create-ok').disabled = !name.trim() || blocked;
}

function openCreate() {
  createSource = 'selected';
  createStorage = defaultStorage();
  $<HTMLInputElement>('create-name').value = '';
  renderCreate();
  $('create').hidden = false;
  $<HTMLInputElement>('create-name').focus();
}

async function confirmCreate() {
  const name = $<HTMLInputElement>('create-name').value.trim();
  if (!name) return;
  $('create').hidden = true;
  const r = await call<StoreResult>('createConfig', { name, source: createSource === 'selected' ? 'selected' : Number(createSource), storage: createStorage });
  if (!r) return;
  applyStoreResult(r);
  toast(`${name} created`);
}

let importPath = '';
let importStorage: StoreKind = 'custom';

function renderImport() {
  storageCards($('import-storage'), importStorage, (v) => { importStorage = v; renderImport(); });
  const name = $<HTMLInputElement>('import-name').value;
  $('import-count').textContent = `${name.length}/${NAME_MAX}`;
  const blocked = importStorage === 'custom' ? state.custom.length >= MAX_CUSTOM : state.profiles!.count >= MAX_ONBOARD;
  $<HTMLButtonElement>('import-ok').disabled = !importPath || !name.trim() || blocked;
}

function openImport() {
  importPath = '';
  importStorage = defaultStorage();
  $<HTMLInputElement>('import-name').value = '';
  $('import-file-name').textContent = '';
  renderImport();
  $('import').hidden = false;
}

async function pickImportFile() {
  const f = await call<{ path: string; name: string } | null>('pickImportFile');
  if (!f) return;
  importPath = f.path;
  $('import-file-name').textContent = f.path.split(/[\\/]/).pop() ?? '';
  $<HTMLInputElement>('import-name').value = f.name;
  renderImport();
}

async function confirmImport() {
  const name = $<HTMLInputElement>('import-name').value.trim();
  if (!importPath || !name) return;
  $('import').hidden = true;
  const r = await call<StoreResult>('importConfig', { path: importPath, name, storage: importStorage });
  if (!r) return;
  applyStoreResult(r);
  toast(`${name} imported`);
}

function closeDialogs() {
  for (const id of ['create', 'import', 'rename']) $(id).hidden = true;
}

// Others tab: the keyboard's own reset commands

async function resetCurrentProfile() {
  const name = profileName(state.profile);
  if (!(await confirmDialog(`Reset ${name} to factory settings? Its keys, lighting, trigger and advanced key settings are cleared.`, 'Reset'))) return;
  const names = await call<string[]>('resetProfile', state.profile);
  if (!names) return;
  state.names = names;
  renderProfiles();
  state.trigSel = new Set();
  state.advKey = -1;
  await loadProfile();
  toast(`${name} reset`);
}

async function factoryReset() {
  if (!(await confirmDialog('Restore factory settings? Every onboard config, key, macro and setting on the keyboard is reset. Custom configs saved in this app are kept.', 'Reset'))) return;
  if ((await call('factoryReset')) === null) return;
  await connect();
  toast('Factory settings restored');
}

function initSidebar() {
  $('reset-profile').onclick = resetCurrentProfile;
  $('reset-all').onclick = factoryReset;
  initMenu();
  initRename();
  for (const b of Array.from($("list-tabs").querySelectorAll<HTMLButtonElement>("button[data-list]"))) {
    b.onclick = () => showList(b.dataset.list as 'custom' | 'official');
  }
  $('create-btn').onclick = openCreate;
  $('import-btn').onclick = openImport;
  $('import-file').onclick = pickImportFile;
  $<HTMLInputElement>('create-name').oninput = renderCreate;
  $<HTMLInputElement>('import-name').oninput = renderImport;
  $('create-ok').onclick = confirmCreate;
  $('import-ok').onclick = confirmImport;
  for (const b of Array.from(document.querySelectorAll<HTMLElement>("[data-close]"))) b.onclick = () => ($(b.dataset.close!).hidden = true);
}

// lighting

// The Backlight and LOGO Light segments edit the same controls; the LOGO light uses the side-light fields.
type ZoneField = 'effect' | 'brightness' | 'speed' | 'color' | 'customColorDisabled';
const SIDE: Record<ZoneField, keyof Lighting> = {
  effect: 'sideEffect', brightness: 'sideBrightness', speed: 'sideSpeed', color: 'sideColor', customColorDisabled: 'sideCustomColorDisabled',
};
const zoneKey = (f: ZoneField): keyof Lighting => (state.zone === 'logo' ? SIDE[f] : f);
const zoneValue = <T>(f: ZoneField) => state.lighting![zoneKey(f)] as unknown as T;
const zonePatch = (f: ZoneField, v: unknown): Partial<Lighting> => ({ [zoneKey(f)]: v });
// Effects that move in a direction show the vendor's Direction control (backlight only).
const DIRECTIONAL = new Set([1, 2, 6, 7, 11, 12, 18, 19]);

function renderLighting() {
  const l = state.lighting!;
  const effect = zoneValue<number>('effect');
  const logo = state.zone === 'logo';
  const off = logo ? LOGO_OFF : EFFECT_OFF;
  document.querySelectorAll<HTMLButtonElement>('#light-zone button').forEach((b) => b.classList.toggle('on', b.dataset.zone === state.zone));
  // Normal light / Custom / Music Rhythm belong to the backlight
  $('light-modes').hidden = logo;
  const mode = logo ? 'normal' : state.lightMode;
  document.querySelectorAll<HTMLButtonElement>('#light-modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('effects').hidden = mode !== 'normal';
  $('custom-light').hidden = mode !== 'custom';
  $('music').hidden = mode !== 'music';
  $('speed-block').hidden = logo;
  $('paint-row').hidden = mode !== 'custom';
  $('paint-count').textContent = `${state.paintSel.size} key${state.paintSel.size === 1 ? '' : 's'} selected`;
  if (mode === 'custom') renderCustomLighting();
  const ids = logo ? LOGO_EFFECTS.map((e) => e[0])
    // an effect outside the vendor grid (an unknown value) gets its own button at the end
    : EFFECT_ORDER.includes(effect) || effect === EFFECT_OFF || effect === EFFECT_CUSTOM ? EFFECT_ORDER : [...EFFECT_ORDER, effect];
  $('effects').replaceChildren(...ids.map((id) => {
    const b = el('button', 'effect' + (id === effect ? ' on' : '')) as HTMLButtonElement;
    const logoItem = LOGO_EFFECTS.find((e) => e[0] === id);
    const [name, ic] = logo && logoItem ? [logoItem[1], logoItem[2]] : EFFECTS[id] ?? [`Effect ${id}`, 'e-dot'];
    b.append(icon(ic), el('span', '', name));
    b.dataset.effect = String(id);
    b.disabled = !state.writes.lighting;
    b.onclick = () => patchLighting(zonePatch('effect', id), name);
    return b;
  }));
  $('light-on').classList.toggle('on', effect !== off);
  $<HTMLButtonElement>('light-on').disabled = !state.writes.lighting;
  $<HTMLInputElement>('speed').value = String(zoneValue<number>('speed'));
  $<HTMLInputElement>('brightness').value = String(zoneValue<number>('brightness'));
  paintRange($('speed'));
  paintRange($('brightness'));
  $('speed-v').textContent = `${zoneValue<number>('speed')}Level`;
  $('brightness-v').textContent = `${zoneValue<number>('brightness')}%`;
  $('direction-block').hidden = state.zone !== 'back' || !DIRECTIONAL.has(effect);
  document.querySelectorAll<HTMLButtonElement>('#direction button').forEach((b) => b.classList.toggle('on', Number(b.dataset.dir) === l.direction));
  const customOff = zoneValue<boolean>('customColorDisabled');
  $('custom-color').classList.toggle('on', !customOff);
  $<HTMLButtonElement>('custom-color').disabled = !state.writes.lighting;
  showColor(mode === 'custom' ? state.paint : zoneValue<string>('color'));
  $('light-note').textContent = customOff ? 'Custom colour is off: the effect uses its own colours. Picking a colour turns it on.' : '';
}

// colour picker: saturation/value square and hue strip
let hsv = [0, 1, 1];

function hsvToHex([h, s, v]: number[]) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return '#' + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function hexToHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

function showColor(hex: string, keepHsv = false) {
  if (!keepHsv) hsv = hexToHsv(hex);
  $('sv').style.backgroundColor = hsvToHex([hsv[0], 1, 1]);
  $('sv-dot').style.left = `${hsv[1] * 100}%`;
  $('sv-dot').style.top = `${(1 - hsv[2]) * 100}%`;
  $('hue-dot').style.top = `${(hsv[0] / 360) * 100}%`;
  if (document.activeElement !== $('hex')) $<HTMLInputElement>('hex').value = hex;
  ['r', 'g', 'b'].forEach((c, i) => {
    if (document.activeElement !== $(c)) $<HTMLInputElement>(c).value = String(parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16));
  });
}

async function patchLighting(patch: Partial<Lighting>, msg: string) {
  const l = await call<Lighting>('setLighting', state.profile, patch);
  if (l) { state.lighting = l; renderLighting(); toast(msg); }
}

let colorTimer = 0;
function pickColor(hex: string, keepHsv = false) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  hex = hex.toLowerCase();
  showColor(hex, keepHsv);
  // in Custom mode the palette picks the paint colour; Apply writes it to the selected keys
  if (state.zone === 'back' && state.lightMode === 'custom') { state.paint = hex; return; }
  clearTimeout(colorTimer);
  colorTimer = window.setTimeout(() => patchLighting(zonePatch('color', hex), 'Colour saved'), 300);
}

function drag(target: HTMLElement, onMove: (fx: number, fy: number) => void) {
  const move = (e: PointerEvent) => {
    const r = target.getBoundingClientRect();
    onMove(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
  };
  target.onpointerdown = (e) => {
    target.setPointerCapture(e.pointerId);
    move(e);
    target.onpointermove = move;
  };
  target.onpointerup = () => (target.onpointermove = null);
}

function initLightingControls() {
  $('swatches').replaceChildren(...SWATCHES.map((c) => {
    const b = el('button', 'swatch');
    b.style.background = c;
    b.title = c;
    b.onclick = () => pickColor(c);
    return b;
  }));
  drag($('sv'), (fx, fy) => { hsv = [hsv[0], fx, 1 - fy]; pickColor(hsvToHex(hsv), true); });
  drag($('hue'), (_, fy) => { hsv = [fy * 359.9, hsv[1], hsv[2]]; pickColor(hsvToHex(hsv), true); });
  $<HTMLInputElement>('hex').onchange = (e) => {
    const v = (e.target as HTMLInputElement).value.trim();
    pickColor(v.startsWith('#') ? v : '#' + v);
  };
  ['r', 'g', 'b'].forEach((c) => ($<HTMLInputElement>(c).onchange = () => {
    const v = ['r', 'g', 'b'].map((x) => Math.max(0, Math.min(255, Number($<HTMLInputElement>(x).value) || 0)));
    pickColor('#' + v.map((n) => n.toString(16).padStart(2, '0')).join(''));
  }));
  // The effects switch turns lighting off (value 255); turning it back on picks rainbow cycle.
  $('light-on').onclick = () => {
    const logo = state.zone === 'logo';
    const turnOff = zoneValue<number>('effect') !== (logo ? LOGO_OFF : EFFECT_OFF);
    stopPlaying();
    patchLighting(zonePatch('effect', turnOff ? (logo ? LOGO_OFF : EFFECT_OFF) : logo ? 0 : 1), turnOff ? 'Lighting off' : 'Lighting on');
  };
  $('custom-color').onclick = () => {
    const off = zoneValue<boolean>('customColorDisabled');
    patchLighting(zonePatch('customColorDisabled', !off), off ? 'Custom colour on' : 'Custom colour off');
  };
  document.querySelectorAll<HTMLButtonElement>('#light-zone button').forEach((b) => (b.onclick = () => {
    state.zone = b.dataset.zone as 'back' | 'logo';
    renderLighting();
    renderKeyboard();
  }));
  document.querySelectorAll<HTMLButtonElement>('#direction button').forEach((b) => (b.onclick = () =>
    patchLighting({ direction: Number(b.dataset.dir) }, b.textContent!)));
  for (const id of ['speed', 'brightness'] as const) {
    const input = $<HTMLInputElement>(id);
    input.oninput = () => {
      paintRange(input);
      $(id + '-v').textContent = id === 'speed' ? `${input.value}Level` : `${input.value}%`;
    };
    input.onchange = () => patchLighting(zonePatch(id, Number(input.value)), `${id === 'speed' ? 'Speed' : 'Brightness'} ${input.value}`);
  }
}

// custom lighting (effect 0): per-key colours, saved schemes, GIFs and built-in animations

let paintDrag: boolean | null = null;
window.addEventListener('pointerup', () => (paintDrag = null));

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function togglePaint(i: number, on: boolean) {
  if (on) state.paintSel.add(i);
  else state.paintSel.delete(i);
  renderKeyboard();
  $('paint-count').textContent = `${state.paintSel.size} key${state.paintSel.size === 1 ? '' : 's'} selected`;
}

const MAX_LIGHTS = 20;
// "Default": a rainbow across the keyboard, left to right.
const DEFAULT_SCHEME = LAYOUT.map(([x, , w]) => hsvToHex([((x + w / 2) / KBD_W) * 330, 1, 1]));

function lightRow(name: string, on: boolean, onPick: () => void, onDelete?: () => void, playing = false) {
  const row = el('div', 'light-item' + (on ? ' on' : ''));
  row.append(el('span', '', name), el('span', 'spacer'));
  if (playing) {
    const stop = el('button', 'mini-btn', 'Stop');
    stop.onclick = (e) => { e.stopPropagation(); stopPlaying(); };
    row.append(stop);
  }
  if (onDelete) {
    const del = el('button', 'mini-btn', 'Delete');
    del.onclick = (e) => { e.stopPropagation(); onDelete(); };
    row.append(del);
  }
  row.onclick = onPick;
  return row;
}

function renderCustomLighting() {
  const L = state.lights;
  $('static-count').textContent = `(${L.schemes.length}/${MAX_LIGHTS})`;
  $('gif-count').textContent = `(${L.gifs.length}/${MAX_LIGHTS})`;
  $('static-list').replaceChildren(
    lightRow('Default', state.scheme === 'default' && !state.playing, () => applyScheme('default', DEFAULT_SCHEME)),
    ...L.schemes.map((sc) => lightRow(sc.name, state.scheme === sc.id && !state.playing, () => applyScheme(sc.id, sc.colors),
      () => saveLights({ ...L, schemes: L.schemes.filter((x) => x.id !== sc.id) }))),
  );
  $('gif-list').replaceChildren(...L.gifs.map((g) => lightRow(g.name, state.playing === g.id, () => playGif(g),
    () => saveLights({ ...L, gifs: L.gifs.filter((x) => x.id !== g.id) }), state.playing === g.id)));
  $('official-list').replaceChildren(...OFFICIAL_EFFECTS.map(([id, name, fn]) =>
    lightRow(name, state.playing === id, () => play(id, fn), undefined, state.playing === id)));
}

async function saveLights(d: LightStore) {
  const r = await call<LightStore>('saveLights', d);
  if (r) { state.lights = r; renderCustomLighting(); }
}

// Shows the Custom effect with these colours on every key.
async function applyScheme(id: string, colors: string[]) {
  stopPlaying();
  if (state.lighting!.effect !== EFFECT_CUSTOM) await patchLighting({ effect: EFFECT_CUSTOM }, 'Custom lighting');
  const r = await call<string[]>('setKeyColors', state.profile, colors.map((c, i): [number, string] => [i, c]));
  if (!r) return;
  state.keyColors = r;
  state.scheme = id;
  renderLighting();
  renderKeyboard();
}

async function applyPaint() {
  if (!state.paintSel.size) { toast('Select keys on the keyboard first'); return; }
  if (state.lighting!.effect !== EFFECT_CUSTOM) await patchLighting({ effect: EFFECT_CUSTOM }, 'Custom lighting');
  const entries = [...state.paintSel].map((i): [number, string] => [i, state.paint]);
  const r = await call<string[]>('setKeyColors', state.profile, entries);
  if (!r) return;
  state.keyColors = r;
  // a saved scheme follows the edits made while it is selected
  const sc = state.lights.schemes.find((x) => x.id === state.scheme);
  if (sc) await saveLights({ ...state.lights, schemes: state.lights.schemes.map((x) => (x === sc ? { ...x, colors: r.slice(0, LAYOUT.length) } : x)) });
  state.paintSel = new Set();
  toast(`Colour set on ${entries.length} key${entries.length === 1 ? '' : 's'}`);
  renderLighting();
  renderKeyboard();
}

async function addScheme() {
  const L = state.lights;
  if (L.schemes.length >= MAX_LIGHTS) { toast(`Up to ${MAX_LIGHTS} static lightings`); return; }
  const id = `s${Date.now()}`;
  const colors = (state.keyColors.length ? state.keyColors : DEFAULT_SCHEME).slice(0, LAYOUT.length);
  await saveLights({ ...L, schemes: [...L.schemes, { id, name: `Static ${L.schemes.length + 1}`, colors }] });
  await applyScheme(id, colors);
}

// live frames: a 72 × 28 canvas (4 px per key unit) is drawn, then sampled at every key's centre
const GRID = 4;
const frameCanvas = document.createElement('canvas');
frameCanvas.width = Math.ceil(KBD_W * GRID);
frameCanvas.height = Math.ceil(KBD_H * GRID);
const fctx = frameCanvas.getContext('2d', { willReadFrequently: true })!;

function sampleFrame(): string[] {
  const img = fctx.getImageData(0, 0, frameCanvas.width, frameCanvas.height).data;
  return LAYOUT.map(([x, y, w]) => {
    const px = Math.min(frameCanvas.width - 1, Math.floor((x + w / 2) * GRID));
    const py = Math.min(frameCanvas.height - 1, Math.floor((y + 0.5) * GRID));
    const o = 4 * (py * frameCanvas.width + px);
    return '#' + [img[o], img[o + 1], img[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  });
}

function sendFrame(colors: string[]) {
  const bytes = new Array(3 * 128).fill(0);
  colors.forEach((c, i) => [1, 3, 5].forEach((o, k) => (bytes[3 * i + k] = parseInt(c.slice(o, o + 2), 16))));
  jet75.streamFrame(bytes);
  state.liveFrame = colors;
  if (state.tab === 'lighting' && (state.playing !== 'music' || music.showKbd)) renderKeyboard();
}

let playTimer = 0;
// Streams frames from draw(t, dt) at 20 fps until stopped; the keyboard returns to its saved effect ~3 s later.
function play(id: string, draw: (t: number) => void) {
  stopPlaying();
  state.playing = id;
  const start = performance.now();
  playTimer = window.setInterval(() => {
    draw((performance.now() - start) / 1000);
    sendFrame(sampleFrame());
  }, 50);
  renderLighting();
}

function stopPlaying() {
  clearInterval(playTimer);
  playTimer = 0;
  stopMusic();
  state.playing = '';
  state.liveFrame = null;
  if (state.tab === 'lighting') { renderLighting(); renderKeyboard(); }
}

function playGif(g: LightStore['gifs'][number]) {
  const total = g.delays.reduce((a, b) => a + b, 0) || 1;
  play(g.id, (t) => {
    let ms = (t * 1000) % total;
    let f = 0;
    while (f < g.frames.length - 1 && ms >= g.delays[f]) ms -= g.delays[f++];
    const frame = g.frames[f];
    fctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
    LAYOUT.forEach(([x, y, w], i) => { fctx.fillStyle = frame[i]; fctx.fillRect(x * GRID, y * GRID, w * GRID, GRID); });
  });
}

// GIF import: decode every frame (Chromium's ImageDecoder), scale it onto the keyboard and keep one colour per key.
async function addGif() {
  if (state.lights.gifs.length >= MAX_LIGHTS) { toast(`Up to ${MAX_LIGHTS} GIF effects`); return; }
  const file = await call<{ name: string; bytes: number[] } | null>('pickGif');
  if (!file) return;
  const Decoder = (window as any).ImageDecoder;
  const dec = new Decoder({ data: new Uint8Array(file.bytes), type: 'image/gif' });
  await dec.tracks.ready;
  const count = Math.min(240, dec.tracks.selectedTrack.frameCount);
  const frames: string[][] = [];
  const delays: number[] = [];
  for (let i = 0; i < count; i++) {
    const { image } = await dec.decode({ frameIndex: i });
    fctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
    fctx.drawImage(image, 0, 0, frameCanvas.width, frameCanvas.height);
    frames.push(sampleFrame());
    delays.push(Math.max(20, Math.round((image.duration ?? 100000) / 1000)));
    image.close();
  }
  dec.close();
  const id = `g${Date.now()}`;
  await saveLights({ ...state.lights, gifs: [...state.lights.gifs, { id, name: file.name.slice(0, 20), frames, delays }] });
  toast(`${file.name}: ${frames.length} frames`);
}

// Built-in animations, drawn on the 18 × 7 key grid.
function brickBreaker() {
  const cols = 18;
  let bricks = new Set<number>();
  let ball = { x: 8, y: 5, dx: 0.35, dy: -0.3 };
  const reset = () => { bricks = new Set(Array.from({ length: 3 * cols }, (_, i) => i)); ball = { x: 8, y: 5, dx: 0.35, dy: -0.3 }; };
  reset();
  return () => {
    ball.x += ball.dx;
    ball.y += ball.dy;
    if (ball.x < 0 || ball.x > cols - 0.5) ball.dx = -ball.dx;
    if (ball.y < 0) ball.dy = -ball.dy;
    if (ball.y > 5.2) { ball.dy = -Math.abs(ball.dy); }
    const cell = Math.floor(ball.y) * cols + Math.floor(ball.x);
    if (ball.y < 3 && bricks.has(cell)) { bricks.delete(cell); ball.dy = -ball.dy; }
    if (!bricks.size) reset();
    fctx.fillStyle = '#000';
    fctx.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
    bricks.forEach((b) => {
      fctx.fillStyle = `hsl(${(b % cols) * 20}, 100%, 50%)`;
      fctx.fillRect((b % cols) * GRID, Math.floor(b / cols) * 1.1 * GRID, GRID, GRID);
    });
    fctx.fillStyle = '#ffffff';
    fctx.fillRect((ball.x - 2) * GRID, 5.72 * GRID, 4 * GRID, GRID); // paddle follows the ball
    fctx.fillStyle = '#ffd400';
    fctx.fillRect(Math.floor(ball.x) * GRID, Math.floor(ball.y) * 1.1 * GRID, GRID, GRID);
  };
}

const DIGITS: Record<string, string[]> = {
  3: ['111', '001', '111', '001', '111'], 2: ['111', '001', '111', '100', '111'], 1: ['010', '110', '010', '010', '111'],
};
function countdownFireworks() {
  const bursts: { x: number; y: number; t0: number; hue: number }[] = [];
  return (t: number) => {
    const cycle = t % 9;
    fctx.fillStyle = '#000';
    fctx.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
    if (cycle < 3) {
      const d = DIGITS[String(3 - Math.floor(cycle))];
      fctx.fillStyle = `hsl(${Math.floor(cycle) * 120}, 100%, 55%)`;
      d.forEach((row, r) => [...row].forEach((c, k) => { if (c === '1') fctx.fillRect((7 + k * 1.1) * GRID, (1.33 + r * 1.1) * GRID, 1.1 * GRID, 1.1 * GRID); }));
      bursts.length = 0;
      return;
    }
    if (Math.random() < 0.25) bursts.push({ x: Math.random() * KBD_W, y: 1 + Math.random() * 5, t0: t, hue: Math.random() * 360 });
    for (const b of bursts) {
      const age = t - b.t0;
      if (age > 1.2) continue;
      fctx.strokeStyle = `hsla(${b.hue}, 100%, 55%, ${1 - age / 1.2})`;
      fctx.lineWidth = GRID * 0.9;
      fctx.beginPath();
      fctx.arc(b.x * GRID, b.y * GRID, age * 6 * GRID + 1, 0, Math.PI * 2);
      fctx.stroke();
    }
  };
}

const OFFICIAL_EFFECTS: [string, string, (t: number) => void][] = [];
function initOfficialEffects() {
  OFFICIAL_EFFECTS.push(['brick', 'Brick Breaker', brickBreaker()], ['countdown', 'Countdown Fireworks', countdownFireworks()]);
}

// music rhythm: the PC's own audio (loopback), a spectrum per keyboard column

const MUSIC_DEFAULTS = { zoomRhythm: 1, zoomKbd: 1, showRhythm: true, showKbd: true };
const music = { ...MUSIC_DEFAULTS, stream: null as MediaStream | null, ctx: null as AudioContext | null };

async function startMusic() {
  stopPlaying();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch {
    toast('Sound capture was not allowed');
    return;
  }
  stream.getVideoTracks().forEach((t) => t.stop());
  if (!stream.getAudioTracks().length) { toast('No sound to capture'); return; }
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  an.smoothingTimeConstant = 0.6;
  ctx.createMediaStreamSource(stream).connect(an);
  music.stream = stream;
  music.ctx = ctx;
  const bins = new Uint8Array(an.frequencyBinCount);
  const cols = 18;
  const spec = $<HTMLCanvasElement>('spectrum').getContext('2d')!;
  play('music', () => {
    an.getByteFrequencyData(bins);
    // log-spaced bands, one per keyboard column
    const levels = Array.from({ length: cols }, (_, c) => {
      const lo = Math.floor(2 * Math.pow(bins.length / 2, c / cols));
      const hi = Math.max(lo + 1, Math.floor(2 * Math.pow(bins.length / 2, (c + 1) / cols)));
      let m = 0;
      for (let i = lo; i < hi && i < bins.length; i++) m = Math.max(m, bins[i]);
      return Math.min(1, (m / 255) * music.zoomRhythm);
    });
    fctx.fillStyle = '#000';
    fctx.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
    levels.forEach((v, c) => {
      const rows = Math.round(v * 6);
      for (let r = 0; r < rows; r++) {
        fctx.fillStyle = `hsl(${c * 20}, 100%, ${50 * music.zoomKbd}%)`;
        fctx.fillRect(c * GRID * KBD_W / cols, (KBD_H - 1 - r * 1.1) * GRID, GRID * KBD_W / cols + 1, GRID);
      }
    });
    if (music.showRhythm) {
      spec.clearRect(0, 0, 320, 96);
      levels.forEach((v, c) => { spec.fillStyle = getComputedStyle(document.body).color; spec.fillRect(c * 18, 96 - v * 96, 14, v * 96); });
    }
  });
  state.playing = 'music';
  renderMusic();
}

function stopMusic() {
  music.stream?.getTracks().forEach((t) => t.stop());
  music.ctx?.close();
  music.stream = null;
  music.ctx = null;
}

function renderMusic() {
  $('music-start').textContent = state.playing === 'music' ? 'Stop' : 'Start';
  $('spectrum').hidden = !music.showRhythm;
  const label: Record<string, string> = {
    zoomRhythm: `Zoom Rhythm ×${music.zoomRhythm}`, zoomKbd: `Zoom Keyboard ${Math.round(music.zoomKbd * 100)}%`,
    showRhythm: 'Show Rhythm', showKbd: 'Show Kbd',
  };
  document.querySelectorAll<HTMLButtonElement>('[data-music]').forEach((b) => {
    const k = b.dataset.music!;
    b.textContent = label[k];
    b.classList.toggle('on', k === 'showRhythm' ? music.showRhythm : k === 'showKbd' ? music.showKbd : false);
  });
}

function initCustomLighting() {
  initOfficialEffects();
  document.querySelectorAll<HTMLButtonElement>('#light-modes button').forEach((b) => (b.onclick = async () => {
    const mode = b.dataset.mode as typeof state.lightMode;
    if (mode !== state.lightMode) stopPlaying();
    state.lightMode = mode;
    state.paintSel = new Set();
    if (mode === 'custom') {
      const c = await call<string[]>('keyColors', state.profile);
      if (c) state.keyColors = c;
      if (state.lighting!.effect !== EFFECT_CUSTOM) await patchLighting({ effect: EFFECT_CUSTOM }, 'Custom lighting');
    }
    renderLighting();
    renderKeyboard();
    renderMusic();
  }));
  $('paint-apply').onclick = applyPaint;
  $('static-add').onclick = addScheme;
  $('gif-add').onclick = addGif;
  $('music-start').onclick = () => (state.playing === 'music' ? stopPlaying() : startMusic());
  $('music-reset').onclick = () => { Object.assign(music, MUSIC_DEFAULTS); renderMusic(); };
  document.querySelectorAll<HTMLButtonElement>('[data-music]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.music!;
    if (k === 'zoomRhythm') music.zoomRhythm = music.zoomRhythm >= 3 ? 1 : music.zoomRhythm + 0.5;
    if (k === 'zoomKbd') music.zoomKbd = music.zoomKbd <= 0.5 ? 1 : music.zoomKbd - 0.25;
    if (k === 'showRhythm') music.showRhythm = !music.showRhythm;
    if (k === 'showKbd') { music.showKbd = !music.showKbd; if (!music.showKbd) { state.liveFrame = null; renderKeyboard(); } }
    renderMusic();
  }));
  renderMusic();
}

// performance

function renderPerformance() {
  const p = state.perf!;
  const can = state.writes.lighting;
  $('p-lockWin').classList.toggle('on', p.lockWin);
  $('p-macMode').classList.toggle('on', p.macMode);
  $('p-debounce-on').classList.toggle('on', p.debounce > 0);
  $('p-stability').classList.toggle('on', p.stability);
  $('p-adaptiveCalibration').classList.toggle('on', p.adaptiveCalibration);
  for (const id of ['p-lockWin', 'p-macMode', 'p-debounce-on', 'p-stability', 'p-adaptiveCalibration']) $<HTMLButtonElement>(id).disabled = !can;
  // Like the vendor: there is no Win key in Mac mode, so its lock is greyed out.
  $<HTMLButtonElement>('p-lockWin').disabled = !can || p.macMode;
  $('p-lockWin').closest('.card')?.classList.toggle('off', p.macMode);
  $('p-mac-note').textContent = 'After switching to Mac mode, the default layer will be switched to MacOS';
  $('p-debounce').hidden = !p.debounce;
  $('p-debounce').replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const b = el('button', i + 1 === p.debounce ? 'on' : '', String(i + 1)) as HTMLButtonElement;
    b.dataset.debounce = String(i + 1);
    b.disabled = !can || !p.debounce;
    b.onclick = () => patchPerformance({ debounce: i + 1 }, `Debounce ${i + 1}`);
    return b;
  }));
}

function renderRates() {
  const cur = state.lighting!.reportRateIndex;
  $('rates').replaceChildren(...RATES.map(([label, i]) => {
    const b = el('button', 'radio' + (i === cur ? ' on' : ''), label) as HTMLButtonElement;
    b.disabled = !state.writes.lighting;
    b.onclick = async () => {
      const l = await call<Lighting>('setReportRate', state.profile, i);
      if (l) { state.lighting = l; renderRates(); toast(`Polling rate ${label} saved`); }
    };
    return b;
  }));
}

async function patchPerformance(patch: Partial<Performance>, msg: string) {
  const p = await call<Performance>('setPerformance', state.profile, patch);
  if (p) { state.perf = p; renderPerformance(); toast(msg); }
}

function initPerformanceControls() {
  $('p-lockWin').onclick = () => patchPerformance({ lockWin: !state.perf!.lockWin }, `Win key lock ${state.perf!.lockWin ? 'off' : 'on'}`);
  $('p-macMode').onclick = () => patchPerformance({ macMode: !state.perf!.macMode }, `Mac mode ${state.perf!.macMode ? 'off' : 'on'}`);
  $('p-debounce-on').onclick = () => patchPerformance({ debounce: state.perf!.debounce ? 0 : 1 }, `Key debounce ${state.perf!.debounce ? 'off' : 'on'}`);
  // Turning stability mode off asks first, like the vendor driver.
  $('p-stability').onclick = async () => {
    const on = state.perf!.stability;
    if (on && !(await confirmDialog('Disabling this feature may cause mistouches or disconnections. Are you sure you want to turn it off?'))) return;
    patchPerformance({ stability: !on }, `Stability mode ${on ? 'off' : 'on'}`);
  };
  $('p-adaptiveCalibration').onclick = () => patchPerformance(
    { adaptiveCalibration: !state.perf!.adaptiveCalibration }, `Adaptive calibration ${state.perf!.adaptiveCalibration ? 'off' : 'on'}`);
}

// Resolves true for the first button (Close or the given label, which confirms), false for Cancel.
function confirmDialog(text: string, ok = 'Close'): Promise<boolean> {
  $('confirm-text').textContent = text;
  $('confirm-ok').textContent = ok;
  $('confirm').hidden = false;
  return new Promise((resolve) => {
    const done = (ok: boolean) => { $('confirm').hidden = true; resolve(ok); };
    $('confirm-ok').onclick = () => done(true);
    $('confirm-cancel').onclick = () => done(false);
  });
}

// trigger: select keys on the keyboard; every change is written to the selected keys at once

// 0.01 mm units; Berserk Mode's 0.005 mm steps show as halves
const mm = (v: number) => (v / 100).toFixed(v % 1 ? 3 : 2);
const WASD = [0x1a, 0x04, 0x16, 0x07];
const FACTORY_TRIGGER: Partial<Trigger> = { keyMode: 1, actuation: 120, rtPress: 80, rtRelease: 80, pressDeadzone: 0, releaseDeadzone: 0, pressPrecision: 0, releasePrecision: 0 };
// Select Switch: trigger record byte 0 = 0xA0 | index
const SWITCHES = ['Default Option', 'TTC Uranus Magnetic Switch-Standard', 'TTC Uranus Magnetic Switch-RGB eSports', 'TTC Magneto Switch',
  'Ice Rhino Magnetic Switch', 'Star Hunt Magnetic Switch', 'Starburst Magnetic Switch', 'Kailh Magnetic God Switch',
  'Ice Blue Magnetic Switch', 'Quicksilver Magnetic Switch'];
const DEADZONE_DEFAULT = 15;
const RANGE_FIELDS = ['rtPress', 'rtRelease', 'pressDeadzone', 'releaseDeadzone'] as const;
const trigFields = { actuation: 120, rtPress: 80, rtRelease: 80, pressDeadzone: 0, releaseDeadzone: 0, keyMode: 1, switchType: 0, pressPrecision: 0, releasePrecision: 0 };
// The vendor's limits, in 0.01 mm.
const ACTUATION_MIN = 9;
const ACTUATION_MAX = 340;
const DEADZONE_FIELDS = new Set<string>(['pressDeadzone', 'releaseDeadzone']);

function triggerLabel(t: Trigger): string {
  if (state.trigView === 'actuation') return mm(t.actuation);
  if (state.trigView === 'rt') return mm(t.pressPrecision ? t.rtPress / 2 : t.rtPress);
  return mm(t.pressDeadzone);
}

function toggleTrigKey(i: number) {
  if (state.trigSel.has(i)) state.trigSel.delete(i);
  else state.trigSel.add(i);
  // the panel shows the values of the first selected key
  if (state.trigSel.size === 1) loadTriggerFields(i);
  renderKeyboard();
  renderTriggerPanel();
}

function loadTriggerFields(i: number) {
  const t = state.triggers[i];
  if (!t) return;
  // with 0.005 mm precision the keyboard stores RT distances in 0.005 mm units
  const rtPress = t.pressPrecision ? t.rtPress / 2 : t.rtPress;
  const rtRelease = t.releasePrecision ? t.rtRelease / 2 : t.rtRelease;
  Object.assign(trigFields, {
    actuation: t.actuation, rtPress, rtRelease, pressDeadzone: t.pressDeadzone, releaseDeadzone: t.releaseDeadzone,
    keyMode: t.keyMode, switchType: t.switchType, pressPrecision: t.pressPrecision, releasePrecision: t.releasePrecision,
  });
  state.separate = rtPress !== rtRelease;
}

function renderTriggerPanel() {
  const n = state.trigSel.size;
  $('trig-count').textContent = n ? `${n} key${n > 1 ? 's' : ''} selected. Changes are written to them straight away.` : 'Select keys on the keyboard to change them.';
  if (document.activeElement !== $('t-actuation')) $<HTMLInputElement>('t-actuation').value = mm(trigFields.actuation);
  $('t-fill').style.height = `${Math.min(100, (trigFields.actuation / ACTUATION_MAX) * 100)}%`;
  $('dz-summary').textContent = `Press ${mm(trigFields.pressDeadzone)} mm · Release ${mm(trigFields.releaseDeadzone)} mm`;
  for (const f of RANGE_FIELDS) {
    const r = $<HTMLInputElement>(`t-${f}`);
    r.value = String(trigFields[f]);
    paintRange(r);
    if (document.activeElement !== $(`t-${f}-n`)) $<HTMLInputElement>(`t-${f}-n`).value = mm(trigFields[f]);
  }
  $('t-separate').classList.toggle('on', state.separate);
  $<HTMLInputElement>('t-rtRelease').disabled = !state.separate;
  $<HTMLInputElement>('t-rtRelease-n').disabled = !state.separate;
  // keyMode: 0 = quick trigger off, 1 = on, 2 = on with rapid trigger
  $('t-rt').classList.toggle('on', trigFields.keyMode >= 1);
  $<HTMLButtonElement>('t-rt').disabled = !n;
  $('t-rapid').classList.toggle('on', trigFields.keyMode === 2);
  $<HTMLButtonElement>('t-rapid').disabled = !n || trigFields.keyMode < 1;
  document.querySelectorAll<HTMLButtonElement>('#trig-views button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.trigView));
  $('sw-name').textContent = SWITCHES[trigFields.switchType] ?? `Switch ${trigFields.switchType}`;
  const berserk = !!state.perf?.tachyon;
  $('p-tachyon').classList.toggle('on', berserk);
  $<HTMLButtonElement>('p-tachyon').disabled = !state.writes.lighting;
  $('berserk-tag').hidden = !berserk;
  for (const [id, f] of [['prec-press', 'pressPrecision'], ['prec-release', 'releasePrecision']] as const) {
    $(id).classList.toggle('off', !berserk);
    document.querySelectorAll<HTMLButtonElement>(`#${id} .radio`).forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.prec) === (trigFields[f] ? 1 : 0));
      b.disabled = !berserk || !n;
    });
  }
}

// Converts the panel's 0.01 mm values to what the keyboard stores (0.005 mm units with Berserk precision).
function devicePatch(patch: Partial<Trigger>): Partial<Trigger> {
  const out: Partial<Trigger> = { ...patch };
  const pp = patch.pressPrecision ?? trigFields.pressPrecision;
  const rp = patch.releasePrecision ?? trigFields.releasePrecision;
  if (patch.rtPress != null || patch.pressPrecision != null) {
    out.rtPress = Math.round((patch.rtPress ?? trigFields.rtPress) * (pp ? 2 : 1));
    out.pressPrecision = pp;
  }
  if (patch.rtRelease != null || patch.releasePrecision != null) {
    out.rtRelease = Math.round((patch.rtRelease ?? trigFields.rtRelease) * (rp ? 2 : 1));
    out.releasePrecision = rp;
  }
  return out;
}

let trigTimer = 0;
async function writeTriggers(patch: Partial<Trigger>) {
  Object.assign(trigFields, patch);
  renderTriggerPanel();
  const keys = [...state.trigSel].sort((a, b) => a - b);
  if (!keys.length) { toast('Select keys on the keyboard first'); return; }
  const t = await call<Trigger[]>('setTriggers', state.profile, keys, devicePatch(patch));
  if (t) {
    state.triggers = t;
    renderKeyboard();
    clearTimeout(trigTimer);
    trigTimer = window.setTimeout(() => toast(`Saved on ${keys.length} key${keys.length > 1 ? 's' : ''}`), 150);
  }
}

const toUnits = (v: string) => Math.round(parseFloat(v) * 200) / 2;

function initTriggerControls() {
  const act = $<HTMLInputElement>('t-actuation');
  act.onchange = () => {
    const v = toUnits(act.value);
    if (v >= ACTUATION_MIN && v <= ACTUATION_MAX) writeTriggers({ actuation: v });
    else { toast('Actuation is 0.09–3.40 mm'); renderTriggerPanel(); }
  };
  drag($('t-bar'), (_, fy) => {
    trigFields.actuation = Math.max(ACTUATION_MIN, Math.round(fy * ACTUATION_MAX));
    renderTriggerPanel();
  });
  $('t-bar').addEventListener('pointerup', () => writeTriggers({ actuation: trigFields.actuation }));
  for (const f of RANGE_FIELDS) {
    const r = $<HTMLInputElement>(`t-${f}`);
    const patchFor = (v: number): Partial<Trigger> => (f === 'rtPress' && !state.separate ? { rtPress: v, rtRelease: v } : { [f]: v });
    r.oninput = () => {
      Object.assign(trigFields, patchFor(Number(r.value)));
      renderTriggerPanel();
    };
    // dead zones are written by the dialog's Confirm, the rest straight away
    const commit = (v: number) => {
      if (DEADZONE_FIELDS.has(f)) { Object.assign(trigFields, { [f]: v }); renderTriggerPanel(); } else writeTriggers(patchFor(v));
    };
    r.onchange = () => commit(Number(r.value));
    $<HTMLInputElement>(`t-${f}-n`).onchange = (e) => {
      const v = toUnits((e.target as HTMLInputElement).value);
      if (v >= Number(r.min) && v <= Number(r.max)) commit(v);
      else { toast(`Use ${mm(Number(r.min))}–${mm(Number(r.max))} mm`); renderTriggerPanel(); }
    };
  }
  $('t-rt').onclick = () => writeTriggers({ keyMode: trigFields.keyMode >= 1 ? 0 : 1 });
  $('t-rapid').onclick = () => writeTriggers({ keyMode: trigFields.keyMode === 2 ? 1 : 2 });
  $('t-separate').onclick = () => { state.separate = !state.separate; renderTriggerPanel(); };
  $('dz-toggle').onclick = () => {
    if (!state.trigSel.size) { toast('Select keys on the keyboard first'); return; }
    // off when both zones are 0; switching on starts from the vendor's 0.15 mm
    const on = trigFields.pressDeadzone > 0 || trigFields.releaseDeadzone > 0;
    $('dz-on').classList.toggle('on', on);
    if (!on) Object.assign(trigFields, { pressDeadzone: DEADZONE_DEFAULT, releaseDeadzone: DEADZONE_DEFAULT });
    renderTriggerPanel();
    $('dz-dialog').hidden = false;
  };
  $('dz-on').onclick = () => $('dz-on').classList.toggle('on');
  $('dz-ok').onclick = () => {
    $('dz-dialog').hidden = true;
    const on = $('dz-on').classList.contains('on');
    writeTriggers({ pressDeadzone: on ? trigFields.pressDeadzone : 0, releaseDeadzone: on ? trigFields.releaseDeadzone : 0 });
  };
  // Select Switch dropdown with search
  const renderSwitches = () => {
    const q = $<HTMLInputElement>('sw-search').value.trim().toLowerCase();
    $('sw-list').replaceChildren(...SWITCHES.map((name, i) => {
      const b = el('button', 'drop-item' + (i === trigFields.switchType ? ' on' : ''), name) as HTMLButtonElement;
      b.dataset.switch = String(i);
      b.hidden = !!q && !name.toLowerCase().includes(q);
      b.onclick = () => { $('sw-menu').hidden = true; writeTriggers({ switchType: i }); };
      return b;
    }));
  };
  $('sw-btn').onclick = (e) => {
    e.stopPropagation();
    if (!state.trigSel.size) { toast('Select keys on the keyboard first'); return; }
    $<HTMLInputElement>('sw-search').value = '';
    renderSwitches();
    $('sw-menu').hidden = !$('sw-menu').hidden;
  };
  $('sw-search').oninput = renderSwitches;
  $('cal-start').onclick = () => calibration('start');
  $('cal-finish').onclick = () => calibration('stop');
  $('cal-restart').onclick = () => calibration('restart');
  $('sw-menu').onclick = (e) => e.stopPropagation();
  document.addEventListener('click', () => ($('sw-menu').hidden = true));
  // Berserk Mode (funcConfig byte 7 bit 0) unlocks the 0.005 mm RT precision
  $('p-tachyon').onclick = async () => {
    const p = await call<Performance>('setPerformance', state.profile, { tachyon: !state.perf!.tachyon });
    if (p) { state.perf = p; renderTriggerPanel(); toast(`Berserk Mode ${p.tachyon ? 'on' : 'off'}`); }
  };
  for (const [id, f] of [['prec-press', 'pressPrecision'], ['prec-release', 'releasePrecision']] as const) {
    document.querySelectorAll<HTMLButtonElement>(`#${id} .radio`).forEach((b) => (b.onclick = () => writeTriggers({ [f]: Number(b.dataset.prec) })));
  }
  $('dz-cancel').onclick = () => {
    $('dz-dialog').hidden = true;
    if (state.trigSel.size) loadTriggerFields(Math.min(...state.trigSel));
    renderTriggerPanel();
  };
  document.querySelectorAll<HTMLButtonElement>('#trig-views button').forEach((b) => (b.onclick = () => {
    state.trigView = b.dataset.view!;
    renderKeyboard();
    renderTriggerPanel();
    paintTravel();
  }));
  document.querySelectorAll<HTMLButtonElement>('#trig-select button').forEach((b) => (b.onclick = () => {
    const all = LAYOUT.map((_, i) => i);
    const sel = b.dataset.sel;
    if (sel === 'defaults') { writeTriggers(FACTORY_TRIGGER); return; }
    if (sel === 'wasd') state.trigSel = new Set(all.filter((i) => WASD.includes(LAYOUT[i][3])));
    else if (sel === 'all') state.trigSel = new Set(all);
    else if (sel === 'invert') state.trigSel = new Set(all.filter((i) => !state.trigSel.has(i)));
    else state.trigSel = new Set();
    if (state.trigSel.size) loadTriggerFields(Math.min(...state.trigSel));
    renderKeyboard();
    renderTriggerPanel();
  }));
}

// key config

function selectKey(i: number) {
  state.selected = state.selected === i ? -1 : i;
  renderKeyHint();
  renderKeyboard();
}

function renderKeyHint() {
  const k = state.keys[state.selected];
  $('key-hint').textContent = state.selected < 0 || !k
    ? 'Drag or click the command to the target key to assign.'
    : `${keyName(k)} (#${state.selected}) selected. Click a command below or press a key to assign it.`;
}

function renderPicker() {
  const p = $('picker');
  const keys: HTMLElement[] = [];
  PICK_ROWS.forEach((row, y) => {
    let x = 0;
    for (const item of row) {
      const [usage, w, h] = Array.isArray(item) ? [item[0], item[1], item[2] ?? 1] : [item, 1, 1];
      if (usage != null) {
        const b = el('button', 'key', capLabel(usage));
        b.dataset.usage = String(usage);
        placeKey(b, x, y, w, h, 0.09);
        b.onclick = () => assignKey(usage);
        keys.push(b);
      }
      x += w;
    }
  });
  p.style.width = 'calc(var(--u) * 22.5)';
  p.style.height = 'calc(var(--u) * 6)';
  p.replaceChildren(...keys);
}

function renderFuncLists() {
  document.querySelectorAll<HTMLElement>('.funcs').forEach((box) => {
    box.replaceChildren(...FUNC_LISTS[box.dataset.list!].map(([code, name]) => {
      const b = el('button', 'func', name) as HTMLButtonElement;
      b.dataset.code = code.toString(16);
      b.title = code.toString(16).toUpperCase().padStart(6, '0');
      b.onclick = () => assignEntry([code >> 16, (code >> 8) & 0xff, code & 0xff], name);
      return b;
    }));
  });
}

// The search box filters the picker and every list by name.
function filterPicker() {
  const q = $<HTMLInputElement>('key-search').value.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>('#picker .key, .funcs .func, #macros .macro').forEach((k) =>
    k.classList.toggle('dim', !!q && !k.textContent!.toLowerCase().includes(q)));
}

async function assignEntry(entry: number[], name: string) {
  const i = state.selected;
  if (i < 0) { toast('Select a key on the keyboard first'); return; }
  if ((await call('setKeyEntry', state.profile, state.layer, i, entry)) !== null) {
    toast(`#${i} → ${name}`);
    state.selected = -1;
    await loadKeys();
  }
}

const LAYER_NAMES = ['Win Default', 'Win Fn', 'Mac Default', 'Mac Fn'];

async function restoreLayer() {
  const name = LAYER_NAMES[state.layer];
  if (!(await confirmDialog(`Restore ${name} to the factory key map? Remaps, macros and advanced keys on this layer are cleared.`, 'Restore'))) return;
  const keys = await call<KeyEntry[]>('restoreLayer', state.profile, state.layer);
  if (!keys) return;
  toast(`${name} restored`);
  state.selected = -1;
  await loadKeys();
}

async function assignKey(usage: number) {
  const i = state.selected;
  if (i < 0) { toast('Select a key on the keyboard first'); return; }
  if ((await call('setKey', state.profile, state.layer, i, usage)) !== null) {
    toast(`#${i} → ${HID_NAMES[usage] ?? usage}`);
    state.selected = -1;
    await loadKeys();
  }
}

async function bindMacro(m: number) {
  const i = state.selected;
  if (i < 0) { toast('Select a key on the keyboard first'); return; }
  if ((await call('bindMacro', state.profile, state.layer, i, m)) !== null) {
    toast(`#${i} → M${m + 1}`);
    state.selected = -1;
    await loadKeys();
  }
}

async function loadKeys() {
  const keys = await call<KeyEntry[]>('keymap', state.profile, state.layer);
  if (keys) state.keys = keys;
  if (state.layer === 0 && keys) state.base = keys;
  renderKeyboard();
  renderKeyHint();
}

// macros (shortcut record): click a macro to bind it to the selected key, edit to record it

function renderMacros() {
  $('macros').replaceChildren(...state.macros.map((m, i) => {
    const row = el('div', 'macro');
    row.dataset.macro = String(i);
    const bind = el('button', 'macro-bind', 'Bind') as HTMLButtonElement;
    bind.disabled = !state.writes.keymap;
    bind.onclick = (e) => { e.stopPropagation(); bindMacro(i); };
    const edit = el('button', 'macro-edit', 'Edit') as HTMLButtonElement;
    edit.disabled = !state.writes.macros;
    edit.onclick = (e) => { e.stopPropagation(); openMacroEditor(i); };
    const steps = m.actions.filter((a) => a.down).map((a) => HID_NAMES[a.code] ?? a.code).join(' + ');
    row.append(icon('i-m'), el('span', '', `M${i + 1}`), el('span', 'n', steps), bind, edit);
    row.onclick = () => bindMacro(i);
    return row;
  }));
}

function openMacroEditor(i: number) {
  state.editingMacro = i;
  state.recorded = state.macros[i].actions.slice();
  state.recording = false;
  $('macro-editor').hidden = false;
  $('macro-title').textContent = `M${i + 1}`;
  $('macro-record').textContent = 'Record';
  $<HTMLButtonElement>('macro-save').disabled = true;
  renderSteps();
}

function renderSteps() {
  $('macro-steps').textContent = state.recorded.length ? state.recorded.map(actionText).join('  ·  ') : 'No steps';
}

function toggleRecord() {
  state.recording = !state.recording;
  if (state.recording) {
    state.recorded = [];
    state.lastEventAt = 0;
    renderSteps();
  }
  $('macro-record').textContent = state.recording ? 'Stop' : 'Record';
  $<HTMLButtonElement>('macro-save').disabled = state.recording;
}

function recordEvent(e: KeyboardEvent, down: boolean) {
  const code = CODE_TO_HID[e.code];
  if (code == null || (down && e.repeat)) return;
  const now = performance.now();
  // The delay belongs to the previous step: time until this event.
  const prev = state.recorded[state.recorded.length - 1];
  if (prev && state.lastEventAt) prev.delay = Math.max(5, Math.round(now - state.lastEventAt));
  state.lastEventAt = now;
  state.recorded.push({ kind: code >= 0xe0 ? 'modifier' : 'key', down, code, delay: 5 });
  renderSteps();
}

async function saveMacro(actions: MacroAction[]) {
  const next = state.macros.map((m, i) => (i === state.editingMacro ? { ...m, actions } : m));
  const saved = await call<Macro[]>('setMacros', next);
  if (saved) {
    state.macros = saved;
    renderMacros();
    $('macro-editor').hidden = true;
    toast(`M${state.editingMacro + 1} saved`);
    state.editingMacro = -1;
  }
}

// advanced keys: RS, mod-tap, toggle and dynamic keystroke, bound on layer 1

const ADV_TYPE: Record<AdvKind, number> = { dks: 0x90, tgl: 0x91, mt: 0x92, rs: 0x93, socd: 0x94 };
const ADV_INFO: Record<AdvKind, [string, string, string]> = {
  rs: ['i-rs', 'RS', 'Deeper press takes priority'],
  socd: ['i-socd', 'SOCD', 'Inputs triggered based on rules'],
  dks: ['i-dks', 'Dynamic Key Press (DKS)', 'One key can perform 4 functions based on different press depths.'],
  mt: ['i-mt', 'Hold/Tap (MT)', 'One key achieves 2 functions: Hold for one, Tap for another.'],
  tgl: ['i-tgl', 'Toggle switch (TGL)', 'Click once to toggle hold, click again to release'],
};
// the vendor's order
const ADV_ORDER: AdvKind[] = ['rs', 'socd', 'dks', 'mt', 'tgl'];
// RS and SOCD bind two keys and use two MT slots in a row
const isPair = (k?: AdvKind) => k === 'rs' || k === 'socd';
const ADV_LIMIT = 40;
const kindOf = (e?: KeyEntry) => ADV_ORDER.find((k) => e && e.type === ADV_TYPE[k]);

// Target keys are stored as [0x10, 0, usage]; modifiers as a bit in code1, like the keymap.
function toRef(usage: number): KeyRef {
  if (!usage) return [0, 0, 0];
  return usage >= 0xe0 && usage <= 0xe7 ? [0x10, 1 << (usage - 0xe0), 0] : [0x10, 0, usage];
}
function fromRef(r: KeyRef): number {
  if (r[0] !== 0x10) return 0;
  return r[1] && !r[2] ? 0xe0 + Math.log2(r[1]) : r[2];
}

function keySelect(id: string, usage: number) {
  const s = document.createElement('select');
  s.className = 'select';
  s.id = id;
  const codes = Object.keys(HID_NAMES).map(Number).filter((c) => c !== 0xff).sort((a, b) => a - b);
  s.replaceChildren(...codes.map((c) => {
    const o = document.createElement('option');
    o.value = String(c);
    o.textContent = c >= 0xe4 && c <= 0xe7 ? 'R' + HID_NAMES[c] : HID_NAMES[c];
    return o;
  }));
  s.value = String(usage);
  return s;
}

function formRow(label: string, ...controls: HTMLElement[]) {
  const f = el('label', 'form-row');
  f.append(el('span', '', label), ...controls);
  return f;
}

// Slots a kind already uses. RS pairs live in the MT slots, one slot per key of the pair.
function usedSlots(kind: AdvKind): Set<number> {
  const kinds = kind === 'mt' || isPair(kind) ? ['mt', 'rs', 'socd'] : [kind];
  return new Set(state.base.filter((b) => kinds.includes(kindOf(b) ?? '')).map((b) => b.code1));
}

// The slot a key uses: its own if it is already bound to this kind, otherwise the first slot no key uses.
function slotFor(kind: AdvKind, key: number): number {
  const e = state.base[key];
  if (kindOf(e) === kind) return isPair(kind) ? e.code1 & ~1 : e.code1;
  const used = usedSlots(kind);
  // RS takes two slots in a row, s for key 1 and s + 1 for key 2
  const step = isPair(kind) ? 2 : 1;
  for (let s = 0; s + step <= 32; s += step) if (!used.has(s) && (step === 1 || !used.has(s + 1))) return s;
  return -1;
}

// An RS key stores its partner's matrix index in code2; the key with the even slot is key 1.
function rsPair(i: number): [number, number] {
  const e = state.base[i];
  return e.code1 % 2 === 0 ? [i, e.code2] : [e.code2, i];
}

function selectAdvKey(i: number) {
  const k = kindOf(state.base[i]);
  if (isPair(state.advKind) && !k && state.advKey >= 0 && state.rsPick === 1 && state.rsKey2 >= 0) {
    // Bind Key1 was chosen again: replace key 1, keep key 2
    if (i !== state.rsKey2) state.advKey = i;
    state.rsPick = 2;
  } else if (isPair(state.advKind) && !k && state.advKey >= 0 && state.rsPick === 2) {
    // second click while editing RS picks key 2
    if (i !== state.advKey) state.rsKey2 = i;
    state.rsPick = 1;
  } else if (isPair(k)) {
    state.advKind = k!;
    state.socdMode = -1;
    [state.advKey, state.rsKey2] = rsPair(i);
  } else {
    state.advKey = state.advKey === i ? -1 : i;
    state.rsKey2 = -1;
    state.rsPick = 2;
    if (k) state.advKind = k;
  }
  renderKeyboard();
  renderAdvanced();
}

function renderAdvanced() {
  $('adv-kinds').replaceChildren(...ADV_ORDER.map((k) => {
    const [ic, title, desc] = ADV_INFO[k];
    const b = el('button', 'adv-kind' + (k === state.advKind ? ' on' : '')) as HTMLButtonElement;
    b.dataset.kind = k;
    b.append(icon(ic), el('b', '', title), el('small', '', desc));
    b.onclick = () => { state.advKind = k; state.advKey = -1; state.rsKey2 = -1; state.socdMode = -1; renderKeyboard(); renderAdvanced(); };
    return b;
  }));

  // an RS pair counts once, listed on its key 1
  const bound = state.base.map((e, i) => ({ e, i, k: kindOf(e) }))
    .filter((b) => b.k && b.i < LAYOUT.length && !(isPair(b.k) && b.e.code1 % 2 === 1));
  $('adv-count').textContent = `${bound.length}/${ADV_LIMIT}`;
  $('adv-list').replaceChildren(...bound.map(({ e, i, k }) => {
    const row = el('div', 'adv-item');
    const what = isPair(k) ? `${capLabel(LAYOUT[i][3])} + ${capLabel(LAYOUT[e.code2]?.[3] ?? 0)}` : `${capLabel(LAYOUT[i][3])} · #${i}`;
    const n = isPair(k) ? e.code1 / 2 + 1 : e.code1 + 1;
    row.append(el('b', '', `${k!.toUpperCase()}${n}`), el('span', 'n', what));
    const edit = el('button', '', 'Edit');
    edit.onclick = () => selectAdvKey(i);
    row.append(edit);
    return row;
  }));
  renderAdvEditor();
}

function renderTestBoxes() {
  if ($('test-press')) {
    $('test-press').replaceChildren(...state.testPress.map((t) => el('div', '', t)));
    $('test-release').replaceChildren(...state.testRelease.map((t) => el('div', '', t)));
  }
}

function renderAdvEditor() {
  const ed = $('adv-editor');
  const kind = state.advKind;
  const key = state.advKey;
  if (key < 0 || !state.adv) {
    // nothing selected: the column is the vendor's binding test
    $('adv-title').textContent = 'Test Your Binding';
    ed.replaceChildren(
      el('div', 'test-lbl', 'Press Test'), Object.assign(el('div', 'test-box'), { id: 'test-press' }),
      el('div', 'test-lbl', 'ReleaseTest'), Object.assign(el('div', 'test-box'), { id: 'test-release' }),
      el('div', 'empty-txt', 'Pick a function on the left and click a key on the keyboard to edit it.'),
    );
    renderTestBoxes();
    return;
  }
  $('adv-title').textContent = ADV_INFO[kind][1];
  const boundKinds = state.base.filter((e, i) => kindOf(e) && i < LAYOUT.length && !(isPair(kindOf(e)) && e.code1 % 2)).length;
  if (!kindOf(state.base[key]) && boundKinds >= ADV_LIMIT) {
    ed.replaceChildren(el('div', 'empty-txt', `All ${ADV_LIMIT} bindings are in use. Unbind one first.`));
    return;
  }
  if (isPair(kind)) { renderPairEditor(ed, kind); return; }
  const slot = slotFor(kind, key);
  if (slot < 0) {
    ed.replaceChildren(el('div', 'empty-txt', `All 32 ${kind.toUpperCase()} slots are in use.`));
    return;
  }
  const parts: HTMLElement[] = [el('div', 'empty-txt', `${capLabel(LAYOUT[key][3])} (#${key}) · slot ${slot + 1} · Win Default layer`)];
  if (kind === 'mt') {
    const s = state.adv.mt[slot];
    parts.push(formRow('Tap', keySelect('adv-tap', fromRef(s.tap))), formRow('Hold', keySelect('adv-hold', fromRef(s.hold))));
    // hold time is stored in the key entry's code2 in 10 ms steps; an existing MT keeps its value
    const bound = state.base[key];
    const holdMs = kindOf(bound) === 'mt' && bound.code2 ? bound.code2 * 10 : 150;
    const hold = el('input', 'range') as HTMLInputElement;
    Object.assign(hold, { type: 'range', id: 'adv-holdtime', min: '0', max: '1000', step: '10', value: String(holdMs) });
    const holdV = el('span', 'val', `${holdMs}ms`);
    hold.oninput = () => { paintRange(hold); holdV.textContent = `${hold.value}ms`; };
    paintRange(hold);
    const row = el('div', 'slider-row');
    row.append(hold, holdV);
    const block = el('div', 'hold-time');
    block.append(el('b', '', 'Manual Adjustment of Hold Time (The default is 150ms)'),
      el('small', '', 'If "hold" is assigned to Ctrl / Alt / Shift, it takes priority in combos'), row);
    parts.push(block);
  } else if (kind === 'tgl') {
    parts.push(formRow('Key', keySelect('adv-tgl', fromRef(state.adv.tgl[slot]))));
  } else {
    parts.push(dksEditor(state.adv.dks[slot]));
  }
  const actions = el('div', 'actions');
  const save = el('button', 'primary-btn', 'Save and bind') as HTMLButtonElement;
  save.id = 'adv-save';
  save.disabled = !state.writes.keymap;
  save.onclick = () => saveAdvanced(kind, key, slot);
  actions.append(save);
  if (kindOf(state.base[key])) {
    const unbind = el('button', 'white-btn', 'Unbind') as HTMLButtonElement;
    unbind.id = 'adv-unbind';
    unbind.onclick = () => unbindAdvanced(key);
    actions.append(unbind);
  }
  parts.push(actions);
  ed.replaceChildren(...parts);
}

// DKS: four trigger points (0.01 mm) and, for each of the four keys, one phase bit per stage of the press:
// pressing past point 1, bottoming out, leaving the bottom, releasing past point 1.
const DKS_STAGES = ['Press', 'Bottom', 'Lift', 'Release'];

function dksEditor(s: DksSlot) {
  const box = el('div', 'dks');
  const pts = el('div', 'dks-points');
  s.points.forEach((p, i) => {
    const inp = el('input', 'num-box') as HTMLInputElement;
    inp.id = `adv-pt${i}`;
    inp.value = mm(p);
    pts.append(formRow(`Point ${i + 1}`, inp, el('span', '', 'mm')));
  });
  const grid = el('div', 'dks-grid');
  grid.append(el('span'), ...DKS_STAGES.map((t) => el('span', 'dks-stage', t)));
  s.keys.forEach((k, i) => {
    grid.append(keySelect(`adv-k${i}`, fromRef(k.key)));
    DKS_STAGES.forEach((_, st) => {
      const b = el('button', 'dks-cell' + (k.phases & (1 << st) ? ' on' : '')) as HTMLButtonElement;
      b.dataset.key = String(i);
      b.dataset.stage = String(st);
      b.onclick = () => b.classList.toggle('on');
      grid.append(b);
    });
  });
  box.append(pts, grid);
  return box;
}

function dksFromEditor(): DksSlot {
  const phases = [0, 0, 0, 0];
  document.querySelectorAll<HTMLElement>('.dks-cell.on').forEach((c) => (phases[Number(c.dataset.key)] |= 1 << Number(c.dataset.stage)));
  return {
    points: [0, 1, 2, 3].map((p) => Math.max(0, Math.min(255, toUnits($<HTMLInputElement>(`adv-pt${p}`).value) || 0))),
    keys: [0, 1, 2, 3].map((k) => ({ key: toRef(num(`adv-k${k}`)), phases: phases[k] })),
  };
}

// RS and SOCD: pick key 1 and key 2 on the keyboard. RS sends the deeper-pressed key; SOCD follows its trigger condition.
const SOCD_MODES: [string, string][] = [
  ['Last Input Priority', 'The last activated key overrides the previous key'],
  ['Absolute Priority(Key1)', 'Key 1 always takes priority over Key 2'],
  ['Absolute Priority (Key 2)', 'Key 2 always takes priority over Key 1'],
  ['Cancel Mode', 'When both keys are pressed, neither will trigger'],
];
// key 2 stores the mirror of key 1's priority
const mirror = (p: number) => (p === 1 ? 2 : p === 2 ? 1 : p);

function renderPairEditor(ed: HTMLElement, kind: AdvKind) {
  const k1 = state.advKey;
  const k2 = state.rsKey2;
  const pick = (n: 1 | 2, key: number) => {
    const b = el('button', 'outline-btn rs-pick' + (state.rsPick === n ? ' on' : '')) as HTMLButtonElement;
    b.id = `rs-key${n}`;
    b.append(`Bind Key${n === 1 ? ' 1' : '2'}: `, el('b', '', key >= 0 ? capLabel(LAYOUT[key][3]) : 'click a key'));
    b.onclick = () => { state.rsPick = n; renderAdvEditor(); };
    return b;
  };
  const parts: HTMLElement[] = [
    el('div', 'empty-txt', kind === 'rs' ? 'Press either key: the one pressed deeper is sent. Click a Bind button, then a key on the keyboard.'
      : 'Click a Bind button, then a key on the keyboard.'),
    pick(1, k1), pick(2, k2),
  ];
  if (kind === 'socd') {
    if (state.socdMode < 0) state.socdMode = k1 >= 0 && kindOf(state.base[k1]) === 'socd' ? state.triggers[k1]?.priority ?? 0 : 0;
    const card = el('div', 'socd-card');
    card.append(el('b', '', 'Trigger Condition'), el('small', '', 'Choose an action when two keys are pressed'),
      ...SOCD_MODES.map(([title, text], m) => {
        const b = el('button', 'socd-opt' + (m === state.socdMode ? ' on' : '')) as HTMLButtonElement;
        b.dataset.mode = String(m);
        b.append(el('span', 'radio' + (m === state.socdMode ? ' on' : '')), el('span', '', title), el('small', '', text));
        b.onclick = () => { state.socdMode = m; renderAdvEditor(); };
        return b;
      }));
    parts.push(card);
  }
  const actions = el('div', 'actions');
  const save = el('button', 'primary-btn', 'Save and bind') as HTMLButtonElement;
  save.id = 'adv-save';
  save.disabled = !state.writes.keymap || k1 < 0 || k2 < 0;
  save.onclick = () => savePair(kind, k1, k2);
  actions.append(save);
  if (isPair(kindOf(state.base[k1]))) {
    const unbind = el('button', 'white-btn', 'Delete') as HTMLButtonElement;
    unbind.id = 'adv-unbind';
    unbind.onclick = () => deletePair(k1, k2);
    actions.append(unbind);
  }
  parts.push(actions);
  ed.replaceChildren(...parts);
}

// The entry a key sends by default: its factory function on layer 1.
const defaultEntry = (key: number): KeyRef => (LAYOUT[key][3] === 0xff ? [0xf0, 0xff, 0x09] : toRef(LAYOUT[key][3]));

async function savePair(kind: AdvKind, k1: number, k2: number) {
  const s = slotFor(kind, k1);
  if (s < 0) { toast(`No free slots for ${kind.toUpperCase()}`); return; }
  const a = state.adv!;
  const slots = a.mt.map((m, i) => (i === s ? { tap: defaultEntry(k1), hold: defaultEntry(k2) }
    : i === s + 1 ? { tap: defaultEntry(k2), hold: defaultEntry(k1) } : m));
  const next = await call<Advanced>('setAdvanced', state.profile, 'mt', slots);
  if (!next) return;
  state.adv = next;
  const type = ADV_TYPE[kind];
  if ((await call('setKeyEntry', state.profile, 0, k1, [type, s, k2])) === null) return;
  if ((await call('setKeyEntry', state.profile, 0, k2, [type, s + 1, k1])) === null) return;
  if (kind === 'socd') {
    // the trigger condition is the priority nibble of both keys' trigger records
    await call('setTriggers', state.profile, [k1], { priority: state.socdMode });
    const t = await call<Trigger[]>('setTriggers', state.profile, [k2], { priority: mirror(state.socdMode) });
    if (t) state.triggers = t;
  }
  toast(`${kind.toUpperCase()}${s / 2 + 1}: ${capLabel(LAYOUT[k1][3])} + ${capLabel(LAYOUT[k2][3])}`);
  await reloadBase();
}

// Deleting a pair frees both MT slots, puts both keys back and clears their priority.
async function deletePair(k1: number, k2: number) {
  const s = state.base[k1].code1 & ~1;
  const empty: MtSlot = { tap: [0, 0, 0], hold: [0, 0, 0] };
  const next = await call<Advanced>('setAdvanced', state.profile, 'mt', state.adv!.mt.map((m, i) => (i === s || i === s + 1 ? empty : m)));
  if (next) state.adv = next;
  await unbindAdvanced(k1, false);
  await unbindAdvanced(k2, false);
  const t = await call<Trigger[]>('setTriggers', state.profile, [k1, k2], { priority: 0 });
  if (t) state.triggers = t;
  state.advKey = -1;
  state.rsKey2 = -1;
  await reloadBase();
}

const num = (id: string) => Number($<HTMLInputElement>(id).value) || 0;

async function saveAdvanced(kind: AdvKind, key: number, slot: number) {
  const a = state.adv!;
  let slots: unknown[];
  if (kind === 'mt') slots = a.mt.map((s, i) => (i === slot ? { tap: toRef(num('adv-tap')), hold: toRef(num('adv-hold')) } : s));
  else if (kind === 'tgl') slots = a.tgl.map((s, i) => (i === slot ? toRef(num('adv-tgl')) : s));
  else slots = a.dks.map((s, i) => (i === slot ? dksFromEditor() : s));
  const next = await call<Advanced>('setAdvanced', state.profile, kind, slots);
  if (!next) return;
  state.adv = next;
  // MT keys keep their hold time in code2 (10 ms steps); 0 would make the key dead, so the minimum stored is 1.
  const extra = kind === 'mt' ? Math.max(1, Math.round(num('adv-holdtime') / 10)) : 0;
  if ((await call('setKeyEntry', state.profile, 0, key, [ADV_TYPE[kind], slot, extra])) === null) return;
  toast(`${capLabel(LAYOUT[key][3])} → ${kind.toUpperCase()}${slot + 1}`);
  await reloadBase();
}

// Unbinding puts the key's factory function back.
async function unbindAdvanced(key: number, reload = true) {
  if ((await call('setKeyEntry', state.profile, 0, key, [...defaultEntry(key)])) === null) return;
  toast(`${capLabel(LAYOUT[key][3])} back to default`);
  if (reload) await reloadBase();
}

async function reloadBase() {
  const base = await call<KeyEntry[]>('keymap', state.profile, 0);
  if (base) state.base = base;
  if (state.layer === 0) state.keys = state.base;
  renderKeyboard();
  renderAdvanced();
}

// live key travel: debug mode makes the keyboard report every key's travel (0xA0 reports)

// travel reports name the key by its factory entry; map that back to the matrix index
const ENTRY_INDEX = new Map<string, number>(LAYOUT.map((_, i) => [(LAYOUT[i][3] === 0xff ? [0xf0, 0xff, 0x09] : toRef(LAYOUT[i][3])).join(), i]));
const TRAVEL_FULL = 340; // 3.40 mm, the deepest point the vendor shows

async function setTravel(on: boolean) {
  await call('setTravel', on);
  if (!on) { state.travel = []; paintTravel(); }
}

// calibration view: live travel per key, and a key is done once its calibration state changes
const cal = { open: false, first: new Map<number, number>(), done: new Set<number>() };

function renderCalibration() {
  const board = $('cal-kbd');
  sizeBoard(board);
  board.replaceChildren(...LAYOUT.map(([x, y, w, def], i) => {
    const k = el('span', 'key' + (cal.done.has(i) ? ' done' : ''), capLabel(def));
    k.dataset.index = String(i);
    placeKey(k, x, y, w);
    k.style.setProperty('--travel', `${Math.min(100, ((state.travel[i] ?? 0) / TRAVEL_FULL) * 100)}%`);
    return k;
  }));
  $('cal-count').textContent = `${cal.done.size}/${LAYOUT.length}`;
}

async function calibration(action: 'start' | 'stop' | 'restart') {
  if (action !== 'stop') { cal.first.clear(); cal.done.clear(); state.travel = []; }
  const r = await call<boolean>('calibration', action);
  cal.open = action !== 'stop' && r === true;
  $('cal-view').hidden = !cal.open;
  if (cal.open) renderCalibration();
  else if (action === 'stop' && r !== null) toast('Calibration finished');
}

let travelFrame = 0;
function onTravel(r: { entry: number[]; travel: number; state: number }) {
  const i = ENTRY_INDEX.get(r.entry.join());
  if (i == null) return;
  if (cal.open) {
    if (!cal.first.has(i)) cal.first.set(i, r.state);
    else if (r.state !== cal.first.get(i)) cal.done.add(i);
  }
  state.travel[i] = r.travel;
  dksTest(i, r.travel);
  if (!travelFrame) travelFrame = requestAnimationFrame(() => { travelFrame = 0; paintTravel(); if (cal.open) renderCalibration(); });
}

// Fills each key from the bottom with its travel; only in the Trigger tab's Preview display.
function paintTravel() {
  if (state.tab !== 'trigger' || state.trigView !== 'preview') return;
  document.querySelectorAll<HTMLElement>('#kbd .key').forEach((k) => {
    const t = state.travel[Number(k.dataset.index)] ?? 0;
    k.style.setProperty('--travel', `${Math.min(100, (t / TRAVEL_FULL) * 100)}%`);
    k.classList.toggle('down', t > 10);
    const v = k.querySelector('.travel-v');
    if (v) v.textContent = mm(Math.min(t, TRAVEL_FULL));
  });
}

// Test Your Binding: DKS keys report the vendor's four stages from their travel
const DKS_WORDS = ['Key Pressed', 'Button bottoming out', 'Lift Upon Bottoming Out', 'Fully Lifted'];
const dksStage: Record<number, { stage: number; max: number }> = {};
function dksTest(i: number, travel: number) {
  if (state.tab !== 'advanced' || kindOf(state.base[i]) !== 'dks') return;
  const st = (dksStage[i] ??= { stage: 3, max: 0 });
  const name = capLabel(LAYOUT[i][3]);
  let next = st.stage;
  if (travel <= 10) next = 3;
  else if (st.stage === 3 && travel > 10) next = 0;
  else if (st.stage === 0 && travel >= TRAVEL_FULL - 40) next = 1;
  else if (st.stage === 1 && travel < st.max - 30) next = 2;
  st.max = next === 1 ? Math.max(st.max, travel) : next === 3 ? 0 : st.max;
  if (next === st.stage) return;
  st.stage = next;
  const line = `${name}: ${DKS_WORDS[next]}`;
  if (next < 2) state.testPress = [...state.testPress, line].slice(-8);
  else state.testRelease = [...state.testRelease, line].slice(-8);
  renderTestBoxes();
}

// keyboard capture for remapping, the macro recorder and the binding test

window.addEventListener('keydown', (e) => {
  if (state.recording) { e.preventDefault(); recordEvent(e, true); return; }
  if (state.tab === 'advanced' && !e.repeat) {
    state.testPress = [...state.testPress, `Key Pressed: ${HID_NAMES[CODE_TO_HID[e.code]] ?? e.code}`].slice(-8);
    renderTestBoxes();
  }
  if (state.tab === 'keys' && state.selected >= 0 && !(e.target instanceof HTMLInputElement)) {
    const usage = CODE_TO_HID[e.code];
    if (usage != null) { e.preventDefault(); assignKey(usage); }
  }
});
window.addEventListener('keyup', (e) => {
  if (state.recording) { e.preventDefault(); recordEvent(e, false); }
  if (state.tab === 'advanced') {
    state.testRelease = [...state.testRelease, `Key Released: ${HID_NAMES[CODE_TO_HID[e.code]] ?? e.code}`].slice(-8);
    renderTestBoxes();
  }
});

// connect

async function loadProfile() {
  const l = await call<Lighting>('lighting', state.profile);
  if (l) {
    state.lighting = l;
    if (l.effect === EFFECT_CUSTOM) state.lightMode = 'custom';
    const c = await call<string[]>('keyColors', state.profile);
    if (c) state.keyColors = c;
    const lights = await call<LightStore>('lights');
    if (lights) state.lights = lights;
    renderLighting();
    renderRates();
  }
  const perf = await call<Performance>('performance', state.profile);
  if (perf) { state.perf = perf; renderPerformance(); }
  const t = await call<Trigger[]>('triggers', state.profile);
  if (t) state.triggers = t;
  const a = await call<Advanced>('advanced', state.profile);
  if (a) state.adv = a;
  const base = await call<KeyEntry[]>('keymap', state.profile, 0);
  if (base) state.base = base;
  renderTriggerPanel();
  renderAdvanced();
  await loadKeys();
}

async function connect() {
  $('status').textContent = 'Connecting';
  const c = await call<Connected>('connect');
  if (!c) { $('status').textContent = 'Not connected'; return; }
  state.writes = c.writes;
  state.profiles = c.profiles;
  state.profile = c.profiles.active;
  $('status').textContent = 'Connected';
  $('fw').textContent = `FW ${c.info.firmware}`;
  $('fw2').textContent = c.info.firmware;
  $('build').textContent = c.info.buildDate;
  renderProfiles();
  const pr = await call<Preset[]>('presets');
  if (pr) state.presets = pr;
  const cu = await call<CustomItem[]>('customConfigs');
  if (cu) state.custom = cu;
  renderList();
  const names = await call<string[]>('profileNames');
  if (names) { state.names = names; renderProfiles(); }
  const m = await call<Macro[]>('macros');
  if (m) { state.macros = m; renderMacros(); }
  await loadProfile();
}

function initTheme() {
  let dark = false;
  try { dark = localStorage.getItem('theme') === 'dark'; } catch { /* storage unavailable */ }
  const apply = () => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name=theme-color]')!.setAttribute('content', dark ? '#0E0E10' : '#F9F8F6');
  };
  apply();
  $('theme').onclick = () => {
    dark = !dark;
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* storage unavailable */ }
    apply();
  };
}

initTheme();
initLightingControls();
(jet75.onTravel as unknown as (fn: typeof onTravel) => void)(onTravel);
initCustomLighting();
initPerformanceControls();
initTriggerControls();
initSidebar();
renderPicker();
renderFuncLists();
renderPhotoKeyboard();
renderKeyboard();
renderTriggerPanel();
document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab!)));
document.querySelectorAll<HTMLButtonElement>('#key-subtabs button[data-sub]').forEach((b) => (b.onclick = () => setSub(b.dataset.sub!)));
$<HTMLInputElement>('key-search').oninput = filterPicker;
$('connect').onclick = connect;
$('macro-record').onclick = toggleRecord;
$('macro-save').onclick = () => saveMacro(state.recorded);
$('macro-clear').onclick = () => saveMacro([]);
$('macro-cancel').onclick = () => { state.recording = false; $('macro-editor').hidden = true; };
connect();
