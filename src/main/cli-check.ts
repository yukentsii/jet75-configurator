// Read-only smoke test: `npm run check`. Sends only read commands.
import { Jet75 } from './device';

async function main() {
  const kb = await Jet75.open();
  try {
    console.log('info', await kb.info());
    console.log('profiles', await kb.profiles());
    for (let p = 0; p < 4; p++) console.log(`lighting p${p}`, await kb.lighting(p));
    const keys = await kb.keymap(0, 0);
    console.log('keymap p0 l0', keys.length, 'keys, first:', keys.slice(0, 4));
  } finally {
    await kb.close();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
