/**
 * Minimal typed EventEmitter.
 *
 * Provides `.on()` / `.off()` / `.once()` / `.emit()` with full TypeScript
 * safety over an event map.  Used instead of the browser-native `EventTarget`
 * to preserve API parity with Node.js decibri (`.on('data', cb)` pattern).
 */
export class Emitter<T extends { [K in keyof T]: any[] }> {
  private _listeners = new Map<keyof T, Set<Function>>();

  on<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn);
    return this;
  }

  off<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this {
    const set = this._listeners.get(event);
    if (!set) return this;
    // Direct match
    if (set.delete(fn)) return this;
    // Check once wrappers
    for (const listener of set) {
      if ((listener as any)._original === fn) {
        set.delete(listener);
        return this;
      }
    }
    return this;
  }

  once<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this {
    const wrapper = ((...args: T[K]) => {
      this.off(event, wrapper);
      fn(...args);
    }) as any;
    wrapper._original = fn;
    return this.on(event, wrapper);
  }

  emit<K extends keyof T>(event: K, ...args: T[K]): boolean {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return false;
    for (const fn of set) fn(...args);
    return true;
  }

  removeAllListeners(event?: keyof T): this {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }
}
