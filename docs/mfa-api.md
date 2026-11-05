# MFA (Authenticator App) API

This document covers two-step login with an authenticator app (Microsoft Authenticator, Google Authenticator, Authy, and others), MFA setup, and how admins and the super admin manage MFA for other users.

Base URL: `http://localhost:5000/api/v1`

`{portal}` is one of `super-admin`, `admin`, `agent`, the same as the existing login URLs.

Logged-in requests need `Authorization: Bearer <ACCESS_TOKEN>`.

---

## 1. How it works

- When MFA is **on** for a user, every login has two steps: password first, then the 6-digit code from the app. The code is asked **on every login**, on every device, with no "remember this device" option.
- The **super admin always needs MFA.** Until they set it up, every super admin API returns `MFA_SETUP_REQUIRED`.
- For **admins and agents**, MFA is required only when the `auth.mfa.required` permission is on for them. The super admin sets this, and admins can set it for their agents if the super admin granted them that key (see `permission-grants-api.md`).
- Any user can also turn MFA on for themselves, even when it's not required.
- When MFA is turned on, the user gets **10 recovery codes**. Each one works once instead of the 6-digit code, for when the phone is lost. They're shown **only once**.
- If a user loses their phone and their recovery codes, the super admin (or their admin, with permission) **resets** their MFA. The user is logged out everywhere and sets MFA up again.

---

## 2. Flows

### 2.1 Login

```
1. POST /{portal}/auth/login          (same request as today)
   ├─ data.mfaRequired = false → logged in (tokens in the response), same as today
   └─ data.mfaRequired = true  → show the "Enter code" screen, keep data.mfaToken

2. POST /{portal}/auth/login/mfa      { mfaToken, code, eventId }
   → logged in (same response as a normal login)
```

Rules for step 2:
- `eventId` must be a **new** Fingerprint event from the **same browser** as step 1. Call Fingerprint again before sending; don't reuse step 1's `eventId`.
- `code` is the 6-digit app code **or** a recovery code. Add a "Use a recovery code" link that switches the input to text.
- `mfaToken` is valid for **5 minutes** and up to **5 wrong codes**. After that you get `INVALID_MFA_TOKEN`, so send the user back to the login screen.
- No Turnstile token is needed in step 2.

### 2.2 After login: what to show

Check these fields in the login response, in this order:

| Field | Value | Show |
|---|---|---|
| `mustChangePassword` | `true` | Change-password screen (existing) |
| `mfaSetupRequired` | `true` | MFA setup screen (2.3). Other APIs return `MFA_SETUP_REQUIRED` until setup is done |
| both `false` | | Dashboard |

Also handle it at any time: if any API returns **403 `MFA_SETUP_REQUIRED`**, go to the MFA setup screen. This happens when MFA becomes required while the user is already logged in.

### 2.3 MFA setup screen

```
1. POST /{portal}/profile/mfa/setup     → show data.qrCode as an image, and data.secret as text
2. User scans the QR in the app (or types the secret)
3. POST /{portal}/profile/mfa/enable    { code }  → show data.recoveryCodes
4. Recovery codes screen: "Save these codes now", with Copy / Download buttons,
   and a "I saved them" button before continuing
```

- If the user scanned wrong, just call step 1 again. It replaces the old QR until MFA is enabled.
- Enabling MFA **logs the user out of all their other devices**. The current device stays logged in.

### 2.4 Profile security screen

```
GET  /{portal}/profile/mfa            → { enabled, required }
POST /{portal}/profile/mfa/setup      → when enabled = false
POST /{portal}/profile/mfa/disable    → only when enabled = true and required = false
```

Hide the "Turn off" button when `required` is `true`.

### 2.5 Super admin: manage MFA for admins and agents

```
Require MFA:    PUT    /super-admin/users/:uuid/permissions   { values: { "auth.mfa.required": true } }
Let an admin require it for agents:
                PUT    /super-admin/users/:adminUuid/grants   { keys: [..., "auth.mfa.required"] }
Let an admin reset agent MFA:
                PUT    /super-admin/users/:adminUuid/permissions { values: { "user.agent.mfa_reset": true } }
Status:         GET    /super-admin/users/:uuid/mfa
Reset:          DELETE /super-admin/users/:uuid/mfa
```

### 2.6 Admin: manage MFA for their agents

```
Require MFA:    PUT    /admin/agents/:uuid/permissions   { values: { "auth.mfa.required": true } }
                (only works when auth.mfa.required is editable: true for that agent)
Status:         GET    /admin/agents/:uuid/mfa
Reset:          DELETE /admin/agents/:uuid/mfa            (needs user.agent.mfa_reset)
```

To know whether to show the reset button, call `GET /admin/permissions/me` (section 6.0) and check that `user.agent.mfa_reset` has `value: true`.

---

## 3. Login APIs

### 3.1 Login, step 1 (changed)

`POST /{portal}/auth/login`

The request is the same as today. The response now always has `mfaRequired`.

```bash
curl --location 'http://localhost:5000/api/v1/admin/auth/login' \
--header 'Content-Type: application/json' \
--data '{
  "username": "devyadav00",
  "password": "Your@Password1",
  "eventId": "<FINGERPRINT_EVENT_ID>",
  "IdentityToken": "<TURNSTILE_TOKEN>"
}'
```

**200 OK: MFA is on for this user.** No tokens yet.
```json
{
  "success": true,
  "message": "MFA code required",
  "data": {
    "mfaRequired": true,
    "mfaToken": "kQ3n0b8hY9sJ2l7cXwVr5mPz1aEuT6dFgHiK4oNqLs0"
  }
}
```

**200 OK: MFA is off for this user.** Logged in, same as before plus `mfaRequired` and `mfaSetupRequired`.
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "mfaRequired": false,
    "mustChangePassword": false,
    "mfaSetupRequired": false,
    "accessToken": "<ACCESS_TOKEN>",
    "refreshToken": "<REFRESH_TOKEN>",
    "user": {
      "uuid": "678c50e3-9f6c-4eb5-9ea3-e74f751c08f5",
      "username": "devyadav00",
      "email": null,
      "firstName": null,
      "lastName": null,
      "role": "admin",
      "countryCode": null,
      "mobileNumber": null,
      "status": "active"
    }
  }
}
```

All the existing login errors are unchanged.

### 3.2 Login, step 2 (new)

`POST /{portal}/auth/login/mfa`

```bash
curl --location 'http://localhost:5000/api/v1/admin/auth/login/mfa' \
--header 'Content-Type: application/json' \
--data '{
  "mfaToken": "kQ3n0b8hY9sJ2l7cXwVr5mPz1aEuT6dFgHiK4oNqLs0",
  "code": "482913",
  "eventId": "<NEW_FINGERPRINT_EVENT_ID>"
}'
```

With a recovery code, send it in `code`. Dashes, spaces and upper or lower case don't matter:
```json
{ "mfaToken": "...", "code": "8094-c62c-e11a-ee94", "eventId": "..." }
```

**200 OK**: the same response as a normal successful login (3.1, `mfaRequired: false`), with tokens.

**Errors:**

| Status | `error.code` | `message` | What to do |
|---|---|---|---|
| 401 | `INVALID_MFA_CODE` | `Invalid code` | Show the error, clear the input, let them try again |
| 401 | `INVALID_MFA_TOKEN` | `Your login has expired. Please log in again.` | Go back to the login screen (expired, too many wrong codes, or already used) |
| 403 | `ACCOUNT_LOCKED` | `Your account is locked. Please contact your administrator.` | Show the message. Too many wrong codes locked the account |
| 403 | `LOGIN_BLOCKED` | `We could not verify your login. Please refresh the page and try again.` | Code sent from a different browser, or a risky device |
| 403 | `ACCOUNT_INACTIVE` | `Your account is not active. Please contact your admin.` | Show the message |
| 403 | `DEVICE_LIMIT_REACHED` | `You are logged in on the maximum number of devices. ...` | Same as normal login |
| 400 | `VALIDATION_ERROR` | `Validation failed` | A field is missing |

Example:
```json
{
  "success": false,
  "message": "Invalid code",
  "error": { "code": "INVALID_MFA_CODE" }
}
```

### 3.3 MFA setup required (any API)

If MFA is required but not set up, every portal API (except profile and auth) returns:

**403**
```json
{
  "success": false,
  "message": "You must set up MFA before accessing this resource.",
  "error": { "code": "MFA_SETUP_REQUIRED" }
}
```

For admins, `PASSWORD_CHANGE_REQUIRED` comes first if the password still needs changing.

---

## 4. Profile MFA APIs (the logged-in user's own MFA)

These work in all three portals and need the user's access token.

### 4.1 Get MFA status

`GET /{portal}/profile/mfa`

```bash
curl --location 'http://localhost:5000/api/v1/admin/profile/mfa' \
--header 'Authorization: Bearer <ACCESS_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "MFA status retrieved successfully",
  "data": { "enabled": false, "required": true }
}
```

- `enabled`: MFA is on.
- `required`: the user can't turn it off. Always `true` for the super admin.

### 4.2 Start setup

`POST /{portal}/profile/mfa/setup`

```bash
curl --location --request POST 'http://localhost:5000/api/v1/admin/profile/mfa/setup' \
--header 'Authorization: Bearer <ACCESS_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Scan the QR code with your authenticator app",
  "data": {
    "secret": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
}
```

- `qrCode`: use it directly as `<img src={qrCode} />`.
- `secret`: show it under the QR for manual entry ("Can't scan? Enter this key"). Showing it in groups of 4 makes it easier to type.
- In the app, the account shows as **Payment Billing (username)**.

**409**: MFA is already on.
```json
{ "success": false, "message": "MFA is already enabled", "error": { "code": "CONFLICT" } }
```

**409**: two setup requests were sent at the same time (for example React StrictMode running `useEffect` twice, or a double click).
```json
{ "success": false, "message": "MFA setup is already in progress. Please try again.", "error": { "code": "CONFLICT" } }
```

Call setup **once**: on the button click, with the button disabled while the request runs. Every setup call creates a new secret, so only the QR from the **last successful** call works.

### 4.3 Confirm and turn on

`POST /{portal}/profile/mfa/enable`

```bash
curl --location 'http://localhost:5000/api/v1/admin/profile/mfa/enable' \
--header 'Authorization: Bearer <ACCESS_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "code": "482913"
}'
```

**200 OK**: show these codes once. They can't be fetched again.
```json
{
  "success": true,
  "message": "MFA enabled successfully. Save your recovery codes now.",
  "data": {
    "recoveryCodes": [
      "8094-c62c-e11a-ee94",
      "1f3a-77b0-c4d2-9e15",
      "a6e8-0b4f-3d91-c27a",
      "5c0d-e8a3-71f6-b94e",
      "d2b7-4a19-e06c-83f5",
      "39fe-c51a-07d8-6b2c",
      "e740-9d3b-a28f-15c6",
      "7b61-f0e2-c94a-d38b",
      "0ca5-38d7-b1e6-4f92",
      "f81c-6e45-2a0b-d7e3"
    ]
  }
}
```

**Errors:**

| Status | `error.code` | `message` |
|---|---|---|
| 400 | `INVALID_MFA_CODE` | `Invalid code` (wrong code, or the phone's time is wrong) |
| 400 | `VALIDATION_ERROR` | `Code must be 6 digits` |
| 400 | `BAD_REQUEST` | `Please start MFA setup first` (call 4.2 first) |
| 409 | `CONFLICT` | `MFA is already enabled` |

### 4.4 Turn off

`POST /{portal}/profile/mfa/disable`

Only allowed when `required` is `false`. It needs the password **and** a current code (or a recovery code).

```bash
curl --location 'http://localhost:5000/api/v1/admin/profile/mfa/disable' \
--header 'Authorization: Bearer <ACCESS_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "password": "Your@Password1",
  "code": "482913"
}'
```

**200 OK**
```json
{ "success": true, "message": "MFA disabled successfully", "data": null }
```

**Errors:**

| Status | `error.code` | `message` |
|---|---|---|
| 400 | `INVALID_MFA_CODE` | `Invalid password or code` |
| 400 | `BAD_REQUEST` | `MFA is not enabled` |
| 403 | `FORBIDDEN` | `MFA is required for your account` |

---

## 5. Super admin APIs

### 5.1 Get a user's MFA status

`GET /super-admin/users/:uuid/mfa` (admins and agents)

```bash
curl --location 'http://localhost:5000/api/v1/super-admin/users/286c3231-237b-4dec-9d75-bcd8df6dc7b7/mfa' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "User MFA status retrieved successfully",
  "data": { "enabled": true, "required": false }
}
```

**404**: `{ "success": false, "message": "User not found", "error": { "code": "NOT_FOUND" } }`

### 5.2 Reset a user's MFA

`DELETE /super-admin/users/:uuid/mfa`

Removes the user's MFA and recovery codes and **logs them out on every device**. If MFA is required for them, they must set it up again on their next login. Calling it when MFA is already off is safe and changes nothing.

```bash
curl --location --request DELETE 'http://localhost:5000/api/v1/super-admin/users/286c3231-237b-4dec-9d75-bcd8df6dc7b7/mfa' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**
```json
{ "success": true, "message": "User MFA reset successfully", "data": null }
```

**404**: same as 5.1.

Show a confirm dialog first: "This logs the user out everywhere and removes their authenticator. Continue?"

---

## 6. Admin APIs

### 6.0 Get the admin's own permissions

`GET /admin/permissions/me`

Returns the logged-in admin's own values. Call it once after login (and after any 403), and use it to show or hide actions:

| Key | Show when `value` is `true` |
|---|---|
| `user.agent.mfa_reset` | "Reset MFA" on an agent |
| `user.agent.create` | "Create agent" |
| `user.agent.delete` | "Delete agent" |
| `user.agent.status_change` | "Activate / Deactivate agent" |

```bash
curl --location 'http://localhost:5000/api/v1/admin/permissions/me' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Your permissions retrieved successfully",
  "data": [
    { "key": "auth.device_limit.enabled", "value": false, "source": "user", "locked": false },
    { "key": "auth.device_limit.max_devices", "value": 5, "source": "user", "locked": false },
    { "key": "auth.lockout.enabled", "value": false, "source": "user", "locked": false },
    { "key": "auth.lockout.max_attempts", "value": 5, "source": "user", "locked": false },
    { "key": "auth.mfa.required", "value": false, "source": "default", "locked": false },
    { "key": "user.agent.create", "value": false, "source": "user", "locked": false },
    { "key": "user.agent.delete", "value": true, "source": "user", "locked": false },
    { "key": "user.agent.max", "value": 1, "source": "user", "locked": false },
    { "key": "user.agent.mfa_reset", "value": false, "source": "default", "locked": false },
    { "key": "user.agent.status_change", "value": true, "source": "user", "locked": false }
  ]
}
```

Labels and descriptions come from `GET /admin/permissions`, matched by `key`. The backend always checks the permission again, so a hidden button is only for a better experience, not for security.

### 6.1 Get an agent's MFA status

`GET /admin/agents/:uuid/mfa`

```bash
curl --location 'http://localhost:5000/api/v1/admin/agents/286c3231-237b-4dec-9d75-bcd8df6dc7b7/mfa' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Agent MFA status retrieved successfully",
  "data": { "enabled": true, "required": true }
}
```

**404**: `{ "success": false, "message": "Agent not found", "error": { "code": "NOT_FOUND" } }`

### 6.2 Reset an agent's MFA

`DELETE /admin/agents/:uuid/mfa`

Needs the `user.agent.mfa_reset` permission from the super admin. Same effect as 5.2.

```bash
curl --location --request DELETE 'http://localhost:5000/api/v1/admin/agents/286c3231-237b-4dec-9d75-bcd8df6dc7b7/mfa' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{ "success": true, "message": "Agent MFA reset successfully", "data": null }
```

**Errors:**

| Status | `error.code` | `message` |
|---|---|---|
| 403 | `FORBIDDEN` | `You do not have permission to reset agent MFA` |
| 403 | `FORBIDDEN` | `You cannot reset MFA for this agent` (the agent is suspended) |
| 404 | `NOT_FOUND` | `Agent not found` |

---

## 7. New permission keys

These appear in the existing permission APIs (`GET /super-admin/permissions`, `GET /admin/permissions`, and the user and agent permission endpoints).

| Key | Kind | Applies to | Who can change it | Meaning |
|---|---|---|---|---|
| `auth.mfa.required` | policy (bool) | admin, agent | super admin; admin for agents if granted | User must use MFA |
| `user.agent.mfa_reset` | permission (bool) | admin | super admin | Admin can reset their agents' MFA |

`auth.mfa.required` now also appears in `GET /super-admin/users/:uuid/grants`.

---

## 8. Frontend checklist

- After step 1, branch on `data.mfaRequired`.
- Get a **new** Fingerprint `eventId` for step 2.
- On `INVALID_MFA_TOKEN`, go back to the login screen. On `INVALID_MFA_CODE`, stay on the code screen.
- After login, check `mustChangePassword` first, then `mfaSetupRequired`.
- On **any** 403 `MFA_SETUP_REQUIRED`, open the setup screen.
- Code input: numbers only, 6 digits, `autocomplete="one-time-code"`, and submit automatically when 6 digits are typed. Recovery code mode: plain text.
- Recovery codes: show once, with copy and download, and require "I saved them" before continuing.
- Hide "Turn off MFA" when `required` is `true`.
- After a reset or after enabling MFA, other sessions get 401 `INVALID_TOKEN`, so handle it with the existing logout flow.
- Never store the `secret`, `qrCode` or recovery codes in localStorage.
