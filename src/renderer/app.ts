// Renderer: plain script (no modules), talks to the main process through window.jet75.
// Layout and flow follow the vendor driver: profiles in a sidebar, six tabs over a centred keyboard,
// per-tab panels below. Changes apply to the keyboard straight away, like the vendor's.

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
interface Lighting {
  effect: number; brightness: number; speed: number; direction: number; customColorDisabled: boolean;
  color: string; sideEffect: number; sideBrightness: number; sideSpeed: number; sideColor: string; reportRateIndex: number;
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
type AdvKind = 'mt' | 'tgl' | 'dks';
interface Preset { id: number; name: string; help: string }
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
  presets: [] as Preset[],
  dragPreset: null as number | null,
  names: [] as string[],
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

const MOD_NAMES = ['Ctrl', 'Shift', 'Alt', 'Win', 'RCtrl', 'RShift', 'RAlt', 'RWin'];

function keyName(k: KeyEntry): string {
  if (k.type === 0xf0) return 'Fn';
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
  kbd.classList.toggle('pick', (editing && state.writes.keymap) || trig || adv);
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
    if (trig ? state.trigSel.has(i) : adv ? i === state.advKey : i === state.selected) b.classList.add('sel');
    b.onclick = () => (editing ? selectKey(i) : trig ? toggleTrigKey(i) : adv ? selectAdvKey(i) : undefined);
    return b;
  }));

  $('trig-select').hidden = !trig;
  $('trig-views').hidden = !trig;
  // Layer buttons stand where the vendor has win / mac layers; layer n is stored at index n.
  $('layers').hidden = !(editing || adv);
  const names = [['i-win', 'Win Default'], ['i-win', 'Win Fn'], ['i-apple', 'Mac Default'], ['i-apple', 'Mac Fn']];
  const restore = el('button', 'outline-btn', 'Restore defaults') as HTMLButtonElement;
  restore.disabled = true;
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

// A name the keyboard's own app stores as a reference to a built-in configuration, e.g. 'EQ<official@-5:0>QE'.
// Its number counts the vendor's list, which has one extra entry before the six configurations.
function profileName(i: number): string {
  const raw = state.names[i] ?? '';
  const ref = /^EQ<official@-(\d+):\d+>QE$/.exec(raw);
  if (ref) return state.presets.find((p) => p.id === Number(ref[1]) - 1)?.name ?? `Profile ${i + 1}`;
  return raw || `Profile ${i + 1}`;
}

function renderProfiles() {
  const p = state.profiles!;
  const enabled = p.order.slice(0, p.count);
  $('profile-count').textContent = `(${p.count}/4)`;
  const item = (i: number) => {
    const b = el('div', 'profile' + (i === p.active ? ' active' : '')) as HTMLDivElement;
    b.dataset.profile = String(i);
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    const label = el('span', 'profile-name', profileName(i));
    const more = el('button', 'icon-btn profile-more') as HTMLButtonElement;
    more.title = 'Rename';
    more.setAttribute('aria-label', `Rename ${profileName(i)}`);
    more.append(icon('i-dots'));
    more.onclick = (e) => { e.stopPropagation(); startRename(b, label, i); };
    b.append(label, el('span', 'spacer'), more);
    const usable = enabled.includes(i) && state.writes.profile;
    b.classList.toggle('disabled', !usable);
    b.onclick = () => usable && i !== p.active && switchProfile(i);
    b.onkeydown = (e) => { if (e.key === 'Enter' && e.target === b) b.click(); };
    b.ondblclick = () => startRename(b, label, i);
    // drop target for built-in configurations
    b.ondragover = (e) => {
      if (state.dragPreset == null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      b.classList.add('drop-target');
    };
    b.ondragleave = () => b.classList.remove('drop-target');
    b.ondrop = (e) => {
      e.preventDefault();
      b.classList.remove('drop-target');
      const id = state.dragPreset ?? Number(e.dataTransfer?.getData('text/plain'));
      state.dragPreset = null;
      if (Number.isInteger(id)) applyPreset(id, i);
    };
    return b;
  };
  $('profiles').replaceChildren(...enabled.map(item));
}

function startRename(row: HTMLElement, label: HTMLElement, i: number) {
  if (!state.writes.profile || row.querySelector('input')) return;
  const input = el('input', 'input rename') as HTMLInputElement;
  input.value = profileName(i);
  input.maxLength = 40;
  label.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (save: boolean) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (save && name !== profileName(i)) {
      const names = await call<string[]>('renameProfile', i, name === `Profile ${i + 1}` ? '' : name);
      if (names) { state.names = names; toast(`Renamed to ${name || `Profile ${i + 1}`}`); }
    }
    renderProfiles();
  };
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
  input.onclick = (e) => e.stopPropagation();
  input.onblur = () => finish(true);
}

// built-in configurations

function renderPresets() {
  $('presets').replaceChildren(...state.presets.map((p) => {
    // a div, not a button: Chromium does not start drags from <button> elements
    const b = el('div', 'profile preset') as HTMLDivElement;
    b.dataset.preset = String(p.id);
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    b.title = p.help;
    b.append(el('span', '', p.name), icon('i-help', 'ic sm'), el('span', 'spacer'), icon('i-dots'));
    const usable = state.writes.keymap;
    b.classList.toggle('disabled', !usable);
    b.draggable = usable;
    b.ondragstart = (e) => {
      state.dragPreset = p.id;
      if (e.dataTransfer) { e.dataTransfer.setData('text/plain', String(p.id)); e.dataTransfer.effectAllowed = 'copy'; }
      b.classList.add('dragging');
    };
    b.ondragend = () => { state.dragPreset = null; b.classList.remove('dragging'); };
    b.onclick = () => { if (usable) applyPreset(p.id, state.profile); };
    b.onkeydown = (e) => { if (e.key === 'Enter') b.click(); };
    return b;
  }));
}

async function applyPreset(id: number, profile: number) {
  const p = state.presets.find((x) => x.id === id);
  if (!p) return;
  const target = profileName(profile);
  if (!(await confirmDialog(`Apply ${p.name} to ${target}? This replaces its keys, lighting and trigger settings.`, 'Apply'))) return;
  const names = await call<string[]>('applyPreset', profile, id);
  if (names === null) return;
  state.names = names;
  renderProfiles();
  toast(`${p.name} applied to ${target}`);
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

// lighting

function renderLighting() {
  const l = state.lighting!;
  // an effect outside the vendor grid (custom, or an unknown value) gets its own button at the end
  const ids = EFFECT_ORDER.includes(l.effect) || l.effect === EFFECT_OFF ? EFFECT_ORDER : [...EFFECT_ORDER, l.effect];
  $('effects').replaceChildren(...ids.map((id) => {
    const b = el('button', 'effect' + (id === l.effect ? ' on' : '')) as HTMLButtonElement;
    const [name, ic] = EFFECTS[id] ?? [`Effect ${id}`, 'e-dot'];
    b.append(icon(ic), el('span', '', name));
    b.dataset.effect = String(id);
    b.disabled = !state.writes.lighting;
    b.onclick = () => patchLighting({ effect: id }, name);
    return b;
  }));
  $('light-on').classList.toggle('on', l.effect !== EFFECT_OFF);
  $<HTMLButtonElement>('light-on').disabled = !state.writes.lighting;
  $<HTMLInputElement>('speed').value = String(l.speed);
  $<HTMLInputElement>('brightness').value = String(l.brightness);
  paintRange($('speed'));
  paintRange($('brightness'));
  $('speed-v').textContent = `${l.speed}Level`;
  $('brightness-v').textContent = `${l.brightness}%`;
  $('custom-color').classList.toggle('on', !l.customColorDisabled);
  showColor(l.color);
  $('light-note').textContent = l.customColorDisabled ? 'This profile uses preset colours. Picking a colour turns custom colour on.' : '';
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
  clearTimeout(colorTimer);
  colorTimer = window.setTimeout(() => patchLighting({ color: hex }, 'Colour saved'), 300);
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
    const off = state.lighting!.effect !== EFFECT_OFF;
    patchLighting({ effect: off ? EFFECT_OFF : 1 }, off ? 'Lighting off' : 'Lighting on');
  };
  for (const id of ['speed', 'brightness'] as const) {
    const input = $<HTMLInputElement>(id);
    input.oninput = () => {
      paintRange(input);
      $(id + '-v').textContent = id === 'speed' ? `${input.value}Level` : `${input.value}%`;
    };
    input.onchange = () => patchLighting({ [id]: Number(input.value) }, `${id === 'speed' ? 'Speed' : 'Brightness'} ${input.value}`);
  }
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

const mm = (v: number) => (v / 100).toFixed(2);
const WASD = [0x1a, 0x04, 0x16, 0x07];
const FACTORY_TRIGGER: Partial<Trigger> = { keyMode: 1, actuation: 120, rtPress: 80, rtRelease: 80, pressDeadzone: 0, releaseDeadzone: 0 };
const RANGE_FIELDS = ['rtPress', 'rtRelease', 'pressDeadzone', 'releaseDeadzone'] as const;
const trigFields = { actuation: 120, rtPress: 80, rtRelease: 80, pressDeadzone: 0, releaseDeadzone: 0, keyMode: 1 };

function triggerLabel(t: Trigger): string {
  if (state.trigView === 'actuation') return mm(t.actuation);
  if (state.trigView === 'rt') return mm(t.rtPress);
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
  Object.assign(trigFields, { actuation: t.actuation, rtPress: t.rtPress, rtRelease: t.rtRelease, pressDeadzone: t.pressDeadzone, releaseDeadzone: t.releaseDeadzone, keyMode: t.keyMode });
  state.separate = t.rtPress !== t.rtRelease;
}

function renderTriggerPanel() {
  const n = state.trigSel.size;
  $('trig-count').textContent = n ? `${n} key${n > 1 ? 's' : ''} selected. Changes are written to them straight away.` : 'Select keys on the keyboard to change them.';
  if (document.activeElement !== $('t-actuation')) $<HTMLInputElement>('t-actuation').value = mm(trigFields.actuation);
  $('t-fill').style.height = `${Math.min(100, (trigFields.actuation / 300) * 100)}%`;
  for (const f of RANGE_FIELDS) {
    const r = $<HTMLInputElement>(`t-${f}`);
    r.value = String(trigFields[f]);
    paintRange(r);
    if (document.activeElement !== $(`t-${f}-n`)) $<HTMLInputElement>(`t-${f}-n`).value = mm(trigFields[f]);
  }
  $('t-separate').classList.toggle('on', state.separate);
  $<HTMLInputElement>('t-rtRelease').disabled = !state.separate;
  $<HTMLInputElement>('t-rtRelease-n').disabled = !state.separate;
  // Rapid trigger is key mode 1 (the factory value) on, 0 off. Which mode really enables it is unverified.
  // keyMode: 0 = quick trigger off, 1 = on, 2 = on with rapid trigger
  $('t-rt').classList.toggle('on', trigFields.keyMode >= 1);
  $<HTMLButtonElement>('t-rt').disabled = !n;
  $('t-rapid').classList.toggle('on', trigFields.keyMode === 2);
  $<HTMLButtonElement>('t-rapid').disabled = !n || trigFields.keyMode < 1;
  document.querySelectorAll<HTMLButtonElement>('#trig-views button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.trigView));
}

let trigTimer = 0;
async function writeTriggers(patch: Partial<Trigger>) {
  Object.assign(trigFields, patch);
  renderTriggerPanel();
  const keys = [...state.trigSel].sort((a, b) => a - b);
  if (!keys.length) { toast('Select keys on the keyboard first'); return; }
  const t = await call<Trigger[]>('setTriggers', state.profile, keys, patch);
  if (t) {
    state.triggers = t;
    renderKeyboard();
    clearTimeout(trigTimer);
    trigTimer = window.setTimeout(() => toast(`Saved on ${keys.length} key${keys.length > 1 ? 's' : ''}`), 150);
  }
}

const toUnits = (v: string) => Math.round(parseFloat(v) * 100);

function initTriggerControls() {
  const act = $<HTMLInputElement>('t-actuation');
  act.onchange = () => {
    const v = toUnits(act.value);
    if (v >= 10 && v <= 400) writeTriggers({ actuation: v });
  };
  drag($('t-bar'), (_, fy) => {
    trigFields.actuation = Math.max(10, Math.round(fy * 300));
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
    r.onchange = () => writeTriggers(patchFor(Number(r.value)));
    $<HTMLInputElement>(`t-${f}-n`).onchange = (e) => {
      const v = toUnits((e.target as HTMLInputElement).value);
      if (v >= Number(r.min) && v <= Number(r.max)) writeTriggers(patchFor(v));
    };
  }
  $('t-rt').onclick = () => writeTriggers({ keyMode: trigFields.keyMode >= 1 ? 0 : 1 });
  $('t-rapid').onclick = () => writeTriggers({ keyMode: trigFields.keyMode === 2 ? 1 : 2 });
  $('t-separate').onclick = () => { state.separate = !state.separate; renderTriggerPanel(); };
  $('dz-toggle').onclick = () => ($('dz').hidden = !$('dz').hidden);
  document.querySelectorAll<HTMLButtonElement>('#trig-views button').forEach((b) => (b.onclick = () => {
    state.trigView = b.dataset.view!;
    renderKeyboard();
    renderTriggerPanel();
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

function filterPicker() {
  const q = $<HTMLInputElement>('key-search').value.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>('#picker .key').forEach((k) => k.classList.toggle('dim', !!q && !k.textContent!.toLowerCase().includes(q)));
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

// advanced keys: mod-tap, toggle and dynamic keystroke, bound on layer 1

const ADV_TYPE: Record<AdvKind, number> = { dks: 0x90, tgl: 0x91, mt: 0x92 };
const ADV_INFO: Record<string, [string, string, string]> = {
  rs: ['i-rs', 'RS', 'Deeper press takes priority (not supported yet)'],
  socd: ['i-socd', 'SOCD', 'Inputs triggered based on rules (not supported yet)'],
  dks: ['i-dks', 'Dynamic Key Press (DKS)', 'One key can perform 4 functions based on different press depths.'],
  mt: ['i-mt', 'Hold/Tap (MT)', 'One key achieves 2 functions: Hold for one, Tap for another.'],
  tgl: ['i-tgl', 'Toggle switch (TGL)', 'Click once to toggle hold, click again to release'],
};
const ADV_KINDS: AdvKind[] = ['mt', 'tgl', 'dks'];
const kindOf = (e?: KeyEntry) => ADV_KINDS.find((k) => e && e.type === ADV_TYPE[k]);

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

// The slot a key uses: its own if it is already bound to this kind, otherwise the first slot no key uses.
function slotFor(kind: AdvKind, key: number): number {
  const e = state.base[key];
  if (kindOf(e) === kind) return e.code1;
  const used = new Set(state.base.filter((b) => kindOf(b) === kind).map((b) => b.code1));
  for (let s = 0; s < 32; s++) if (!used.has(s)) return s;
  return -1;
}

function selectAdvKey(i: number) {
  state.advKey = state.advKey === i ? -1 : i;
  const k = kindOf(state.base[i]);
  if (k) state.advKind = k;
  renderKeyboard();
  renderAdvanced();
}

function renderAdvanced() {
  $('adv-kinds').replaceChildren(...['rs', 'socd', 'dks', 'mt', 'tgl'].map((k) => {
    const [ic, title, desc] = ADV_INFO[k];
    const b = el('button', 'adv-kind' + (k === state.advKind ? ' on' : '')) as HTMLButtonElement;
    b.dataset.kind = k;
    b.append(icon(ic), el('b', '', title), el('small', '', desc));
    if (k === 'rs' || k === 'socd') b.disabled = true;
    else b.onclick = () => { state.advKind = k as AdvKind; renderAdvanced(); };
    return b;
  }));

  const bound = state.base.map((e, i) => ({ e, i, k: kindOf(e) })).filter((b) => b.k && b.i < LAYOUT.length);
  $('adv-count').textContent = `${bound.length}/96`;
  $('adv-list').replaceChildren(...bound.map(({ e, i, k }) => {
    const row = el('div', 'adv-item');
    row.append(el('b', '', `${k!.toUpperCase()}${e.code1 + 1}`), el('span', 'n', `${capLabel(LAYOUT[i][3])} · #${i}`));
    const edit = el('button', '', 'Edit');
    edit.onclick = () => { state.advKind = k!; state.advKey = i; renderKeyboard(); renderAdvanced(); };
    row.append(edit);
    return row;
  }));
  renderAdvEditor();
}

function renderTestBoxes() {
  if ($('test-press')) {
    $('test-press').textContent = state.testPress.join('  ');
    $('test-release').textContent = state.testRelease.join('  ');
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
    const s = state.adv.dks[slot];
    parts.push(el('div', 'empty-txt', 'Trigger points and phase bits are shown raw: their units are not confirmed.'));
    s.points.forEach((p, i) => {
      const inp = el('input') as HTMLInputElement;
      inp.id = `adv-pt${i}`;
      inp.value = String(p);
      parts.push(formRow(`Point ${i + 1}`, inp));
    });
    s.keys.forEach((k, i) => {
      const ph = el('input', 'ph') as HTMLInputElement;
      ph.id = `adv-ph${i}`;
      ph.value = '0x' + k.phases.toString(16).padStart(4, '0');
      parts.push(formRow(`Key ${i + 1}`, keySelect(`adv-k${i}`, fromRef(k.key)), ph));
    });
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

const num = (id: string) => Number($<HTMLInputElement>(id).value) || 0;

async function saveAdvanced(kind: AdvKind, key: number, slot: number) {
  const a = state.adv!;
  let slots: unknown[];
  if (kind === 'mt') slots = a.mt.map((s, i) => (i === slot ? { tap: toRef(num('adv-tap')), hold: toRef(num('adv-hold')) } : s));
  else if (kind === 'tgl') slots = a.tgl.map((s, i) => (i === slot ? toRef(num('adv-tgl')) : s));
  else slots = a.dks.map((s, i) => (i === slot ? {
    points: [0, 1, 2, 3].map((p) => num(`adv-pt${p}`) & 0xff),
    keys: [0, 1, 2, 3].map((k) => ({ key: toRef(num(`adv-k${k}`)), phases: num(`adv-ph${k}`) & 0xffff })),
  } : s));
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
async function unbindAdvanced(key: number) {
  const def = LAYOUT[key][3];
  const entry = def === 0xff ? [0xf0, 0xff, 0x09] : [...toRef(def)];
  if ((await call('setKeyEntry', state.profile, 0, key, entry)) === null) return;
  toast(`${capLabel(def)} back to default`);
  await reloadBase();
}

async function reloadBase() {
  const base = await call<KeyEntry[]>('keymap', state.profile, 0);
  if (base) state.base = base;
  if (state.layer === 0) state.keys = state.base;
  renderKeyboard();
  renderAdvanced();
}

// keyboard capture for remapping, the macro recorder and the binding test

window.addEventListener('keydown', (e) => {
  if (state.recording) { e.preventDefault(); recordEvent(e, true); return; }
  if (state.tab === 'advanced' && !e.repeat) {
    state.testPress = [...state.testPress, HID_NAMES[CODE_TO_HID[e.code]] ?? e.code].slice(-12);
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
    state.testRelease = [...state.testRelease, HID_NAMES[CODE_TO_HID[e.code]] ?? e.code].slice(-12);
    renderTestBoxes();
  }
});

// connect

async function loadProfile() {
  const l = await call<Lighting>('lighting', state.profile);
  if (l) { state.lighting = l; renderLighting(); renderRates(); }
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
  if (pr) { state.presets = pr; renderPresets(); }
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
initPerformanceControls();
initTriggerControls();
renderPicker();
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
