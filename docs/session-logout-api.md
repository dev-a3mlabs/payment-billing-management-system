# Log Out Devices API

This document covers logging a user out of one device or all devices, and the new admin permission that controls it.

Base URL: `http://localhost:5000/api/v1`

All requests need a bearer token from login:
- Super admin APIs: `Authorization: Bearer <SUPER_ADMIN_TOKEN>`
- Admin APIs: `Authorization: Bearer <ADMIN_TOKEN>`

---

## 0. What changed

| # | Endpoint | Who | Change |
|---|---|---|---|
| 1 | `DELETE /super-admin/users/:uuid/sessions/:sessionUuid` | Super admin | **New.** Log an admin or agent out of one device |
| 2 | `DELETE /admin/agents/:uuid/sessions/:sessionUuid` | Admin | **New.** Log an agent out of one device. Needs `user.agent.session_revoke` |
| 3 | `DELETE /admin/agents/:uuid/sessions` | Admin | **Changed.** Now needs `user.agent.session_revoke` |
| 4 | `GET /admin/permissions/me` | Admin | **Changed.** Has the new key `user.agent.session_revoke` |
| 5 | `PUT /super-admin/users/:uuid/permissions` | Super admin | **Changed.** Can turn on `user.agent.session_revoke` for an admin |
| 6 | Every protected API | All | **Changed.** Access token now lasts 15 minutes. Expired token returns 401 `TOKEN_EXPIRED` instead of `INVALID_TOKEN` (see section 5) |
| 7 | Every protected API | All | **Changed.** Sessions end after **15 minutes without activity** (was 24 hours) and **12 hours after login** (was 15 days), even if active (see 5.4) |

Not changed: `DELETE /super-admin/users/:uuid/sessions` (log out of all devices) and `DELETE /{portal}/profile/sessions/:uuid` (user logs out one of their own devices) work the same as before.

Every logout, from any of these endpoints, is now saved in the activity log with who did it and from which IP. The frontend doesn't need to do anything for this.

---

## 1. Flows

### 1.1 Super admin: log a user out of one device

```
1. GET    /super-admin/users/:uuid/sessions                → list of logged-in devices
2. User clicks "Log out" on one device (e.g. Edge)
3. DELETE /super-admin/users/:uuid/sessions/:sessionUuid   → sessionUuid = data[].uuid from step 1
4. Remove that row, or call step 1 again
```

The user's other devices (e.g. Chrome) stay logged in. The logged-out device gets **401 `INVALID_TOKEN`** on its next request and goes to login.

### 1.2 Super admin: let an admin log out their agents

```
PUT /super-admin/users/:adminUuid/permissions   { "values": { "user.agent.session_revoke": true } }
```

It's **off by default**. Until the super admin turns it on, the admin can't log out agents, not even from all devices.

### 1.3 Admin: log an agent out

```
1. GET    /admin/permissions/me                          → check user.agent.session_revoke is true
2. GET    /admin/agents/:uuid/sessions                   → list of the agent's logged-in devices
3a. One device:  DELETE /admin/agents/:uuid/sessions/:sessionUuid
3b. All devices: DELETE /admin/agents/:uuid/sessions
```

**Show the "Log out" and "Log out all devices" buttons only when `user.agent.session_revoke` is `true`.** The sessions list (step 2) can still be shown without it.

---

## 2. Super admin APIs

### 2.1 Log a user out of one device (new)

`DELETE /super-admin/users/:uuid/sessions/:sessionUuid`

| Param | Meaning |
|---|---|
| `uuid` | The admin's or agent's `uuid` |
| `sessionUuid` | The session's `uuid` from `GET /super-admin/users/:uuid/sessions` |

```bash
curl --location --request DELETE 'http://localhost:5000/api/v1/super-admin/users/678c50e3-9f6c-4eb5-9ea3-e74f751c08f5/sessions/383630fb-ac6c-4277-b68c-6b5f3af6ad3f' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Device logged out successfully",
  "data": null
}
```

**404**: the user doesn't exist or is deleted.
```json
{
  "success": false,
  "message": "User not found",
  "error": { "code": "NOT_FOUND" }
}
```

**404**: the session doesn't exist, doesn't belong to this user, or is already logged out.
```json
{
  "success": false,
  "message": "Session not found",
  "error": { "code": "NOT_FOUND" }
}
```

On "Session not found", refresh the sessions list. The device was probably already logged out.

**400**: a UUID is not valid.
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "field": "sessionUuid", "message": "Session UUID must be a valid UUID" }]
  }
}
```

### 2.2 Turn on the permission for an admin

`PUT /super-admin/users/:uuid/permissions` (existing endpoint, new key)

```bash
curl --location --request PUT 'http://localhost:5000/api/v1/super-admin/users/286c3231-237b-4dec-9d75-bcd8df6dc7b7/permissions' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "values": { "user.agent.session_revoke": true }
}'
```

**200 OK**: same response as before. The new key shows as:
```json
{ "key": "user.agent.session_revoke", "value": true, "source": "user", "locked": true }
```

To turn it off, send `false`.

The key's label and description come from `GET /super-admin/permissions`:
```json
{
  "key": "user.agent.session_revoke",
  "label": "Log out agent devices",
  "description": "Admin can log out their agents from one device or all devices",
  "module": "user",
  "kind": "permission",
  "valueType": "bool",
  "defaultValue": false,
  "appliesTo": ["admin"],
  "editableBy": ["super_admin"]
}
```

---

## 3. Admin APIs

### 3.1 Check the permission

`GET /admin/permissions/me` (existing endpoint, new key)

```bash
curl --location 'http://localhost:5000/api/v1/admin/permissions/me' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK** (shortened)
```json
{
  "success": true,
  "message": "Your permissions retrieved successfully",
  "data": [
    { "key": "user.agent.mfa_reset", "value": false, "source": "default", "locked": false },
    { "key": "user.agent.session_revoke", "value": true, "source": "user", "locked": true },
    { "key": "user.agent.status_change", "value": true, "source": "user", "locked": false }
  ]
}
```

Show the logout buttons only when `user.agent.session_revoke` has `"value": true`.

### 3.2 Log an agent out of one device (new)

`DELETE /admin/agents/:uuid/sessions/:sessionUuid`

| Param | Meaning |
|---|---|
| `uuid` | The agent's `uuid` |
| `sessionUuid` | The session's `uuid` from `GET /admin/agents/:uuid/sessions` |

```bash
curl --location --request DELETE 'http://localhost:5000/api/v1/admin/agents/a4b1c2d3-e5f6-4789-abcd-ef0123456789/sessions/383630fb-ac6c-4277-b68c-6b5f3af6ad3f' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Device logged out successfully",
  "data": null
}
```

**403**: the admin doesn't have `user.agent.session_revoke`.
```json
{
  "success": false,
  "message": "You do not have permission to log out agent devices",
  "error": { "code": "FORBIDDEN" }
}
```

**404**: the agent doesn't exist, is deleted, or isn't this admin's agent.
```json
{
  "success": false,
  "message": "Agent not found",
  "error": { "code": "NOT_FOUND" }
}
```

**404**: the session doesn't exist, doesn't belong to this agent, or is already logged out.
```json
{
  "success": false,
  "message": "Session not found",
  "error": { "code": "NOT_FOUND" }
}
```

**400**: a UUID is not valid.
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "field": "sessionUuid", "message": "Session UUID must be a valid UUID" }]
  }
}
```

### 3.3 Log an agent out of all devices (changed)

`DELETE /admin/agents/:uuid/sessions`

Same request and response as before, but it **now needs `user.agent.session_revoke`**.

```bash
curl --location --request DELETE 'http://localhost:5000/api/v1/admin/agents/a4b1c2d3-e5f6-4789-abcd-ef0123456789/sessions' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Agent logged out from all devices successfully",
  "data": null
}
```

**403**: the admin doesn't have `user.agent.session_revoke`.
```json
{
  "success": false,
  "message": "You do not have permission to log out agent devices",
  "error": { "code": "FORBIDDEN" }
}
```

**404**: the agent doesn't exist, is deleted, or isn't this admin's agent.
```json
{
  "success": false,
  "message": "Agent not found",
  "error": { "code": "NOT_FOUND" }
}
```

---

## 4. Errors every endpoint can return

| Status | `error.code` | When | What to do |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | A UUID in the URL is invalid | Show `details[].message` |
| 401 | `UNAUTHORIZED` | No token sent | Go to login |
| 401 | `TOKEN_EXPIRED` | Access token expired | Refresh the token once, then retry the request |
| 401 | `INVALID_TOKEN` | Session was logged out or revoked, or the token is invalid | Go to login (don't refresh) |
| 403 | `FORBIDDEN` | Wrong portal for this token, or the admin is missing the permission | Show the message |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Admin must change their password first (admin routes) | Open the change-password screen |
| 403 | `MFA_SETUP_REQUIRED` | MFA is required and not set up yet | Open the MFA setup screen (see `mfa-api.md`) |
| 404 | `NOT_FOUND` | User, agent or session not found | Show "not found" and refresh the list |

---

## 5. Handling 401: refresh or log out (changed)

The access token now lasts **15 minutes** (it was 1 day). An expired token returns a new code, `TOKEN_EXPIRED`, so the frontend knows when to refresh.

| `error.code` | Meaning | What to do |
|---|---|---|
| `TOKEN_EXPIRED` | The access token's 15 minutes are over | Refresh, then retry the request |
| `INVALID_TOKEN` | The session was logged out (by the user, an admin or the super admin), timed out (5.4), the user was deactivated, or the token is invalid | Go to login. **Don't** refresh |

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

### 5.1 Flow

```
API call → 401
  ├─ TOKEN_EXPIRED → POST /{portal}/auth/refresh { refreshToken }
  │     ├─ 200 → save BOTH new tokens, retry the original request once
  │     └─ 401 INVALID_REFRESH_TOKEN → clear tokens, go to login
  └─ INVALID_TOKEN or UNAUTHORIZED → clear tokens, go to login
```

On login, show: "Your session has ended. Please log in again."

### 5.2 Refresh API (existing)

`POST /{portal}/auth/refresh` (`{portal}` is `super-admin`, `admin` or `agent`)

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

**401**: the session was logged out or expired, or the refresh token was already used.
```json
{
  "success": false,
  "message": "Invalid or expired refresh token",
  "error": { "code": "INVALID_REFRESH_TOKEN" }
}
```

### 5.3 Rules (important)

1. **Every refresh returns a new refresh token.** Save it and throw the old one away. The old one can't be used again.
2. **Only one refresh at a time.** If a refresh token is sent twice, the server treats it as stolen and **logs the user out of every device**. So:
   - When several requests get `TOKEN_EXPIRED` together, start **one** refresh. Make the other requests wait for it, then retry them with the new access token.
   - Do the same across browser tabs: only one tab refreshes (use the Web Locks API, `navigator.locks.request('token-refresh', ...)`), and the other tabs read the new tokens.
3. **Retry each request only once.** If the retried request gets 401 again, go to login. Never loop.
4. **Never refresh when the 401 came from the refresh call itself.**

### 5.4 Session timeouts (changed)

| Limit | Value | Was |
|---|---|---|
| Idle timeout: no API call for this long ends the session | **15 minutes** | 24 hours |
| Maximum session: the session ends this long after login, even if the user is active | **12 hours** | 15 days |

- Any API call with a valid access token counts as activity, and so does a successful refresh.
- After the session ends, the next request gets `INVALID_TOKEN`, or `TOKEN_EXPIRED` followed by a refresh that fails with `INVALID_REFRESH_TOKEN`. Both go to login (5.1). Nothing extra to build.
- **Don't let timers keep the session alive.** Background polling or auto-refresh (e.g. reloading a dashboard every 30 seconds) counts as activity, so a user who walked away would never be logged out. Stop polling when the tab is hidden (`document.visibilityState === 'hidden'`) or when the user hasn't touched the mouse or keyboard for a while. Only real user actions should keep calling the API.
- Optional: show a warning at **14 minutes** of no user action: "You'll be logged out in 1 minute" with a "Stay logged in" button. The button can call any light API, such as `GET /{portal}/profile/sessions`.

---

## 6. Frontend checklist

- [ ] Super admin → user's sessions: add a "Log out" button on each device row (2.1). Keep "Log out all devices" as it is.
- [ ] Super admin → admin's permissions screen: show the new `user.agent.session_revoke` toggle (2.2). It appears automatically if the screen lists every key from `GET /super-admin/permissions`.
- [ ] Admin → agent's sessions: add a "Log out" button on each device row (3.2).
- [ ] Admin: show "Log out" and "Log out all devices" only when `user.agent.session_revoke` is `true` (3.1).
- [ ] Admin: handle 403 `FORBIDDEN` on both logout calls, in case the super admin turns the permission off while the page is open.
- [ ] On 404 "Session not found", refresh the sessions list.
- [ ] 401 handling: refresh only on `TOKEN_EXPIRED`, and go to login on `INVALID_TOKEN` (5.1).
- [ ] One refresh at a time, including across tabs, and save the new refresh token every time (5.3).
- [ ] Stop background polling when the tab is hidden or the user is idle (5.4).
- [ ] Optional: "You'll be logged out in 1 minute" warning at 14 minutes of no user action (5.4).
