import { EventEmitter } from 'events';

// In-memory event emitter for simple SQLite pub/sub across a single node process
export const pubsub = new EventEmitter();
