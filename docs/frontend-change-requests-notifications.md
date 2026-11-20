# Frontend Guide: Account Change Requests & Live Notifications

This guide explains how to build account change requests and the notification bell in the super admin, admin and agent panels. Follow it step by step.

Read first:
- `change-requests-api.md`: every endpoint, with curl requests and responses.
- `frontend-session-handling.md`: the API client (`api()`, `authFetch()`), token refresh, `endSession()` and the idle timer. This guide reuses all of them.

`{portal}` is `super-admin`, `admin` or `agent`. `PORTAL` and `API_URL` are the same config values used in `frontend-session-handling.md`.

---

## 1. What to build

| Panel | Screens |
|---|---|
| Agent | Profile (names editable; username, email and mobile read-only with "Request change"), My change requests, Notification bell |
| Admin | Same as agent, plus **Change requests** inbox (their agents' requests) with Approve / Reject |
| Super admin | Profile with "Change account details", **Change requests** inbox (admins' requests to decide; agents' requests view-only), Notification bell |

---

## 2. Profile screen (changed)

`PATCH /{portal}/profile` now accepts **only** `firstName` and `lastName`. Sending email or mobile returns 400.

- **First name and last name:** editable as before.
- **Username, email and mobile:** show them **read-only**, each with a **Request change** button (admin and agent) or **Change** button (super admin, section 6).
- If the user already has a pending request for a field, show "Change pending" under it and disable the button. Load the pending list with `GET /{portal}/profile/change-requests?status=pending`.

---

## 3. Sending a change request (admin and agent)

### 3.1 Form

Open a dialog when the user clicks **Request change**:

| Field | Input | Shown when |
|---|---|---|
| New email | Email input | `field = email` |
| Country code + new mobile number | Select + number input | `field = mobile` |
| New username | Text input (lowercase) | `field = username` |

Show this note in the dialog: "Your {admin / super admin} must approve this change. When it's approved, you'll be logged out of all devices and must log in again."

### 3.2 Code

```ts
type ChangeRequestField = 'email' | 'mobile' | 'username';

type NewValue =
  | { email: string }
  | { countryCode: string; mobileNumber: string }
  | { username: string };

export const sendChangeRequest = (field: ChangeRequestField, newValue: NewValue) =>
  api<ChangeRequest>('/profile/change-requests', {
    method: 'POST',
    body: JSON.stringify({ field, newValue }),
  });
```

`newValue` keys must be exactly those shown. Extra keys are rejected.

### 3.3 Results

| Response | Show |
|---|---|
| 201 | "Request sent. You'll be notified when it's decided." Close the dialog, refresh "My change requests" |
| 400 `VALIDATION_ERROR` | Show `details[].message` under the matching input (`details[].field` is e.g. `newValue.email`) |
| 400 `BAD_REQUEST` | The message ("New value must be different from the current one") |
| 409 `EMAIL_TAKEN` / `MOBILE_TAKEN` / `USERNAME_TAKEN` | The message under the new value input |
| 409 `CONFLICT` | The message ("You already have a pending request for this field") |
| 429 `TOO_MANY_REQUESTS` | The message. **Don't** log out |

---

## 4. My change requests (admin and agent)

`GET /{portal}/profile/change-requests?page=1` (optional `status` filter).

Table columns:

| Column | From |
|---|---|
| Field | `field` (label: "Email", "Mobile number", "Username") |
| Old → New | `oldValue` → `newValue` (see 4.1) |
| Status | `status` badge (4.2) |
| Reason | `rejectReason` (only when rejected) |
| Sent | `createdAt` |
| Decided | `decidedAt` and `decidedBy.username` |
| Action | **Cancel** when `status` is `pending` |

Cancel: `DELETE /{portal}/profile/change-requests/:uuid`, then refresh the list. On 409 ("no longer pending"), just refresh.

### 4.1 Showing values

```ts
export const formatValue = (value: Record<string, string | null>) => {
  if ('email' in value) return value.email ?? '—';
  if ('mobileNumber' in value) return value.mobileNumber ? `${value.countryCode} ${value.mobileNumber}` : '—';
  return value.username ?? '—';
};
```

### 4.2 Status badges

| `status` | Badge |
|---|---|
| `pending` | Yellow "Pending" |
| `approved` | Green "Approved" |
| `rejected` | Red "Rejected" |
| `cancelled` | Grey "Cancelled" |
| `expired` | Grey "Expired" |

---

## 5. Change requests inbox (admin and super admin)

### 5.1 List

`GET /{portal}/change-requests?status=pending&page=1`

- Default tab: **Pending**. Other tabs: All, Approved, Rejected, Cancelled, Expired.
- Badge in the sidebar: `pagination.totalItems` from `?status=pending`. Refresh it when a `change_request.created` or `change_request.cancelled` notification arrives (section 8).
- Columns: User (`user.username`, `user.role`), Field, Old → New, Status, Sent, Expires (`expiresAt`), Actions.
- Show **Approve** and **Reject** only when `canDecide` is `true`.
- Super admin, agent rows with `canDecide: false` and `status: pending`: show a "View only" label with the tooltip "The agent's admin decides this request."

### 5.2 Detail page

`GET /{portal}/change-requests/:uuid`

Show old and new values side by side, the user, dates and status. Show Approve / Reject when `canDecide` is `true`.

Notification links open this page (section 8.4).

### 5.3 Approve dialog

Dialog text: "Approve changing {user.username}'s {field} to {new value}? They will be logged out of all devices."

```ts
export const approveChangeRequest = (uuid: string) =>
  api(`/change-requests/${uuid}/approve`, { method: 'POST' });
```

| Response | Show |
|---|---|
| 200 | "Approved." Refresh the list or detail |
| 403 `FORBIDDEN` | The message ("You can only view this request") |
| 409 `CONFLICT` | The message, then refresh (someone else decided it, it expired, or the user is no longer active) |
| 409 `EMAIL_TAKEN` / `MOBILE_TAKEN` / `USERNAME_TAKEN` | The message, and suggest rejecting with a reason |

### 5.4 Reject dialog

A required **Reason** text area (max 500 characters). The user will see it.

```ts
export const rejectChangeRequest = (uuid: string, reason: string) =>
  api(`/change-requests/${uuid}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
```

Handle 403, 404 and 409 like 5.3.

---

## 6. Super admin: change own account

Profile → **Change account details** dialog:

| Field | Input |
|---|---|
| Username, email, country code + mobile | Inputs prefilled with the current values |

Send only the fields that changed. Always send country code and mobile **together**.

```ts
export const updateOwnAccount = (changes: Partial<{ username: string; email: string; countryCode: string; mobileNumber: string }>) =>
  api('/profile/account', { method: 'PATCH', body: JSON.stringify(changes) });
```

On 200, show "Account updated. Your other devices have been logged out." This device stays logged in; reload the profile.

Errors: 400 `BAD_REQUEST` (nothing changed), 409 `*_TAKEN`.

---

## 7. After an approval: the user is logged out

When a request is approved, the user's sessions all end. Their next API call gets 401 `INVALID_TOKEN`, and the API client sends them to login with "Your session has ended. Please log in again." No extra code is needed.

- After a **username** change, they log in with the **new** username.
- The `change_request.approved` notification is waiting when they log back in.
- A security alert `account_changed` appears in their Profile → Security alerts. Show it as: "Your {fields} was changed."

---

## 8. Notifications

### 8.1 Bell and list

- On login (and on page load), call `GET /{portal}/notifications?page=1`. Show `unreadCount` on the bell.
- The dropdown shows the newest items. Unread ones (`readAt: null`) appear in bold.
- Clicking an item calls `PATCH /{portal}/notifications/:id/read` and navigates (8.4).
- **Mark all as read**: `PATCH /{portal}/notifications/read-all`, then set the count to 0.
- "View all" opens a full page with paging.

### 8.2 Text for each type

`fieldLabel`: `email` → "email", `mobile` → "mobile number", `username` → "username".

| `type` | Text |
|---|---|
| `change_request.created` | "{metadata.username} asked to change their {fieldLabel}" |
| `change_request.cancelled` | "{metadata.username} cancelled their {fieldLabel} change request" |
| `change_request.approved` | "Your {fieldLabel} change was approved" |
| `change_request.rejected` | "Your {fieldLabel} change was rejected" |

Unknown `type` (added later): show "You have a new notification" and don't crash.

### 8.3 Code: text

```ts
const FIELD_LABELS: Record<string, string> = { email: 'email', mobile: 'mobile number', username: 'username' };

export const notificationText = ({ type, metadata }: AppNotification) => {
  const field = FIELD_LABELS[metadata?.field] ?? 'details';
  switch (type) {
    case 'change_request.created':
      return `${metadata.username} asked to change their ${field}`;
    case 'change_request.cancelled':
      return `${metadata.username} cancelled their ${field} change request`;
    case 'change_request.approved':
      return `Your ${field} change was approved`;
    case 'change_request.rejected':
      return `Your ${field} change was rejected`;
    default:
      return 'You have a new notification';
  }
};
```

Render text with your framework's normal text binding, **never** with `innerHTML` / `dangerouslySetInnerHTML` / `v-html`. `metadata.username` comes from user input.

### 8.4 Where a click goes

| `type` | Go to |
|---|---|
| `change_request.created`, `change_request.cancelled` | Inbox detail: `/change-requests/{entityId}` |
| `change_request.approved`, `change_request.rejected` | My change requests |

---

## 9. Live notifications (Server-Sent Events)

### 9.1 How it works

- The browser opens **one** long request to `GET /{portal}/notifications/stream`. The server pushes each new notification as an `event: notification` message.
- Use **fetch-based SSE** so the token goes in the `Authorization` header. **Don't** use the browser's `EventSource` (it can't send headers), and **never** put the token in the URL.
- Library: `@microsoft/fetch-event-source` (`npm i @microsoft/fetch-event-source@2.0.1`).
- **One stream per browser, not per tab.** The server allows 5 per user, and browsers allow only 6 connections per site on HTTP/1.1. One tab (the "leader") holds the stream using a Web Lock and passes messages to other tabs with a `BroadcastChannel`. When the leader tab closes, another tab takes over automatically.
- The stream doesn't count as user activity. **Never** call `markUserActive` from stream code.

### 9.2 Code: `notifications/stream.ts`

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { API_URL, PORTAL } from '../config';
import { refreshTokens } from '../auth/refresh';
import { endSession } from '../auth/session';
import { tokenStore } from '../auth/token-store';

export type AppNotification = {
  id: number;
  type: string;
  entityId: string | null;
  metadata: Record<string, string>;
  readAt: string | null;
  createdAt: string;
};

class Reconnect extends Error {}
class Stop extends Error {}

const readCode = async (res: Response) => (await res.json().catch(() => null))?.error?.code;

// Holds the stream until signal aborts. Reconnects with a fresh token when needed.
const runStream = async (signal: AbortSignal, onNotification: (n: AppNotification) => void) => {
  let lastId = 0;

  while (!signal.aborted) {
    const { accessToken, refreshToken } = tokenStore.get();
    if (!accessToken) return;

    try {
      await fetchEventSource(`${API_URL}/${PORTAL}/notifications/stream`, {
        signal,
        openWhenHidden: true, // this tab serves every tab, so keep it open in the background
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(lastId > 0 && { 'last-event-id': String(lastId) }), // lowercase: the library uses the same key
        },

        async onopen(res) {
          if (res.ok) return;
          const code = await readCode(res);
          if (res.status === 401 && code === 'TOKEN_EXPIRED' && (await refreshTokens(refreshToken))) {
            throw new Reconnect();
          }
          if (res.status === 401) {
            endSession('ended');
            throw new Stop();
          }
          throw new Error(`Stream refused: ${res.status}`); // e.g. 429: retried after a delay
        },

        onmessage(message) {
          if (message.event !== 'notification') return;
          const notification = JSON.parse(message.data) as AppNotification;
          if (notification.id <= lastId) return; // already seen (sent again after a reconnect)
          lastId = notification.id;
          onNotification(notification);
        },

        // The server closed the stream (e.g. the session ended): reconnect, which checks the session.
        onclose() {
          throw new Reconnect();
        },

        onerror(err) {
          if (err instanceof Reconnect || err instanceof Stop) throw err;
          return 30_000; // network or server error: try again in 30 seconds
        },
      });
    } catch (err) {
      if (err instanceof Stop) return;
      // Reconnect: loop again with the current token.
    }
  }
};

// Call once when the logged-in layout mounts; call the returned function on unmount or logout.
export const startNotifications = (onNotification: (n: AppNotification) => void) => {
  const channel = new BroadcastChannel('notifications');
  channel.onmessage = (event) => onNotification(event.data);

  const controller = new AbortController();
  navigator.locks
    .request('notification-stream', { signal: controller.signal }, () =>
      runStream(controller.signal, (notification) => {
        onNotification(notification);
        channel.postMessage(notification);
      }),
    )
    .catch(() => undefined); // aborted while waiting for the lock

  return () => {
    controller.abort();
    channel.close();
  };
};
```

### 9.3 What to do with each notification

```ts
const stop = startNotifications((notification) => {
  addToBell(notification);          // put at the top of the list, unreadCount + 1
  showToast(notificationText(notification));

  if (notification.type === 'change_request.created' || notification.type === 'change_request.cancelled') {
    refreshInbox();                 // pending list and the sidebar badge
  }
  if (notification.type === 'change_request.approved' || notification.type === 'change_request.rejected') {
    refreshMyRequests();
  }
});
```

- Ignore notifications whose `id` is already in the bell list. The same notification can arrive from the stream and from a list reload.
- Call `stop()` on logout. `endSession()` reloads the page, which also closes it.

### 9.4 Fallback

If the stream can't connect (e.g. a strict company proxy), the app still works: the bell loads on page load, and the inbox and lists load when opened. Nothing is lost, because notifications are saved on the server.

---

## 10. Security checklist

- [ ] Approve and Reject only appear when `canDecide` is `true`. The backend checks again anyway.
- [ ] Notification and request text is rendered as text, never as HTML.
- [ ] The stream token is in the `Authorization` header, never in the URL.
- [ ] Only one stream per browser (Web Lock), shared to other tabs with `BroadcastChannel`.
- [ ] Stream code never counts as user activity.
- [ ] 403 `FORBIDDEN` and 429 `TOO_MANY_REQUESTS` show a message and **don't** log out.

---

## 11. Testing checklist

| # | Test | Expected |
|---|---|---|
| 1 | Profile: try to edit email directly | Field is read-only, "Request change" button shown |
| 3 | Agent sends an email change correctly | 201, request "Pending"; the admin's bell updates **without reload** |
| 4 | Agent sends a second email request | 409 "You already have a pending request for this field" |
| 5 | Agent sends 6 requests in a day (cancelling in between) | The 6th gets 429 |
| 6 | Agent cancels | Status "Cancelled"; the admin gets a "cancelled" notification and the inbox updates |
| 7 | Admin rejects with a reason | Agent gets the notification live; reason shown in My change requests |
| 8 | Admin approves | Agent is logged out on every device, logs in again, sees "approved" and the new value |
| 9 | Username change approved | Agent must log in with the new username |
| 10 | Admin sends a request | Super admin gets it live; can approve |
| 11 | Super admin opens an agent's request (agent's admin active) | "View only", no buttons |
| 12 | Super admin suspends an admin, opens one of their agents' pending requests | Approve / Reject shown |
| 13 | Super admin changes own email with a wrong code | "Invalid code" |
| 14 | Super admin changes own email correctly | Success; their other browsers are logged out, this one stays |
| 15 | 3 tabs open | Network tab shows **one** `/notifications/stream` request; all 3 tabs get live notifications |
| 16 | Close the tab holding the stream | Another tab opens the stream within seconds |
| 17 | Super admin logs out the admin's device | That device's stream closes within about 1 minute, and the next action goes to login |
| 18 | Leave the panel idle 15 minutes with the stream open | Logged out (the stream doesn't keep the session alive) |
| 19 | Turn the network off and on | Stream reconnects; notifications created meanwhile appear |
