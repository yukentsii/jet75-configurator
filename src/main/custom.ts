// Custom configs: whole-profile snapshots kept on this PC (in the app's user data folder), and the
// .json files used to export and import them.
import { app } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import { checkSnapshot, Snapshot } from './protocol';

export const MAX_CUSTOM = 19;
export const NAME_MAX = 15;

export interface CustomConfig { id: string; name: string; snapshot: Snapshot }
interface ConfigFile { app: 'jet75-configurator'; name: string; profile: Snapshot }

const storePath = () => path.join(app.getPath('userData'), 'custom-configs.json');

export async function loadCustom(): Promise<CustomConfig[]> {
  try {
    const list = JSON.parse(await fs.readFile(storePath(), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function saveCustom(list: CustomConfig[]) {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  const tmp = storePath() + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(list));
  await fs.rename(tmp, storePath());
}

export const cleanName = (name: string) => name.trim().slice(0, NAME_MAX);

export async function addCustom(name: string, snapshot: Snapshot) {
  const list = await loadCustom();
  if (list.length >= MAX_CUSTOM) throw new Error(`you can keep at most ${MAX_CUSTOM} custom configs`);
  list.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: cleanName(name), snapshot });
  await saveCustom(list);
  return list;
}

export async function renameCustom(id: string, name: string) {
  const list = await loadCustom();
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error('custom config not found');
  c.name = cleanName(name);
  await saveCustom(list);
  return list;
}

export async function deleteCustom(id: string) {
  const list = (await loadCustom()).filter((x) => x.id !== id);
  await saveCustom(list);
  return list;
}

export async function getCustom(id: string) {
  const c = (await loadCustom()).find((x) => x.id === id);
  if (!c) throw new Error('custom config not found');
  return c;
}

export async function writeConfigFile(file: string, name: string, snapshot: Snapshot) {
  const data: ConfigFile = { app: 'jet75-configurator', name, profile: snapshot };
  await fs.writeFile(file, JSON.stringify(data, null, 1));
}

export async function readConfigFile(file: string): Promise<{ name: string; snapshot: Snapshot }> {
  let data: ConfigFile;
  try {
    data = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    throw new Error('this file is not a Jet 75 configuration');
  }
  if (data?.app !== 'jet75-configurator') throw new Error('this file is not a Jet 75 configuration');
  checkSnapshot(data.profile);
  return { name: cleanName(String(data.name ?? '')) || path.basename(file, path.extname(file)).slice(0, NAME_MAX), snapshot: data.profile };
}
