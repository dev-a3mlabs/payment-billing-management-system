// Account fields a user can only change through a request approved by the user above them.
export const CHANGE_REQUEST_FIELDS = {
  email: 'email',
  mobile: 'mobile',
  username: 'username',
} as const;

export type ChangeRequestField = (typeof CHANGE_REQUEST_FIELDS)[keyof typeof CHANGE_REQUEST_FIELDS];
