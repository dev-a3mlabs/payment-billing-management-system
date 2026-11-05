# Login Reports & Security Alerts API

This document covers the login history of admins and agents (when, from which device, location, IP, visitor ID), currently logged-in devices, security alerts, and CSV export.

Base URL: `http://localhost:5000/api/v1`

All requests need `Authorization: Bearer <ACCESS_TOKEN>`.

---

## 0. All APIs at a glance

| # | Method & path | Who | Used for | Section |
|---|---|---|---|---|
| 1 | `GET /super-admin/login-reports/summary` | Super admin | Summary cards and charts for all admins and agents | 6.2 |
| 2 | `GET /super-admin/login-reports` | Super admin | Login history table and map (all, or one user with `userUuid`) | 6.1, 6.4 |
| 3 | `GET /super-admin/login-reports/export` | Super admin | Download the history as CSV | 6.3 |
| 4 | `GET /super-admin/security-alerts` | Super admin | Alerts list and badge (all, or one user with `userUuid`) | 7.1 |
| 5 | `PATCH /super-admin/security-alerts/:id/resolve` | Super admin | Mark an alert as handled | 7.2 |
| 6 | `GET /admin/login-reports/summary` | Admin | Same as 1, only their own agents | 6.2 |
| 7 | `GET /admin/login-reports` | Admin | Same as 2, only their own agents | 6.1, 6.4 |
| 8 | `GET /admin/login-reports/export` | Admin | Same as 3, only their own agents | 6.3 |
| 9 | `GET /admin/security-alerts` | Admin | Same as 4, only their own agents | 7.1 |
| 10 | `PATCH /admin/security-alerts/:id/resolve` | Admin | Same as 5, only their own agents | 7.2 |
| 11 | `GET /{portal}/profile/login-history` | Everyone | The user's own login history | 8.1 |
| 12 | `GET /{portal}/profile/security-alerts` | Everyone | The user's own alerts ("Was this you?") | 8.2 |
| 13 | `GET /super-admin/admins` | Super admin | Admins list, now with `activeDevices` | 9.1 |
| 14 | `GET /super-admin/:uuid/agents` | Super admin | One admin's agents, now with `activeDevices` | 9.2 |
| 15 | `GET /admin/agents` | Admin | Their agents, now with `activeDevices` | 9.3 |

Related existing APIs used in the flows: `GET /super-admin/users/:uuid/sessions`, `DELETE /super-admin/users/:uuid/sessions`, `GET /admin/agents/:uuid/sessions`, `DELETE /admin/agents/:uuid/sessions`, `GET /{portal}/profile/sessions`.

---

## 1. Who sees what

| Endpoint group | Super admin | Admin | Agent |
|---|---|---|---|
| `/{portal}/login-reports...` | All admins and agents, plus attempts with unknown usernames | Only their own agents | — |
| `/{portal}/security-alerts...` | All admins and agents | Only their own agents | — |
| `/{portal}/profile/login-history` | Own | Own | Own |
| `/{portal}/profile/security-alerts` | Own (read-only) | Own (read-only) | Own (read-only) |

`{portal}` is `super-admin` or `admin` for reports and alerts, and `super-admin`, `admin` or `agent` for profile.

---

## 2. Important: Fingerprint `eventId` on every attempt

Failed attempts now save device and location too. Because each `eventId` can only be saved once, **get a new Fingerprint `eventId` before every login request**, including a retry after a wrong password, and before every MFA code attempt. A reused `eventId` returns 403 `LOGIN_BLOCKED`.

---

## 3. What is recorded

Every login attempt (success, failed and blocked) is saved and **kept forever**.

| Field | Meaning |
|---|---|
| `createdAt` | When it happened |
| `status` | `success`, `failed`, `blocked` |
| `blockReason` | Why it failed or was blocked (see table below), `null` on success |
| `mfaMethod` | `totp`, `recovery_code`, or `null` (no MFA used) |
| `requestIp` | IP address |
| `visitorId` | Fingerprint device ID |
| `browserName`, `os`, `userAgent` | Device |
| `city`, `countryCode`, `latitude`, `longitude` | Location. Use `latitude` and `longitude` directly on a map |
| `isNewDevice` | First successful login from this device for this user |
| `isNewLocation` | First successful login from this city for this user |
| `isImpossibleTravel` | Too far from the previous login for the time between them (faster than a plane) |
| `sessionActive` | This login's device is still logged in right now |
| `user` | `{ uuid, username, role }`, or `null` for an unknown username |
| `attemptedUsername` | The username typed, only when it matched no account |

`blockReason` values:

| Value | Meaning |
|---|---|
| `wrong_password` | Wrong password |
| `wrong_mfa_code` | Wrong MFA code |
| `unknown_user` | Username doesn't exist |
| `account_locked` | Account is locked |
| `device_limit` | Too many devices logged in |
| `device_mismatch` | MFA code sent from a different device than the password |
| `bot`, `vpn`, `incognito`, `low_confidence`, `event_not_found`, `fingerprint_unavailable` | Blocked by the device check |

Flags are only set on **new** successful logins. A user's very first login sets no flags, and logins from before this release have none.

Location and device can be `null`: for example when Fingerprint had no event, or for attempts saved before this release.

---

## 4. Flows

### 4.1 Super admin / admin: Login reports screen

```
1. GET /{portal}/login-reports/summary?from=&to=     → cards, charts, "logged in now"
2. GET /{portal}/login-reports?from=&to=&page=1      → table (+ filters)
3. Click a row's user → GET /{portal}/login-reports?userUuid=...   → that user's history
4. "Export" button → GET /{portal}/login-reports/export?same filters → downloads CSV
5. Map view → use latitude / longitude of the rows
```

### 4.2 Super admin / admin: Security alerts

```
1. GET   /{portal}/security-alerts?resolved=false   → open alerts, use unresolvedCount for a badge
2. GET   /{portal}/login-reports?userUuid=...         → investigate the user
3. PATCH /{portal}/security-alerts/:id/resolve        → mark as handled
   (optional) log the user out: DELETE /super-admin/users/:uuid/sessions or DELETE /admin/agents/:uuid/sessions
   (optional) reset MFA: see mfa-api.md
```

### 4.3 Super admin / admin: One user's detail page

```
GET /{portal}/login-reports/summary?userUuid=...     → summary cards for that user
GET /{portal}/login-reports?userUuid=...             → history table and map
GET /{portal}/security-alerts?userUuid=...           → that user's alerts (unresolvedCount = their open alerts)
GET /super-admin/users/:uuid/sessions  or  GET /admin/agents/:uuid/sessions   → devices logged in now
```

### 4.4 Any user: Profile → Security

```
GET /{portal}/profile/login-history      → "Recent activity"
GET /{portal}/profile/security-alerts    → "Was this you?" list
GET /{portal}/profile/sessions           → logged-in devices (existing), with "Log out device"
```

### 4.5 Users list: devices logged in

These existing lists now include `activeDevices` (number of devices logged in right now) on each user (see section 9):
- `GET /super-admin/admins`
- `GET /super-admin/:uuid/agents`
- `GET /admin/agents`

Show it as a column ("2 devices"). Clicking it opens the user's sessions: `GET /super-admin/users/:uuid/sessions` or `GET /admin/agents/:uuid/sessions`.

---

## 5. Filters and dates

All report endpoints accept the same query filters:

| Query | Example | Notes |
|---|---|---|
| `from`, `to` | `2026-11-01`, `2026-11-05T23:59:59Z` | ISO date. Default: the **last 30 days**. Max range: **366 days** |
| `page` | `1` | 20 rows per page |
| `userUuid` | `286c3231-...` | One user |
| `role` | `admin`, `agent` | |
| `status` | `success`, `failed`, `blocked` | |
| `countryCode` | `IN` | 2 letters |
| `ip` | `103.21.45.10` | |
| `visitorId` | `Xb7k...` | One device |
| `flagged` | `true` | Only new device, new location or impossible travel |

`/profile/login-history` accepts only `page`, `from`, `to` and `status`.

Invalid filters return **400 `VALIDATION_ERROR`**, for example:
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "field": "from", "message": "From must be before To, and the range at most 366 days" }]
  }
}
```

---

## 6. Login report APIs (super admin and admin)

### 6.1 List

`GET /super-admin/login-reports` and `GET /admin/login-reports`

```bash
curl --location 'http://localhost:5000/api/v1/super-admin/login-reports?from=2026-11-01&to=2026-11-05T23:59:59Z&status=success&page=1' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Login report retrieved successfully",
  "data": {
    "from": "2026-11-01T00:00:00.000Z",
    "to": "2026-11-05T23:59:59.000Z",
    "items": [
      {
        "id": "211",
        "createdAt": "2026-11-05T09:53:23.400Z",
        "portal": "agent",
        "status": "success",
        "blockReason": null,
        "mfaMethod": "totp",
        "attemptedUsername": null,
        "requestIp": "103.21.45.10",
        "visitorId": "Xb7kP2mQ9sLr4TuV",
        "browserName": "Chrome",
        "os": "Windows",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
        "city": "London",
        "countryCode": "GB",
        "isNewDevice": true,
        "isNewLocation": true,
        "isImpossibleTravel": true,
        "user": { "uuid": "286c3231-237b-4dec-9d75-bcd8df6dc7b7", "username": "test_agent_fz8rri", "role": "agent" },
        "latitude": 51.5,
        "longitude": -0.12,
        "sessionActive": true
      },
      {
        "id": "209",
        "createdAt": "2026-11-05T09:40:11.002Z",
        "portal": "agent",
        "status": "failed",
        "blockReason": "unknown_user",
        "mfaMethod": null,
        "attemptedUsername": "ghost_user",
        "requestIp": "185.220.101.4",
        "visitorId": "Qm3nR8tW1yZa6BcD",
        "browserName": "Firefox",
        "os": "Linux",
        "userAgent": "Mozilla/5.0 (X11; Linux x86_64) ...",
        "city": "Frankfurt",
        "countryCode": "DE",
        "isNewDevice": false,
        "isNewLocation": false,
        "isImpossibleTravel": false,
        "user": null,
        "latitude": 50.11,
        "longitude": 8.68,
        "sessionActive": false
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "totalItems": 2, "totalPages": 1 }
  }
}
```

- `id` is a string (it can be bigger than a JavaScript number).
- Rows with `user: null` show `attemptedUsername` instead. Only the super admin gets these rows, and only when not filtering by `userUuid` or `role`.

### 6.2 Summary

`GET /super-admin/login-reports/summary` and `GET /admin/login-reports/summary`

Same filters as the list (`page` is ignored).

```bash
curl --location 'http://localhost:5000/api/v1/admin/login-reports/summary?from=2026-11-01' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Login summary retrieved successfully",
  "data": {
    "from": "2026-11-01T00:00:00.000Z",
    "to": "2026-11-05T09:53:30.112Z",
    "attempts": { "total": 13, "success": 2, "failed": 11, "blocked": 0 },
    "uniqueUsers": 1,
    "uniqueDevices": 2,
    "loggedInNow": { "users": 1, "devices": 2 },
    "flagged": { "newDevice": 1, "newLocation": 1, "impossibleTravel": 1 },
    "failuresByReason": [{ "reason": "wrong_password", "count": 11 }],
    "topCountries": [
      { "countryCode": "IN", "count": 1 },
      { "countryCode": "GB", "count": 1 }
    ]
  }
}
```

- `uniqueUsers`: users with at least one successful login in the range.
- `loggedInNow`: right now, **not** limited by the date range.
- `topCountries`: top 10 countries by successful logins.

### 6.3 Export CSV

`GET /super-admin/login-reports/export` and `GET /admin/login-reports/export`

Same filters as the list. Returns a file, not JSON.

```bash
curl --location 'http://localhost:5000/api/v1/super-admin/login-reports/export?from=2026-11-01' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>' \
--output login-report.csv
```

**200 OK**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="login-report-2026-11-05.csv"`

```
"Time","Username","Role","Portal","Status","Reason","MFA method","IP","Visitor ID","Browser","OS","City","Country","Latitude","Longitude","New device","New location","Impossible travel","Still logged in","User agent"
"2026-11-05T09:53:23.400Z","test_agent_fz8rri","agent","agent","success","","totp","103.21.45.10","Xb7kP2mQ9sLr4TuV","Chrome","Windows","London","GB","51.5","-0.12","true","true","true","true","Mozilla/5.0 ..."
```

In the browser, download it with `fetch` plus the `Authorization` header, then save the blob. A plain `<a href>` can't send the token. Every export is written to the activity log.

---

### 6.4 One user's report

Add `userUuid` (an admin's or agent's uuid) to 6.1, 6.2, 6.3 and 7.1. An admin only gets results for their own agents. Any other uuid returns empty results, not an error.

```bash
# History of one agent, failed attempts only, in October
curl --location 'http://localhost:5000/api/v1/super-admin/login-reports?userUuid=286c3231-237b-4dec-9d75-bcd8df6dc7b7&status=failed&from=2026-10-01&to=2026-10-31T23:59:59Z' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'

# Summary cards for that agent
curl --location 'http://localhost:5000/api/v1/super-admin/login-reports/summary?userUuid=286c3231-237b-4dec-9d75-bcd8df6dc7b7' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'

# Open alerts for that agent
curl --location 'http://localhost:5000/api/v1/super-admin/security-alerts?userUuid=286c3231-237b-4dec-9d75-bcd8df6dc7b7&resolved=false' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

The responses have the same shape as 6.1, 6.2 and 7.1, filtered to that user.

---

## 7. Security alert APIs (super admin and admin)

### Alert types

| `type` | When | `metadata` |
|---|---|---|
| `new_device` | Successful login from a device this user never used | `null` (see `loginEvent`) |
| `new_location` | Successful login from a city this user never logged in from | `null` (see `loginEvent`) |
| `impossible_travel` | Too far from the previous login for the time between them. The login is **not** blocked | `{ from, to, distanceKm, minutes }` |
| `failed_login_spike` | 10 failed attempts on one account within 15 minutes (raised once per spike) | `{ failures, windowMinutes }` |

### 7.1 List

`GET /super-admin/security-alerts` and `GET /admin/security-alerts`

| Query | Example |
|---|---|
| `page` | `1` (20 per page) |
| `userUuid` | `286c3231-...` (one admin or agent; an admin only gets results for their own agents) |
| `type` | `impossible_travel` |
| `resolved` | `false` = open only, `true` = resolved only, omit = all |

```bash
curl --location 'http://localhost:5000/api/v1/admin/security-alerts?resolved=false' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Security alerts retrieved successfully",
  "data": {
    "items": [
      {
        "id": 3,
        "type": "impossible_travel",
        "metadata": {
          "from": { "city": "Delhi", "countryCode": "IN" },
          "to": { "city": "London", "countryCode": "GB" },
          "distanceKm": 6711,
          "minutes": 10
        },
        "createdAt": "2026-11-05T09:53:23.410Z",
        "resolvedAt": null,
        "user": { "uuid": "286c3231-237b-4dec-9d75-bcd8df6dc7b7", "username": "test_agent_fz8rri", "role": "agent" },
        "resolvedBy": null,
        "loginEvent": {
          "createdAt": "2026-11-05T09:53:23.400Z",
          "requestIp": "103.21.45.10",
          "visitorId": "Xb7kP2mQ9sLr4TuV",
          "browserName": "Chrome",
          "os": "Windows",
          "city": "London",
          "countryCode": "GB",
          "latitude": 51.5,
          "longitude": -0.12
        }
      }
    ],
    "unresolvedCount": 4,
    "pagination": { "page": 1, "pageSize": 20, "totalItems": 4, "totalPages": 1 }
  }
}
```

`unresolvedCount` is the total open alerts, ignoring the `type` and `resolved` filters, so you can use it for a badge. With `userUuid`, it counts only that user's open alerts.

### 7.2 Resolve

`PATCH /super-admin/security-alerts/:id/resolve` and `PATCH /admin/security-alerts/:id/resolve`

The super admin can resolve any alert. An admin can resolve alerts about their own agents. Resolving an already resolved alert is safe and changes nothing.

```bash
curl --location --request PATCH 'http://localhost:5000/api/v1/admin/security-alerts/3/resolve' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{ "success": true, "message": "Security alert resolved successfully", "data": null }
```

**404**: not found, or not one of this admin's agents.
```json
{ "success": false, "message": "Alert not found", "error": { "code": "NOT_FOUND" } }
```

---

## 8. Profile APIs (all portals, own data)

### 8.1 Own login history

`GET /{portal}/profile/login-history` with `page`, `from`, `to`, `status`

```bash
curl --location 'http://localhost:5000/api/v1/agent/profile/login-history?page=1' \
--header 'Authorization: Bearer <AGENT_TOKEN>'
```

**200 OK**: same as 6.1, but rows have no `user` and no `attemptedUsername`.
```json
{
  "success": true,
  "message": "Login history retrieved successfully",
  "data": {
    "from": "2026-10-06T09:53:30.112Z",
    "to": "2026-11-05T09:53:30.112Z",
    "items": [
      {
        "id": "211",
        "createdAt": "2026-11-05T09:53:23.400Z",
        "portal": "agent",
        "status": "success",
        "blockReason": null,
        "mfaMethod": "totp",
        "requestIp": "103.21.45.10",
        "visitorId": "Xb7kP2mQ9sLr4TuV",
        "browserName": "Chrome",
        "os": "Windows",
        "userAgent": "Mozilla/5.0 ...",
        "city": "London",
        "countryCode": "GB",
        "isNewDevice": true,
        "isNewLocation": true,
        "isImpossibleTravel": true,
        "latitude": 51.5,
        "longitude": -0.12,
        "sessionActive": true
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 }
  }
}
```

### 8.2 Own security alerts

`GET /{portal}/profile/security-alerts` with `page`, `type`, `resolved` (no `userUuid`: it's always the user's own alerts)

```bash
curl --location 'http://localhost:5000/api/v1/agent/profile/security-alerts?resolved=false' \
--header 'Authorization: Bearer <AGENT_TOKEN>'
```

**200 OK**: same shape as 7.1.
```json
{
  "success": true,
  "message": "Security alerts retrieved successfully",
  "data": {
    "items": [
      {
        "id": 1,
        "type": "new_device",
        "metadata": null,
        "createdAt": "2026-11-05T09:53:23.410Z",
        "resolvedAt": null,
        "user": { "uuid": "286c3231-237b-4dec-9d75-bcd8df6dc7b7", "username": "test_agent_fz8rri", "role": "agent" },
        "resolvedBy": null,
        "loginEvent": {
          "createdAt": "2026-11-05T09:53:23.400Z",
          "requestIp": "103.21.45.10",
          "visitorId": "Xb7kP2mQ9sLr4TuV",
          "browserName": "Chrome",
          "os": "Windows",
          "city": "London",
          "countryCode": "GB",
          "latitude": 51.5,
          "longitude": -0.12
        }
      }
    ],
    "unresolvedCount": 1,
    "pagination": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 }
  }
}
```

Users can't resolve their own alerts. If they say "This wasn't me", tell them to change their password and log out other devices (`/profile/sessions`).

---

## 9. User lists with `activeDevices` (changed)

These existing endpoints now add `activeDevices` (devices logged in right now) to each user. Nothing else changed in them.

### 9.1 Super admin: admins list

`GET /super-admin/admins`

```bash
curl --location 'http://localhost:5000/api/v1/super-admin/admins' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Admins retrieved successfully",
  "data": [
    {
      "uuid": "678c50e3-9f6c-4eb5-9ea3-e74f751c08f5",
      "username": "devyadav00",
      "role": "admin",
      "status": "active",
      "createdAt": "2026-10-20T08:12:45.000Z",
      "firstName": null,
      "lastName": null,
      "email": null,
      "countryCode": null,
      "mobileNumber": null,
      "security": { "failedLoginAttempts": 0, "lockedAt": null },
      "activeDevices": 2
    }
  ]
}
```

### 9.2 Super admin: one admin's agents

`GET /super-admin/:uuid/agents?page=1` (`:uuid` is the admin's uuid)

```bash
curl --location 'http://localhost:5000/api/v1/super-admin/678c50e3-9f6c-4eb5-9ea3-e74f751c08f5/agents?page=1' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Agents retrieved successfully",
  "data": {
    "agents": [
      {
        "uuid": "286c3231-237b-4dec-9d75-bcd8df6dc7b7",
        "username": "test_agent_fz8rri",
        "firstName": null,
        "lastName": null,
        "email": null,
        "status": "active",
        "createdAt": "2026-11-02T11:27:20.133Z",
        "updatedAt": "2026-11-02T11:27:20.133Z",
        "activeDevices": 1
      }
    ],
    "pagination": { "page": 1, "pageSize": 10, "totalItems": 51, "totalPages": 6 }
  }
}
```

### 9.3 Admin: their agents

`GET /admin/agents?page=1`

```bash
curl --location 'http://localhost:5000/api/v1/admin/agents?page=1' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**: the list is under `items` here (under `agents` in 9.2).
```json
{
  "success": true,
  "message": "Agents retrieved successfully",
  "data": {
    "items": [
      {
        "uuid": "286c3231-237b-4dec-9d75-bcd8df6dc7b7",
        "username": "test_agent_fz8rri",
        "firstName": null,
        "lastName": null,
        "email": null,
        "status": "active",
        "createdAt": "2026-11-02T11:27:20.133Z",
        "updatedAt": "2026-11-02T11:27:20.133Z",
        "activeDevices": 1
      }
    ],
    "pagination": { "page": 1, "pageSize": 10, "totalItems": 51, "totalPages": 6 }
  }
}
```

---

## 10. Errors every endpoint can return

| Status | `error.code` | When | What to do |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | A filter or param is invalid (see section 5) | Show `details[].message` |
| 401 | `UNAUTHORIZED` | No token sent | Go to login |
| 401 | `INVALID_TOKEN` | Token expired, or the session was logged out or revoked | Refresh the token, or go to login |
| 403 | `FORBIDDEN` | Wrong portal for this token | Go to login |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Admin must change their password first (admin routes) | Open the change-password screen |
| 403 | `MFA_SETUP_REQUIRED` | MFA is required and not set up yet (super admin and admin routes) | Open the MFA setup screen (see `mfa-api.md`) |
| 404 | `NOT_FOUND` | Alert not found, or outside this admin's agents | Show "not found" |

Error format:
```json
{
  "success": false,
  "message": "Access token is required",
  "error": { "code": "UNAUTHORIZED" }
}
```

---

## 11. Frontend checklist

- Get a **new** Fingerprint `eventId` before every login and every MFA code attempt.
- Map: use `latitude` / `longitude`, and skip rows where they are `null`.
- Show `attemptedUsername` (for example "unknown: ghost_user") when `user` is `null`.
- Highlight rows where `isNewDevice`, `isNewLocation` or `isImpossibleTravel` is `true`, and add a "Flagged only" filter (`flagged=true`).
- Send `from`/`to` for anything older than 30 days. One request can cover at most 366 days.
- Export with `fetch` plus the token, then save the blob.
- Show `unresolvedCount` as a badge on "Security alerts".
- Show `activeDevices` in the admins and agents lists.
