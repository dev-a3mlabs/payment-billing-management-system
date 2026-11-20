import { EventEmitter } from 'node:events';

// In-memory, so it reaches streams on this server process only; several processes would need Redis pub/sub.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export type NotificationListener = (notification: unknown) => void;

export const notificationEvents = {
  publish: (userId: number, notification: unknown) => emitter.emit(String(userId), notification),

  subscribe: (userId: number, listener: NotificationListener) => {
    emitter.on(String(userId), listener);
    return () => {
      emitter.off(String(userId), listener);
    };
  },

  openStreams: (userId: number) => emitter.listenerCount(String(userId)),
};
