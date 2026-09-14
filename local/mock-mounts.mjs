import { worlds, resolveWorldValue } from '../mock-pxc/mock-pxc.mjs';

const clone = value => structuredClone(value);
const validId = id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id);

// Own JSON mock worlds, not a replacement Part kernel. Storage is an adapter:
// the browser uses localStorage; tests use memory. Failure to retain is loud.
export function createMockMounts({ storage, key, seedIdentity }) {
  const raw = storage.getItem(key);
  let state = raw ? JSON.parse(raw) : { schemaVersion: 1, revision: 0, runs: {} };
  if (state.schemaVersion !== 1 || !state.runs || Array.isArray(state.runs)) throw Error('Unsupported retained mock state');
  let knownRaw = raw;
  function commit(next) {
    if (storage.getItem(key) !== knownRaw) throw Error('Another owner changed these mounts. Reload to inspect its state.');
    next.revision = state.revision + 1;
    const serialized = JSON.stringify(next);
    storage.setItem(key, serialized); // Quota failure leaves both prior state and runs intact.
    knownRaw = serialized; state = next;
  }
  function entry(name) {
    const found = Object.hasOwn(state.runs, name) ? state.runs[name] : null;
    if (!found) throw Error(`Unknown mount: ${name}`);
    return found;
  }
  function handle(name) {
    entry(name);
    return Object.freeze({
      name,
      resolve(address) {
        const prefix = name + '.';
        if (!address.startsWith(prefix)) throw Error(`Address is outside ${name}`);
        return clone(resolveWorldValue(entry(name).value, address.slice(prefix.length)));
      },
      writeScratch(address, value) {
        // This first mock mutates a whole named scratch value. Nested field
        // access still follows the backend's longest-dotted-key resolution.
        if (!/^sc\.[A-Za-z_][A-Za-z0-9_-]*$/.test(address)) throw Error('Write a whole sc.<name> value, without a mount prefix');
        const encoded = JSON.stringify(value);
        if (encoded === undefined || JSON.stringify(JSON.parse(encoded)) !== encoded) throw Error('Scratch values must be JSON');
        const next = clone(state), run = next.runs[name], previous = run.value.sc[address.slice(3)];
        run.value.sc[address.slice(3)] = JSON.parse(encoded);
        run.changes.push({ step: run.changes.length + 1, address, before: previous ?? null, after: JSON.parse(encoded) });
        commit(next);
      },
      inspect: () => clone(entry(name)),
    });
  }
  return Object.freeze({
    create(id, world = 'shelf') {
      if (!validId(id) || !Object.hasOwn(worlds, world)) throw Error('Known world and simple run id required');
      const iteration = Math.max(0, ...Object.values(state.runs).filter(run => run.id === id).map(run => run.iteration)) + 1;
      const name = `mock.${id}.${iteration}`, next = clone(state);
      next.runs[name] = { name, id, iteration, world, seedIdentity, seed: clone(worlds[world]), value: clone(worlds[world]), changes: [] };
      commit(next); return handle(name);
    },
    handle,
    list: () => Object.values(state.runs).map(({ name, id, iteration, world, seedIdentity }) => ({name,id,iteration,world,seedIdentity})),
    inspect: () => clone(state),
  });
}
