// Tiny global event bus. Used so app-level events (critical threats, crawler
// state changes, tab switches) reach canvas effects without re-rendering them.
// It remembers the latest payload per event type, so a component that mounts later
// (e.g. the globe after a tab switch) can read the current crawler state with last().
const listeners = new Set();
const latest = new Map();

export const eventBus = {
  emit(type, payload) {
    latest.set(type, payload);
    listeners.forEach((fn) => fn({ type, payload }));
  },
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  last(type) {
    return latest.get(type);
  },
};
