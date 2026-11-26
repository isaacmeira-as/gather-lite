type Handler = (...args: any[]) => void;

export class Emitter {
  private handlers = new Map<string, Set<Handler>>();
  on(event: string, fn: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    return () => this.handlers.get(event)?.delete(fn);
  }
  emit(event: string, ...args: any[]) {
    this.handlers.get(event)?.forEach((fn) => fn(...args));
  }
}

/** App-wide event bus between the Phaser scene, the network layer and the DOM UI. */
export const bus = new Emitter();
