import { contextBridge, ipcRenderer } from 'electron';

const call = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('jet75', {
  connect: call('connect'),
  lighting: call('lighting'),
  setLighting: call('setLighting'),
  keymap: call('keymap'),
  setKey: call('setKey'),
  bindMacro: call('bindMacro'),
  switchProfile: call('switchProfile'),
  setReportRate: call('setReportRate'),
  macros: call('macros'),
  setMacros: call('setMacros'),
  performance: call('performance'),
  setPerformance: call('setPerformance'),
  triggers: call('triggers'),
  setTriggers: call('setTriggers'),
  advanced: call('advanced'),
  setAdvanced: call('setAdvanced'),
  setKeyEntry: call('setKeyEntry'),
  presets: call('presets'),
  applyPreset: call('applyPreset'),
});
