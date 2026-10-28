import { ACCESS_KEYS } from '../../config/access-keys.js';
import type { TxClient } from '../../db/transaction.js';
import type { Role } from '../../generated/prisma/enums.js';
import { accessService } from '../access/access.service.js';
import { sessionRepository } from '../session/session.repository.js';
import { userRepository } from '../user/user.repository.js';

// Allowed when the limit is off, this device is already logged in, or a slot is free.
export const isDeviceAllowed = async (user: { id: number; role: Role }, visitorId: string, tx: TxClient) => {
  if (!(await accessService.hasPermission(user, ACCESS_KEYS.deviceLimitEnabled))) return true;

  // Locks the user row so two new devices can't both take the last free slot.
  await userRepository.lockById(user.id, tx);

  const [maxDevices, visitorIds] = await Promise.all([
    accessService.getNumber(user, ACCESS_KEYS.deviceLimitMax),
    sessionRepository.findActiveVisitorIds(user.id, tx),
  ]);

  return visitorIds.includes(visitorId) || visitorIds.length < maxDevices;
};
