# Agent Permissions: Grants & Locks API

This document covers how the super admin controls which agent permissions an admin can manage, and how the frontend should use these APIs.

Base URL: `http://localhost:5000/api/v1`

All requests need a bearer token from login:
- Super admin APIs: `Authorization: Bearer <SUPER_ADMIN_TOKEN>`
- Admin APIs: `Authorization: Bearer <ADMIN_TOKEN>`

---

## 1. How it works

There are three ideas:

| Idea | Set by | Meaning |
|---|---|---|
| **Value** | super admin or admin | The actual setting for a user, e.g. agent X has `auth.lockout.enabled = true` |
| **Grant** | super admin → admin | "This admin may change key K for their agents" |
| **Lock** | super admin (automatic) | "The super admin set this agent value, so the admin can't change it" |

Rules:
1. A new admin has **no grants**. They can see their agents' permissions but can't change any of them.
2. The super admin grants keys to an admin. Only these 4 keys can be granted:
   - `auth.device_limit.enabled`
   - `auth.device_limit.max_devices`
   - `auth.lockout.enabled`
   - `auth.lockout.max_attempts`
3. When the **super admin** saves a value on any user, that value becomes **locked**. The admin can't change a locked value, even if they have the grant.
4. The super admin can **unlock** a value (value stays, admin can edit it again) or **reset** it (value is removed and falls back to the default).
5. If the super admin removes a grant, values the admin already set stay as they are. The admin just can't change them anymore.

**The frontend doesn't need to work out these rules.** Every agent permission returned to the admin has an `editable` field. Disable the input when `editable` is `false`.

---

## 2. Flows

### 2.1 Super admin: give an admin control over agent permissions

```
1. GET  /super-admin/admins                       → pick an admin (use its uuid)
2. GET  /super-admin/permissions                  → labels, descriptions, min/max for every key
3. GET  /super-admin/users/:adminUuid/grants      → which keys are granted (checkboxes)
4. PUT  /super-admin/users/:adminUuid/grants      → save the checked keys (send the full list)
```

Screen idea: one checkbox per key from step 3, using the label from step 2 (match by `key`).

### 2.2 Super admin: set (and lock) an agent's permission

```
1. GET    /super-admin/:adminUuid/agents                      → pick an agent
2. GET    /super-admin/permissions                            → labels, min/max
3. GET    /super-admin/users/:agentUuid/permissions           → current values + locked
4. PUT    /super-admin/users/:agentUuid/permissions           → save; saved values become locked
5. DELETE /super-admin/users/:agentUuid/permissions/:key/lock → (optional) unlock, keep the value
6. DELETE /super-admin/users/:agentUuid/permissions/:key      → (optional) reset to default, also unlocks
```

Screen idea: show a lock icon when `locked` is `true`, with an "Unlock" button that calls step 5.

### 2.3 Admin: manage an agent's permissions

```
1. GET /admin/agents                         → pick an agent
2. GET /admin/permissions                    → labels, descriptions, min/max for every key
3. GET /admin/agents/:agentUuid/permissions  → current values + locked + editable
4. PUT /admin/agents/:agentUuid/permissions  → send only keys where editable = true
```

Screen idea:
- `editable: true` → input enabled.
- `editable: false` and `locked: true` → input disabled, show "Set by super admin".
- `editable: false` and `locked: false` → input disabled, show "Not allowed".

---

## 3. Super admin APIs

### 3.1 Get an admin's grants

`GET /super-admin/users/:uuid/grants`

Returns every key the super admin can grant, and whether this admin has it. Works only for admins.

```bash
curl --location 'http://localhost:5000/api/v1/super-admin/users/678c50e3-9f6c-4eb5-9ea3-e74f751c08f5/grants' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "User grants retrieved successfully",
  "data": [
    { "key": "auth.device_limit.enabled", "granted": false },
    { "key": "auth.device_limit.max_devices", "granted": false },
    { "key": "auth.lockout.enabled", "granted": true },
    { "key": "auth.lockout.max_attempts", "granted": false }
  ]
}
```

**404**: the uuid is not an admin (for example an agent's uuid), or doesn't exist.
```json
{
  "success": false,
  "message": "User not found",
  "error": { "code": "NOT_FOUND" }
}
```

### 3.2 Update an admin's grants

`PUT /super-admin/users/:uuid/grants`

Send the **full list** of keys that should be granted. Keys not in the list are removed. Send `[]` to remove all grants. Sending the same list twice is safe.

```bash
curl --location --request PUT 'http://localhost:5000/api/v1/super-admin/users/678c50e3-9f6c-4eb5-9ea3-e74f751c08f5/grants' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "keys": ["auth.lockout.enabled"]
}'
```

**200 OK**: returns the updated grants.
```json
{
  "success": true,
  "message": "User grants updated successfully",
  "data": [
    { "key": "auth.device_limit.enabled", "granted": false },
    { "key": "auth.device_limit.max_devices", "granted": false },
    { "key": "auth.lockout.enabled", "granted": true },
    { "key": "auth.lockout.max_attempts", "granted": false }
  ]
}
```

**400**: a key can't be granted. `field` points to the position in the array.
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "field": "keys.0", "message": "Unknown permission" }]
  }
}
```

Other 400 messages: `"Keys must be an array of permission keys"`, `"Keys must be unique"`.

### 3.3 Get a user's permission values (changed)

`GET /super-admin/users/:uuid/permissions`

Each item now has `locked`.

```bash
curl --location 'http://localhost:5000/api/v1/super-admin/users/286c3231-237b-4dec-9d75-bcd8df6dc7b7/permissions' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "User permissions retrieved successfully",
  "data": [
    { "key": "auth.device_limit.enabled", "value": false, "source": "default", "locked": false },
    { "key": "auth.device_limit.max_devices", "value": 5, "source": "default", "locked": false },
    { "key": "auth.lockout.enabled", "value": false, "source": "user", "locked": true },
    { "key": "auth.lockout.max_attempts", "value": 5, "source": "default", "locked": false }
  ]
}
```

`source`: `user` = set on this user, `role` = set for the whole role, `default` = default value.

### 3.4 Update a user's permission values (changed)

`PUT /super-admin/users/:uuid/permissions`

Same request as before. **Every value saved here becomes locked**, so the admin can't change it.

```bash
curl --location --request PUT 'http://localhost:5000/api/v1/super-admin/users/286c3231-237b-4dec-9d75-bcd8df6dc7b7/permissions' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "values": { "auth.lockout.enabled": false }
}'
```

**200 OK**: same shape as 3.3, with the saved key showing `"source": "user", "locked": true`.

### 3.5 Unlock a value

`DELETE /super-admin/users/:uuid/permissions/:key/lock`

Keeps the value and lets the admin edit it again. Calling it on a value that isn't locked is safe and changes nothing.

```bash
curl --location --request DELETE 'http://localhost:5000/api/v1/super-admin/users/286c3231-237b-4dec-9d75-bcd8df6dc7b7/permissions/auth.lockout.enabled/lock' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**: returns the user's values.
```json
{
  "success": true,
  "message": "User permission unlocked successfully",
  "data": [
    { "key": "auth.device_limit.enabled", "value": false, "source": "default", "locked": false },
    { "key": "auth.device_limit.max_devices", "value": 5, "source": "default", "locked": false },
    { "key": "auth.lockout.enabled", "value": false, "source": "user", "locked": false },
    { "key": "auth.lockout.max_attempts", "value": 5, "source": "default", "locked": false }
  ]
}
```

### 3.6 Reset a value (existing)

`DELETE /super-admin/users/:uuid/permissions/:key`

Removes the value, so it goes back to the default. This also removes the lock.

```bash
curl --location --request DELETE 'http://localhost:5000/api/v1/super-admin/users/286c3231-237b-4dec-9d75-bcd8df6dc7b7/permissions/auth.lockout.enabled' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>'
```

**200 OK**: `"message": "User permission reset successfully"`, same `data` shape as 3.3.

---

## 4. Admin APIs

### 4.1 Get an agent's permissions (changed)

`GET /admin/agents/:uuid/permissions`

Each item now has `locked` and `editable`.

```bash
curl --location 'http://localhost:5000/api/v1/admin/agents/286c3231-237b-4dec-9d75-bcd8df6dc7b7/permissions' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**: example where the admin has the `auth.lockout.enabled` grant, and the super admin locked nothing.
```json
{
  "success": true,
  "message": "Agent permissions retrieved successfully",
  "data": [
    { "key": "auth.device_limit.enabled", "value": false, "source": "default", "locked": false, "editable": false },
    { "key": "auth.device_limit.max_devices", "value": 5, "source": "default", "locked": false, "editable": false },
    { "key": "auth.lockout.enabled", "value": false, "source": "user", "locked": false, "editable": true },
    { "key": "auth.lockout.max_attempts", "value": 5, "source": "default", "locked": false, "editable": false }
  ]
}
```

`editable` is `true` only when the admin has the grant **and** the value is not locked.

### 4.2 Update an agent's permissions (changed)

`PUT /admin/agents/:uuid/permissions`

Send only keys where `editable` is `true`. If any key in the request isn't editable, **nothing is saved** and you get 403.

```bash
curl --location --request PUT 'http://localhost:5000/api/v1/admin/agents/286c3231-237b-4dec-9d75-bcd8df6dc7b7/permissions' \
--header 'Authorization: Bearer <ADMIN_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "values": { "auth.lockout.enabled": true }
}'
```

**200 OK**: same shape as 4.1, with the new value.
```json
{
  "success": true,
  "message": "Agent permissions updated successfully",
  "data": [
    { "key": "auth.device_limit.enabled", "value": false, "source": "default", "locked": false, "editable": false },
    { "key": "auth.device_limit.max_devices", "value": 5, "source": "default", "locked": false, "editable": false },
    { "key": "auth.lockout.enabled", "value": true, "source": "user", "locked": false, "editable": true },
    { "key": "auth.lockout.max_attempts", "value": 5, "source": "default", "locked": false, "editable": false }
  ]
}
```

**403**: a key isn't granted, or is locked by the super admin.
```json
{
  "success": false,
  "message": "You do not have permission to change these permissions",
  "error": { "code": "FORBIDDEN" }
}
```

**400**: a value is invalid, for example out of the min/max range.
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "field": "values.auth.lockout.max_attempts", "message": "Must be at least 3" }]
  }
}
```

**404**: the agent doesn't belong to this admin, or doesn't exist.
```json
{
  "success": false,
  "message": "Agent not found",
  "error": { "code": "NOT_FOUND" }
}
```

---

## 5. Frontend checklist

- Get labels, descriptions and min/max from `GET /super-admin/permissions` (super admin) or `GET /admin/permissions` (admin), and match them to values by `key`.
- Admin screen: use `editable` to enable or disable each input. Don't build the rule on the frontend.
- Admin screen: send only changed keys where `editable` is `true`.
- After any PUT or DELETE, use the `data` from the response to refresh the screen. No extra GET is needed.
- Grants PUT always sends the **full list** of checked keys, not just the changed ones.
- On 403 from the admin PUT, reload `GET /admin/agents/:uuid/permissions`, because the super admin may have changed a grant or lock in the meantime.
