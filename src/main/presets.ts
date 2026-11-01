// Built-in configurations. Each one restores the keyboard's factory key map (read from the keyboard
// itself), sets the same lighting, and applies its own per-key trigger settings. Distances are in 0.01 mm.
import { Trigger } from './protocol';

export interface PresetDef {
  id: number;
  name: string;
  help: string;
  // actuation, quick trigger on/off and press/release sensitivity for all keys, then per-key overrides
  base: TriggerSetting;
  overrides?: { keys: number[]; setting: TriggerSetting }[];
}

interface TriggerSetting { actuation: number; rt: boolean; rtPress: number; rtRelease: number }

// Matrix positions on the Jet 75 II.
const WASD = [10, 11, 61, 71];
const CAPS = 60;
const SPACE = 77;

export const PRESETS: PresetDef[] = [
  {
    id: 0,
    name: 'Beginner Configuration',
    help: 'Feels like a regular mechanical keyboard: 1.5 mm actuation on every key, rapid trigger off.',
    base: { actuation: 150, rt: false, rtPress: 150, rtRelease: 150 },
  },
  {
    id: 1,
    name: 'FPS Configuration',
    help: 'WASD fire at 0.1 mm with 0.1 mm rapid trigger. Other keys: 1.5 mm actuation, 1.5 mm rapid trigger.',
    base: { actuation: 150, rt: true, rtPress: 150, rtRelease: 150 },
    overrides: [{ keys: WASD, setting: { actuation: 10, rt: true, rtPress: 10, rtRelease: 10 } }],
  },
  {
    id: 2,
    name: 'Extreme Configuration',
    help: 'Like FPS, but WASD rapid trigger reacts to 0.04 mm of movement. Other keys: 1.5 mm.',
    base: { actuation: 150, rt: true, rtPress: 150, rtRelease: 150 },
    overrides: [{ keys: WASD, setting: { actuation: 10, rt: true, rtPress: 4, rtRelease: 4 } }],
  },
  {
    id: 3,
    name: 'Office Work',
    help: 'Deep, deliberate typing: 2.0 mm actuation, Caps Lock at 2.5 mm to avoid accidental presses, rapid trigger off.',
    base: { actuation: 200, rt: false, rtPress: 150, rtRelease: 150 },
    overrides: [{ keys: [CAPS], setting: { actuation: 250, rt: false, rtPress: 150, rtRelease: 150 } }],
  },
  {
    id: 4,
    name: 'MOBA Game',
    help: 'Quick 1.2 mm actuation with 0.8 mm rapid trigger; the spacebar sits deeper at 1.8 mm.',
    base: { actuation: 120, rt: true, rtPress: 80, rtRelease: 80 },
    overrides: [{ keys: [SPACE], setting: { actuation: 180, rt: true, rtPress: 80, rtRelease: 80 } }],
  },
  {
    id: 5,
    name: 'FPS Game',
    help: '1.5 mm actuation with 0.5 mm rapid trigger; WASD at 1.0 mm with 0.1 mm rapid trigger.',
    base: { actuation: 150, rt: true, rtPress: 50, rtRelease: 50 },
    overrides: [{ keys: WASD, setting: { actuation: 100, rt: true, rtPress: 10, rtRelease: 10 } }],
  },
];

// Lighting and performance every built-in configuration uses.
export const PRESET_LIGHTING = { effect: 6, brightness: 100, speed: 4, direction: 0, customColorDisabled: true, color: '#ff0000' };
export const PRESET_PERFORMANCE = {
  lockWin: false, lockAltTab: false, lockAltF4: false, macMode: false, stability: true, adaptiveCalibration: true, debounce: 0,
};

export function presetTriggers(p: PresetDef, keyCount: number): Trigger[] {
  const out: Trigger[] = [];
  for (let i = 0; i < keyCount; i++) {
    const s = p.overrides?.find((o) => o.keys.includes(i))?.setting ?? p.base;
    out.push({
      switchType: 0, keyMode: s.rt ? 1 : 0, priority: 0, actuation: s.actuation,
      pressPrecision: 0, releasePrecision: 0, rtPress: s.rtPress, rtRelease: s.rtRelease, pressDeadzone: 0, releaseDeadzone: 0,
    });
  }
  return out;
}
