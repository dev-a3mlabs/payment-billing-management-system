# Frontend Guide: Tokens, Refresh, Idle Timeout and Logout

This guide explains how the panel frontend (super admin, admin and agent) must handle login tokens, expired tokens, session timeouts and logout. Follow it step by step. The code is plain TypeScript with `fetch`, so it works in React, Vue, Angular or anything else.

Base URL: `http://localhost:5000/api/v1`

`{portal}` is `super-admin`, `admin` or `agent`, depending on the panel.

---

## 1. The rules in short

| Thing | Value |
|---|---|
| Access token lifetime | **15 minutes** |
| Session idle timeout | **15 minutes** without activity, then the user must log in again |
| Maximum session length | **12 hours** after login, even if the user is active the whole time |
| Refresh token | **Single use.** Every refresh returns a new one |
| Refresh token used twice | Treated as stolen: the user is **logged out of every device** |

What the frontend must do:
1. Refresh **only** when an API returns 401 `TOKEN_EXPIRED`.
2. On any other 401, end the session and go to login. **Don't** refresh.
3. Only **one** refresh at a time, across all requests **and all browser tabs**.
4. Log the user out after **15 minutes without user action** (clicks, typing, scrolling), and warn them at **14 minutes**.
5. Never refresh on a timer, and never let polling keep an idle user logged in.

---

## 2. Backend responses you will handle

### 2.1 Error format

Every error has this shape:
```json
{
  "success": false,
  "message": "Human readable message",
  "error": {
    "code": "ERROR_CODE",
    "details": [{ "field": "fieldName", "message": "..." }]
  }
}
```
`details` is only present on `VALIDATION_ERROR`.

### 2.2 Codes that affect the session

| Status | `error.code` | Meaning | Frontend action |
|---|---|---|---|
| 401 | `TOKEN_EXPIRED` | Access token's 15 minutes are over. The session may still be valid | Refresh once, then retry the request (section 5) |
| 401 | `INVALID_TOKEN` | Session logged out (by the user, an admin or the super admin), timed out, user deactivated, or token invalid | End the session, go to login (section 7) |
| 401 | `UNAUTHORIZED` | No token was sent | End the session, go to login |
| 401 | `INVALID_REFRESH_TOKEN` | From the refresh API: session ended, or refresh token already used | End the session, go to login |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Admin must change their password first | Open the change-password screen |
| 403 | `MFA_SETUP_REQUIRED` | MFA is required and not set up | Open the MFA setup screen (see `mfa-api.md`) |
| 403 | `FORBIDDEN` | Wrong portal, or no permission for this action | Show the message. **Don't** log out |

**401 `TOKEN_EXPIRED`**
```json
{
  "success": false,
  "message": "Access token expired",
  "error": { "code": "TOKEN_EXPIRED" }
}
```

**401 `INVALID_TOKEN`**
```json
{
  "success": false,
  "message": "Invalid access token",
  "error": { "code": "INVALID_TOKEN" }
}
```

The backend doesn't say *why* a session ended (logged out by an admin, timed out, deactivated). That's on purpose. Show one generic message (section 7.3).

---

## 3. Auth APIs used in this guide

### 3.1 Login (existing)

`POST /{portal}/auth/login`: request and errors are unchanged (see `mfa-api.md`). On success, `data` contains:

```json
{
  "mfaRequired": false,
  "mustChangePassword": false,
  "mfaSetupRequired": false,
  "accessToken": "<ACCESS_TOKEN>",
  "refreshToken": "<REFRESH_TOKEN>",
  "user": { "uuid": "...", "username": "...", "role": "admin", "...": "..." }
}
```

When `mfaRequired` is `true`, there are no tokens yet. Finish with `POST /{portal}/auth/login/mfa`, which returns the same `data` with tokens.

After a successful login, call `startSession(data)` (section 4.2).

### 3.2 Refresh (existing)

`POST /{portal}/auth/refresh`: no `Authorization` header.

```bash
curl --location 'http://localhost:5000/api/v1/admin/auth/refresh' \
--header 'Content-Type: application/json' \
--data '{
  "refreshToken": "<REFRESH_TOKEN>"
}'
```

**200 OK**
```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "accessToken": "<NEW_ACCESS_TOKEN>",
    "refreshToken": "<NEW_REFRESH_TOKEN>"
  }
}
```

**401**
```json
{
  "success": false,
  "message": "Invalid or expired refresh token",
  "error": { "code": "INVALID_REFRESH_TOKEN" }
}
```

**Save both new tokens.** The old refresh token is dead the moment this call succeeds.

### 3.3 Logout (existing)

`POST /{portal}/auth/logout`: no `Authorization` header. Always returns 200, even if the token was already invalid.

```bash
curl --location 'http://localhost:5000/api/v1/admin/auth/logout' \
--header 'Content-Type: application/json' \
--data '{
  "refreshToken": "<REFRESH_TOKEN>"
}'
```

**200 OK**
```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null
}
```

### 3.4 Keep-alive call (existing)

`GET /{portal}/profile/sessions` is used as a light "I'm still here" call (section 8.4). Any authenticated API counts as activity, so you can use another light GET if you prefer.

```bash
curl --location 'http://localhost:5000/api/v1/admin/profile/sessions' \
--header 'Authorization: Bearer <ACCESS_TOKEN>'
```

---

## 4. Storing tokens

### 4.1 Where

| Token | Where | Why |
|---|---|---|
| Access token | `localStorage` key `auth.accessToken` | All tabs must share it, so one refresh serves every tab |
| Refresh token | `localStorage` key `auth.refreshToken` | Survives page reload; shared by all tabs |
| Last user activity time | `localStorage` key `auth.lastActivity` | The idle timer must count activity from every tab |
| Last API call time | `localStorage` key `auth.lastApiCall` | For the keep-alive call (section 8.4) |

Never:
- put tokens in URLs, query strings, cookies you set from JS, or logs (`console.log`, error trackers like Sentry);
- send tokens to any server other than this API;
- keep tokens after logout.

Because tokens are in `localStorage`, any XSS bug can steal them. Never render user content with `innerHTML` / `dangerouslySetInnerHTML` / `v-html`, and keep a strict Content Security Policy.

### 4.2 Code: `auth/token-store.ts`

```ts
const ACCESS_KEY = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';
export const LAST_ACTIVITY_KEY = 'auth.lastActivity';
export const LAST_API_CALL_KEY = 'auth.lastApiCall';

export type Tokens = { accessToken: string; refreshToken: string };

export const tokenStore = {
  get: () => ({
    accessToken: localStorage.getItem(ACCESS_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
  }),

  set: ({ accessToken, refreshToken }: Tokens) => {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },

  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem(LAST_API_CALL_KEY);
  },
};

// Call after a successful login (or login/mfa) that returned tokens.
export const startSession = (tokens: Tokens) => {
  tokenStore.set(tokens);
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  localStorage.setItem(LAST_API_CALL_KEY, String(Date.now()));
};
```

---

## 5. Refresh: one at a time, across all tabs

### 5.1 Why this matters

A refresh token can be used **once**. If two refreshes are sent with the same token, the backend treats it as theft and logs the user out of **every device**. This happens when:
- five requests get `TOKEN_EXPIRED` at the same time and each one calls refresh, or
- two tabs both notice the expired token and both refresh.

So:
- In one tab, all failed requests share **one** refresh promise.
- Across tabs, a **Web Lock** (`navigator.locks`) lets only one tab refresh at a time. Inside the lock, check whether another tab already refreshed: if the stored refresh token is different from the one this request was sent with, just use the new tokens.

The Web Locks API is supported in all current browsers (Chrome, Edge, Firefox, Safari 15.4+).

### 5.2 Code: `auth/refresh.ts`

```ts
import { API_URL, PORTAL } from '../config';
import { tokenStore } from './token-store';

let refreshing: Promise<boolean> | null = null;

// Returns true when fresh tokens are ready, false when the session is over.
// sentWithRefreshToken = the refresh token stored when the failed request was sent.
export const refreshTokens = (sentWithRefreshToken: string | null): Promise<boolean> => {
  refreshing ??= navigator.locks
    .request('auth-refresh', async () => {
      const { refreshToken } = tokenStore.get();
      if (!refreshToken) return false;

      // Another tab (or an earlier refresh) already got new tokens.
      if (refreshToken !== sentWithRefreshToken) return true;

      const res = await fetch(`${API_URL}/${PORTAL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (res.ok) {
        const { data } = await res.json();
        tokenStore.set(data);
        return true;
      }
      if (res.status === 401) return false;

      // Network or server error: keep the tokens, the user can try again.
      throw new Error('Could not refresh the session');
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
};
```

Important:
- A network error or 5xx during refresh **doesn't** log the user out. Only 401 does.
- Never call the refresh API from anywhere else (no timers, no "refresh on page load").

---

## 6. The API client

Every call to a protected API goes through this client. Login, refresh and logout use plain `fetch` (they don't need the access token).

### 6.1 Code: `api/client.ts`

```ts
import { API_URL, PORTAL } from '../config';
import { refreshTokens } from '../auth/refresh';
import { LAST_API_CALL_KEY, tokenStore } from '../auth/token-store';
import { endSession } from '../auth/session';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
    public details?: { field?: string; message: string }[],
  ) {
    super(message);
  }
}

export class SessionEndedError extends Error {}

const readCode = async (res: Response): Promise<string | undefined> =>
  (await res.clone().json().catch(() => null))?.error?.code;

// Sends the request with the access token; handles TOKEN_EXPIRED and ended sessions.
// path is relative to the portal, e.g. '/agents' or '/profile/sessions'.
export const authFetch = async (path: string, init: RequestInit = {}, retried = false): Promise<Response> => {
  const { accessToken, refreshToken } = tokenStore.get();
  if (!accessToken) {
    endSession('ended');
    throw new SessionEndedError();
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_URL}/${PORTAL}${path}`, { ...init, headers });
  localStorage.setItem(LAST_API_CALL_KEY, String(Date.now()));

  if (res.status !== 401) {
    const code = res.status === 403 ? await readCode(res) : undefined;
    if (code === 'PASSWORD_CHANGE_REQUIRED') goTo('/change-password');
    if (code === 'MFA_SETUP_REQUIRED') goTo('/mfa/setup');
    return res;
  }

  const code = await readCode(res);
  if (code === 'TOKEN_EXPIRED' && !retried && (await refreshTokens(refreshToken))) {
    return authFetch(path, init, true);
  }

  endSession('ended');
  throw new SessionEndedError();
};

// JSON helper: returns `data` on success, throws ApiError otherwise.
export const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await authFetch(path, init);
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code, body?.message ?? 'Request failed', body?.error?.details);
  }
  return body.data as T;
};
```

`goTo` is your router's navigation function (`router.push`, `navigate`, …).

### 6.2 Usage

```ts
// GET
const sessions = await api<Session[]>(`/users/${userUuid}/sessions`);

// DELETE
await api(`/users/${userUuid}/sessions/${sessionUuid}`, { method: 'DELETE' });

// POST with JSON
await api('/agents', { method: 'POST', body: JSON.stringify({ username, password }) });

// File download (e.g. CSV export): use authFetch, not api
const res = await authFetch(`/login-reports/export?from=2026-11-01`);
const blob = await res.blob();
```

### 6.3 Notes

- **Retrying is safe, even for POST/PUT/DELETE.** A request rejected with `TOKEN_EXPIRED` was stopped before the backend did anything, so sending it again can't create duplicates.
- Each request is retried **once at most**. A second 401 ends the session. This stops loops.
- Catch `SessionEndedError` in your global error handler and do nothing; the user is already being sent to login.
- 403 `FORBIDDEN` is **not** a logout. Show the message (e.g. "You do not have permission to log out agent devices").

---

## 7. Ending the session

### 7.1 When

| Trigger | Call |
|---|---|
| User clicks "Log out" | `logout()` |
| 15 minutes without user action | `logout('idle')` (section 8) |
| Any 401 other than a successful refresh | `endSession('ended')` (already done by the API client) |
| Another tab logged out | Handled by the broadcast listener below |

### 7.2 Code: `auth/session.ts`

```ts
import { API_URL, PORTAL } from '../config';
import { tokenStore } from './token-store';

export type EndReason = 'logout' | 'idle' | 'ended';

const channel = new BroadcastChannel('auth');

// Clears everything in this tab and sends the user to login.
const leave = (reason: EndReason) => {
  tokenStore.clear();
  clearAppState(); // your store reset: user, cached lists, React Query / Pinia / Redux caches
  window.location.replace(`/login?reason=${reason}`);
};

export const endSession = (reason: EndReason) => {
  channel.postMessage({ type: 'session-ended', reason });
  leave(reason);
};

// User clicked "Log out", or the idle timer fired.
export const logout = async (reason: EndReason = 'logout') => {
  const { refreshToken } = tokenStore.get();
  if (refreshToken) {
    // Tell the server so the session can't be used again. Don't block on failure.
    await fetch(`${API_URL}/${PORTAL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  endSession(reason);
};

// Other tabs: follow a logout from any tab.
channel.onmessage = (event) => {
  if (event.data?.type === 'session-ended') leave(event.data.reason);
};
```

Use `window.location.replace` (not a router push) so the old page and its data leave the history and memory. Then the Back button can't show payment data again.

### 7.3 Messages on the login page

Read `reason` from the URL:

| `reason` | Message |
|---|---|
| `idle` | "You were logged out after 15 minutes of inactivity." |
| `ended` | "Your session has ended. Please log in again." |
| `logout` | No message |

Don't try to tell the user *who* ended the session or *why*. The backend doesn't expose it.

---

## 8. Idle timeout (15 minutes)

### 8.1 How it works

There are two clocks:
- **Backend:** the session ends 15 minutes after the **last API call**.
- **Frontend:** you log the user out 15 minutes after the **last user action** (click, key, scroll, touch).

The frontend clock is the important one. It catches a user who walked away while background polling is still calling the API. It also clears the screen, so payment data isn't left visible on an unattended computer.

A user who is active but not calling the API (for example, filling a long form) would time out on the backend. To stop that, the frontend sends a **keep-alive** call every 5 minutes, but **only if the user did something in that time** (section 8.4).

### 8.2 What counts as user activity

Count: `pointerdown`, `keydown`, `wheel`, `touchstart`, `scroll`.

Don't count:
- `mousemove`: a bumped or resting mouse would keep the session alive;
- timers, polling, websocket messages, or any automatic API calls.

Activity in **any tab** counts for all tabs (stored in `localStorage`).

### 8.3 Timeline

```
0:00   last user action
14:00  show warning: "You'll be logged out in 1 minute"  [Stay logged in] [Log out]
15:00  logout('idle') → login page with the idle message
```

If the user does anything during the warning (or clicks "Stay logged in"), hide the warning and start counting again.

### 8.4 Code: `auth/idle.ts`

```ts
import { api } from '../api/client';
import { LAST_ACTIVITY_KEY, LAST_API_CALL_KEY, tokenStore } from './token-store';
import { logout } from './session';

const IDLE_LIMIT_MS = 15 * 60 * 1000;
const WARNING_AT_MS = 14 * 60 * 1000;
const KEEP_ALIVE_MS = 5 * 60 * 1000;
const CHECK_EVERY_MS = 5 * 1000;
const SAVE_ACTIVITY_EVERY_MS = 5 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];

const readTime = (key: string) => Number(localStorage.getItem(key) ?? 0);

let lastSaved = 0;
const markUserActive = () => {
  const now = Date.now();
  if (now - lastSaved < SAVE_ACTIVITY_EVERY_MS) return;
  lastSaved = now;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
};

// showWarning / hideWarning: open and close your warning dialog.
export const startIdleTimer = (showWarning: () => void, hideWarning: () => void) => {
  if (!localStorage.getItem(LAST_ACTIVITY_KEY)) markUserActive();
  ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markUserActive, { passive: true, capture: true }));

  const timer = window.setInterval(() => {
    if (!tokenStore.get().accessToken) return;

    const now = Date.now();
    const idleFor = now - readTime(LAST_ACTIVITY_KEY);

    if (idleFor >= IDLE_LIMIT_MS) {
      void logout('idle');
      return;
    }
    if (idleFor >= WARNING_AT_MS) showWarning();
    else hideWarning();

    // The user is active but the server hasn't heard from us for a while.
    const userActiveSinceLastCall = readTime(LAST_ACTIVITY_KEY) > readTime(LAST_API_CALL_KEY);
    if (userActiveSinceLastCall && now - readTime(LAST_API_CALL_KEY) >= KEEP_ALIVE_MS) {
      localStorage.setItem(LAST_API_CALL_KEY, String(now)); // stops other tabs sending it too
      void api('/profile/sessions').catch(() => undefined);
    }
  }, CHECK_EVERY_MS);

  return () => {
    window.clearInterval(timer);
    ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markUserActive, { capture: true }));
  };
};

// "Stay logged in" button in the warning dialog.
export const stayLoggedIn = async () => {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  await api('/profile/sessions');
};
```

Start it once when the logged-in layout mounts, and stop it on unmount:

```ts
// React example
useEffect(() => startIdleTimer(() => setWarningOpen(true), () => setWarningOpen(false)), []);
```

### 8.5 Warning dialog

- Title: "Are you still there?"
- Text: "You'll be logged out in 1 minute because of inactivity." Optionally show a countdown from 60.
- Buttons: **Stay logged in** (`stayLoggedIn()`), **Log out** (`logout()`).
- If `stayLoggedIn()` throws `SessionEndedError`, the session already ended. The client has already sent the user to login.

---

## 9. Polling and background calls

The idle timer in section 8 logs the user out after 15 minutes without action, even if polling continues. Polling still has two rules:

1. **Pause when the tab is hidden.** It saves server load, and a hidden tab doesn't need fresh data.
2. **Polling must never call `markUserActive`.** Only real user events do.

```ts
export const startPolling = (fn: () => Promise<unknown>, everyMs: number) => {
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void fn().catch(() => undefined);
  }, everyMs);
  return () => window.clearInterval(timer);
};
```

---

## 10. Maximum session length (12 hours)

Nothing extra to build. After 12 hours from login, the next refresh returns 401 `INVALID_REFRESH_TOKEN`. The client then ends the session and shows "Your session has ended. Please log in again."

Don't try to extend it. The user must log in again (and pass MFA if it's on).

---

## 11. Full flow

```
Login ─► startSession(tokens) ─► startIdleTimer()
                     │
   every API call ───┤ authFetch
                     ├─ 2xx/4xx (not 401) ─► return response
                     ├─ 401 TOKEN_EXPIRED ─► refreshTokens()   (one at a time, all tabs)
                     │        ├─ true  ─► retry request once
                     │        └─ false ─► endSession('ended') ─► /login?reason=ended
                     └─ 401 anything else ─► endSession('ended') ─► /login?reason=ended

Idle timer (every 5 s)
   ├─ 14 min no user action ─► show warning
   ├─ 15 min no user action ─► logout('idle') ─► POST /auth/logout ─► /login?reason=idle
   └─ user active, no API call for 5 min ─► keep-alive GET /profile/sessions

Any tab ends the session ─► BroadcastChannel ─► every tab clears tokens and goes to login
```

---

## 12. Testing checklist

To test quickly, ask the backend developer to set `JWT_ACCESS_EXPIRES_IN="1m"` on a local or staging server.

| # | Test | Expected |
|---|---|---|
| 1 | Log in, wait until the access token expires, click something | One refresh call, the request succeeds, the user notices nothing |
| 2 | Same as 1, but the page fires 5 API calls at once | Exactly **one** refresh call in the Network tab, all 5 succeed |
| 3 | Same as 1, with 2 tabs open, click in both | Exactly **one** refresh call across both tabs, both work |
| 4 | Log in on Chrome and Edge. Super admin logs out the Edge session. Click something in Edge | Edge goes to login with "Your session has ended". **No** refresh call. Chrome keeps working |
| 5 | Leave the panel untouched for 14 minutes | Warning appears |
| 6 | Click "Stay logged in" | Warning closes, the user stays logged in |
| 7 | Leave the panel untouched for 15 minutes | Login page with the idle message. Back button doesn't show the old page |
| 8 | Type in a long form for 20 minutes without saving | Still logged in (keep-alive calls every 5 minutes) |
| 9 | Dashboard with polling, user walks away | Logged out at 15 minutes despite polling |
| 10 | Click "Log out" in one of 3 tabs | All 3 tabs go to login |
| 11 | Turn off the network, let the token expire, click something | Error message, **not** logged out. Works again when the network is back |
| 12 | Admin without permission clicks "Log out device" on an agent | 403 message shown, admin stays logged in |
| 13 | Check `localStorage` after logout | No `auth.*` keys left |

---

## 13. Final checklist

- [ ] `token-store.ts`, `refresh.ts`, `client.ts`, `session.ts`, `idle.ts` added as above.
- [ ] Every protected API call goes through `api()` or `authFetch()`. No direct `fetch`/`axios` calls with the token.
- [ ] Refresh only on `TOKEN_EXPIRED`. Any other 401 goes to login.
- [ ] One refresh at a time, across tabs (Web Lock), and both new tokens saved every time.
- [ ] No refresh on page load or on a timer.
- [ ] Idle logout at 15 minutes of no user action, warning at 14 minutes, keep-alive while active.
- [ ] `mousemove` and polling don't count as activity. Polling pauses when the tab is hidden.
- [ ] Logout calls `POST /{portal}/auth/logout`, clears tokens and app state, and logs out every tab.
- [ ] Login page shows the right message for `?reason=idle` and `?reason=ended`.
- [ ] 403 `PASSWORD_CHANGE_REQUIRED` and `MFA_SETUP_REQUIRED` open their screens. 403 `FORBIDDEN` only shows a message.
- [ ] Tokens never appear in URLs, logs or error trackers.
- [ ] All tests in section 12 pass.
