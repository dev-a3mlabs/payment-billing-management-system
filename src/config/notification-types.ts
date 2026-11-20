export const NOTIFICATION_TYPES = {
  changeRequestApproved: 'change_request.approved',
  changeRequestCancelled: 'change_request.cancelled',
  changeRequestCreated: 'change_request.created',
  changeRequestRejected: 'change_request.rejected',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
