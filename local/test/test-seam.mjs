// The clean seam for test results.
//
// Tests ask the seam for a session instead of constructing MockPxC owners
// directly. The seam hands out the same isolated owners the tests built
// before (fresh memory storage per call, caller-chosen), registers every
// owner it hands out, and records each test's result into MockPxC retained
// state (the session anchor's run records), next to the runs the test made.
//
// In Node the session is bookkeeping. In the browser the experience UI sets
// the active session before importing a test file, and reads the same module
// instance back afterwards (the dist mirror keeps one copy) to show results,
// worlds, and replays.
//
// A replay never touches the record: it performs the recorded changes in its
// own distinct sandbox, through the same write path, so each step is visibly
// auditable.
import { createMockMounts } from '../mock-mounts.mjs';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

const sessions = new Map();
let activeKey = null;

export function setActiveTestSession(key) { activeKey = key; }
export function clearActiveTestSession() { activeKey = null; }

function createSession(key) {
  const anchor = createMockMounts({ storage: memoryStorage(), key: `pxcube.test-seam.v1:${key}`, seedIdentity: 'test-seam-anchor' });
  const owners = [];
  // A fresh read of retained state. Owner objects captured during a test can
  // go stale (a later owner on the same storage commits after them), so the
  // audit path never trusts them; it re-reads.
  const fresh = index => {
    const entry = owners[index];
    if (!entry) throw Error(`Unknown session owner ${index}`);
    return createMockMounts({ storage: entry.storage, key: entry.key, seedIdentity: entry.seedIdentity });
  };
  const session = {
    key,
    anchor,
    // Fresh isolated storage, exactly as the tests built before.
    memory() { return memoryStorage(); },
    // Same owner the tests built before; registered so the UI can audit it.
    owner(storage, { key: ownerKey = `test-seam:${key}`, seedIdentity = 'test-seam' } = {}) {
      const owner = createMockMounts({ storage, key: ownerKey, seedIdentity });
      owners.push({ owner, storage, key: ownerKey, seedIdentity });
      return owner;
    },
    // The result lands in MockPxC, committed through the guarded path.
    recordResult(result) { anchor.recordResult(result); },
    ownerCount() { return owners.length; },
    // Plain data for the UI: results plus every run of every registered owner.
    snapshot() {
      return {
        key,
        results: anchor.inspect().results,
        worlds: owners.map((entry, index) => ({ owner: index, runs: Object.values(fresh(index).inspect().runs) })),
      };
    },
    // A visibly auditable replay: a distinct sandbox seeded like the source
    // run, then the recorded changes performed one step at a time through
    // writeScratch. The source run is never written to.
    replay(ownerIndex, runName) {
      const owner = fresh(ownerIndex);
      const source = owner.inspect().runs[runName];
      if (!source) throw Error(`Unknown run ${runName}`);
      const handle = owner.createTestRun(source.id, source.world, { kind: 'replay', replayOf: runName });
      const steps = source.changes.map(change => ({ address: change.address, before: change.before, after: change.after }));
      let applied = 0;
      const state = () => handle.inspect();
      return {
        name: handle.name,
        source: runName,
        total: steps.length,
        get applied() { return applied; },
        changeAt(index) { return steps[index] ?? null; },
        applyNext() {
          if (applied >= steps.length) return null;
          const step = steps[applied];
          handle.writeScratch(step.address, step.after);
          applied += 1;
          return { step: applied, total: steps.length, change: step, state: state() };
        },
        runAll() { let last = null; let next; while ((next = this.applyNext()) !== null) last = next; return last; },
        state,
        // The replay performed the same writes in the same order, so its
        // final value should equal the recorded run's.
        matches() { return JSON.stringify(state().value) === JSON.stringify(source.value); },
      };
    },
  };
  return session;
}

export function testSession(key = null) {
  const sessionKey = key ?? activeKey ?? 'default';
  if (!sessions.has(sessionKey)) sessions.set(sessionKey, createSession(sessionKey));
  return sessions.get(sessionKey);
}
