import { prisma } from './prisma.js';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Runs fn inside a DB transaction; rolls back if fn throws.
export const withTransaction = <T>(fn: (tx: TxClient) => Promise<T>): Promise<T> =>
  prisma.$transaction(fn);
