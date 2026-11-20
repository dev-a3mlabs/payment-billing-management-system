# Account Change Requests & Notifications API

This document covers how users change their username, email or mobile number through an approval request, and the notifications (with live updates) that go with it.

Base URL: `http://localhost:5000/api/v1`

All requests need a bearer token from login:
- Super admin APIs: `Authorization: Bearer <SUPER_ADMIN_TOKEN>`
- Admin APIs: `Authorization: Bearer <ADMIN_TOKEN>`
- Agent APIs: `Authorization: Bearer <AGENT_TOKEN>`

---

## 0. What changed

| # | Endpoint | Who | Change |
|---|---|---|---|
| 1 | `PATCH /{portal}/profile` | Everyone | **Changed.** Only `firstName` and `lastName` now. Sending `email`, `countryCode` or `mobileNumber` returns 400 |
| 2 | `POST /{portal}/profile/change-requests` | Admin, agent | **New.** Ask to change username, email or mobile |
| 3 | `GET /{portal}/profile/change-requests` | Admin, agent | **New.** Own requests |
| 4 | `DELETE /{portal}/profile/change-requests/:uuid` | Admin, agent | **New.** Cancel own pending request |
| 5 | `GET /{portal}/change-requests` | Super admin, admin | **New.** Requests to review |
| 6 | `GET /{portal}/change-requests/:uuid` | Super admin, admin | **New.** One request |
| 7 | `POST /{portal}/change-requests/:uuid/approve` | Super admin, admin | **New.** Approve |
| 8 | `POST /{portal}/change-requests/:uuid/reject` | Super admin, admin | **New.** Reject with a reason |
| 9 | `PATCH /super-admin/profile/account` | Super admin | **New.** Change own username, email or mobile |
| 10 | `GET /{portal}/notifications` | Everyone | **New.** Notifications list and unread count |
| 11 | `PATCH /{portal}/notifications/:id/read` | Everyone | **New.** Mark one as read |
| 12 | `PATCH /{portal}/notifications/read-all` | Everyone | **New.** Mark all as read |
| 13 | `GET /{portal}/notifications/stream` | Everyone | **New.** Live notifications (Server-Sent Events) |
| 14 | `GET /{portal}/security-alerts` | Super admin, admin | **Changed.** New alert type `account_changed` |

`{portal}` is `super-admin`, `admin` or `agent`.

---

## 1. Rules

| Who | Changes username, email or mobile by | Decided by |
|---|---|---|
| Agent | A change request | Their own admin. The super admin can only **view** it, unless the agent's admin is suspended or inactive; then the super admin decides |
| Admin | A change request | Super admin |
| Super admin | `PATCH /super-admin/profile/account` | No one; the change is logged |

First and last name stay self-service for everyone (`PATCH /{portal}/profile`).

Limits:
- One **pending** request per field per user.
- At most **5 requests per user in 24 hours** (cancelled and rejected ones count too).
- A request **expires after 7 days** if no one decides it. Its status then shows as `expired`.

No password or MFA code is asked for sending, approving, rejecting or cancelling a request, or for the super admin's own change. A valid login session is enough.

When a request is **approved**:
1. The change is applied.
2. The user is **logged out of all devices**. They log in again, with the new username if that changed.
3. A security alert of type `account_changed` is created for the user.
4. The user gets a notification.
5. Everything is saved in the activity log.

When the **super admin** changes their own account, the same happens, except the device they used **stays logged in**.

### 1.1 Fields and values

`field` is one of these. `oldValue` and `newValue` always use the same keys as the user's profile.

| `field` | `newValue` | Rules |
|---|---|---|
| `email` | `{ "email": "new@example.com" }` | Valid email, max 191 characters, saved in lowercase |
| `mobile` | `{ "countryCode": "+91", "mobileNumber": "9876543210" }` | Country code like `+91`; number 6 to 15 digits |
| `username` | `{ "username": "new_name" }` | Same rules as creating a user: 3 to 30 characters, starts with a lowercase letter, only `a-z 0-9 _ .`, can't end with a dot |

### 1.2 Status

| `status` | Meaning |
|---|---|
| `pending` | Waiting for a decision |
| `approved` | Approved and applied |
| `rejected` | Rejected; see `rejectReason` |
| `cancelled` | Cancelled by the user |
| `expired` | Nobody decided within 7 days |

---

## 2. Requester APIs (admin and agent)

### 2.1 Send a change request

`POST /{portal}/profile/change-requests`

| Body | Required | Notes |
|---|---|---|
| `field` | Yes | `email`, `mobile` or `username` |
| `newValue` | Yes | See 1.1. No other keys allowed |

```bash
curl --location 'http://localhost:5000/api/v1/agent/profile/change-requests' \
--header 'Authorization: Bearer <AGENT_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "field": "mobile",
  "newValue": { "countryCode": "+91", "mobileNumber": "9876543210" }
}'
```

**201 Created**
```json
{
  "success": true,
  "message": "Change request sent successfully",
  "data": {
    "uuid": "5f0c6a2e-8d1b-4c3a-9e7f-2a1b3c4d5e6f",
    "field": "mobile",
    "oldValue": { "countryCode": "+91", "mobileNumber": "9123456780" },
    "newValue": { "countryCode": "+91", "mobileNumber": "9876543210" },
    "status": "pending",
    "rejectReason": null,
    "expiresAt": "2026-11-26T10:00:00.000Z",
    "decidedAt": null,
    "createdAt": "2026-11-19T10:00:00.000Z",
    "decidedBy": null,
    "user": { "uuid": "a4b1c2d3-e5f6-4789-abcd-ef0123456789", "username": "agent01", "role": "agent" }
  }
}
```

Errors:

| Status | `error.code` | `message` |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `Validation failed` (see `details`) |
| 400 | `BAD_REQUEST` | `New value must be different from the current one` |
| 409 | `CONFLICT` | `You already have a pending request for this field` |
| 409 | `USERNAME_TAKEN` | `Username already taken` |
| 409 | `EMAIL_TAKEN` | `Email already in use` |
| 409 | `MOBILE_TAKEN` | `Mobile number already in use` |
| 429 | `TOO_MANY_REQUESTS` | `You have reached the daily limit of change requests. Please try again later.` |

Example **400**:
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "field": "newValue.mobileNumber", "message": "Mobile number must be 6 to 15 digits" }]
  }
}
```

### 2.2 List own requests

`GET /{portal}/profile/change-requests?page=1&status=pending`

| Query | Required | Notes |
|---|---|---|
| `page` | No | Default 1, 20 per page |
| `status` | No | `pending`, `approved`, `rejected`, `cancelled` or `expired` |

```bash
curl --location 'http://localhost:5000/api/v1/agent/profile/change-requests?page=1' \
--header 'Authorization: Bearer <AGENT_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Change requests retrieved successfully",
  "data": {
    "items": [
      {
        "uuid": "5f0c6a2e-8d1b-4c3a-9e7f-2a1b3c4d5e6f",
        "field": "mobile",
        "oldValue": { "countryCode": "+91", "mobileNumber": "9123456780" },
        "newValue": { "countryCode": "+91", "mobileNumber": "9876543210" },
        "status": "rejected",
        "rejectReason": "Please call me to confirm this number first.",
        "expiresAt": "2026-11-26T10:00:00.000Z",
        "decidedAt": "2026-11-19T11:30:00.000Z",
        "createdAt": "2026-11-19T10:00:00.000Z",
        "decidedBy": { "username": "admin01" },
        "user": { "uuid": "a4b1c2d3-e5f6-4789-abcd-ef0123456789", "username": "agent01", "role": "agent" }
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 }
  }
}
```

### 2.3 Cancel own request

`DELETE /{portal}/profile/change-requests/:uuid`

```bash
curl --location --request DELETE 'http://localhost:5000/api/v1/agent/profile/change-requests/5f0c6a2e-8d1b-4c3a-9e7f-2a1b3c4d5e6f' \
--header 'Authorization: Bearer <AGENT_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Change request cancelled successfully",
  "data": null
}
```

| Status | `error.code` | `message` |
|---|---|---|
| 404 | `NOT_FOUND` | `Change request not found` |
| 409 | `CONFLICT` | `This request is no longer pending` |

---

## 3. Reviewer APIs (super admin and admin)

What each reviewer sees:
- **Admin:** only their own agents' requests.
- **Super admin:** every admin's and agent's request.

Each item has `canDecide`. Show **Approve** and **Reject** only when it's `true`. For the super admin, an agent's request has `canDecide: false` unless that agent's admin is suspended or inactive.

### 3.1 List requests

`GET /{portal}/change-requests?page=1&status=pending`

Same `page` and `status` query as 2.2.

```bash
curl --location 'http://localhost:5000/api/v1/admin/change-requests?status=pending' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Change requests retrieved successfully",
  "data": {
    "items": [
      {
        "uuid": "5f0c6a2e-8d1b-4c3a-9e7f-2a1b3c4d5e6f",
        "field": "email",
        "oldValue": { "email": null },
        "newValue": { "email": "agent01@example.com" },
        "status": "pending",
        "rejectReason": null,
        "expiresAt": "2026-11-26T10:00:00.000Z",
        "decidedAt": null,
        "createdAt": "2026-11-19T10:00:00.000Z",
        "decidedBy": null,
        "user": { "uuid": "a4b1c2d3-e5f6-4789-abcd-ef0123456789", "username": "agent01", "role": "agent" },
        "canDecide": true
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 }
  }
}
```

Tip: `pagination.totalItems` of `?status=pending` is the number to show on a "Pending requests" badge.

### 3.2 Get one request

`GET /{portal}/change-requests/:uuid`

```bash
curl --location 'http://localhost:5000/api/v1/admin/change-requests/5f0c6a2e-8d1b-4c3a-9e7f-2a1b3c4d5e6f' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**: `data` is one item, same shape as in 3.1.

**404**: `Change request not found` (doesn't exist, or isn't one of this admin's agents).

### 3.3 Approve

`POST /{portal}/change-requests/:uuid/approve`

No body.

```bash
curl --location 'http://localhost:5000/api/v1/admin/change-requests/5f0c6a2e-8d1b-4c3a-9e7f-2a1b3c4d5e6f/approve' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Change request approved successfully",
  "data": null
}
```

The user is now logged out of all their devices.

| Status | `error.code` | `message` |
|---|---|---|
| 403 | `FORBIDDEN` | `You can only view this request` |
| 404 | `NOT_FOUND` | `Change request not found` |
| 409 | `CONFLICT` | `This request is no longer pending` |
| 409 | `CONFLICT` | `This request can no longer be approved` (the user is no longer active) |
| 409 | `USERNAME_TAKEN` / `EMAIL_TAKEN` / `MOBILE_TAKEN` | The value was taken by someone else after the request was sent |
| 409 | `CONFLICT` | `Username, email or mobile number already in use` |

If the value was taken, reject the request with a reason so the user can send a new one.

### 3.4 Reject

`POST /{portal}/change-requests/:uuid/reject`

| Body | Required | Notes |
|---|---|---|
| `reason` | Yes | 1 to 500 characters. The user sees it |

```bash
curl --location 'http://localhost:5000/api/v1/admin/change-requests/5f0c6a2e-8d1b-4c3a-9e7f-2a1b3c4d5e6f/reject' \
--header 'Authorization: Bearer <ADMIN_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "reason": "Please call me to confirm this number first."
}'
```

**200 OK**
```json
{
  "success": true,
  "message": "Change request rejected successfully",
  "data": null
}
```

| Status | `error.code` | `message` |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `Reason is required` / `Reason must be at most 500 characters` |
| 403 | `FORBIDDEN` | `You can only view this request` |
| 404 | `NOT_FOUND` | `Change request not found` |
| 409 | `CONFLICT` | `This request is no longer pending` |

---

## 4. Super admin: change own account

`PATCH /super-admin/profile/account`

| Body | Required | Notes |
|---|---|---|
| `username` | One of these | Same rules as 1.1 |
| `email` | One of these | |
| `countryCode` + `mobileNumber` | One of these | Must be sent together |

Fields equal to the current value are ignored. If nothing changes, it returns 400.

```bash
curl --location --request PATCH 'http://localhost:5000/api/v1/super-admin/profile/account' \
--header 'Authorization: Bearer <SUPER_ADMIN_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "email": "owner@example.com"
}'
```

**200 OK**
```json
{
  "success": true,
  "message": "Account updated successfully. Your other devices have been logged out.",
  "data": null
}
```

| Status | `error.code` | `message` |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `At least one field is required`, `Country code and mobile number must be sent together`, … |
| 400 | `BAD_REQUEST` | `New value must be different from the current one` |
| 409 | `USERNAME_TAKEN` / `EMAIL_TAKEN` / `MOBILE_TAKEN` | Value already used by someone else |

---

## 5. Profile update (changed)

`PATCH /{portal}/profile` now accepts **only** `firstName` and `lastName`.

```bash
curl --location --request PATCH 'http://localhost:5000/api/v1/agent/profile' \
--header 'Authorization: Bearer <AGENT_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
  "firstName": "Dev",
  "lastName": "Yadav"
}'
```

**200 OK**: same response as before.

Sending `email`, `countryCode` or `mobileNumber`:
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "message": "Unrecognized key: \"email\"" }]
  }
}
```

---

## 6. Notifications

### 6.1 Types

| `type` | Who gets it | `entityId` | `metadata` |
|---|---|---|---|
| `change_request.created` | The reviewer (the agent's admin, or the super admin) | Request `uuid` | `{ "username": "agent01", "field": "email" }` |
| `change_request.cancelled` | The reviewer | Request `uuid` | `{ "username": "agent01", "field": "email" }` |
| `change_request.approved` | The requester | Request `uuid` | `{ "field": "email" }` |
| `change_request.rejected` | The requester | Request `uuid` | `{ "field": "email" }` |

Notifications never contain the new email, mobile or username. Load the request with its API to see details.

### 6.2 List

`GET /{portal}/notifications?page=1` returns 20 per page, newest first.

```bash
curl --location 'http://localhost:5000/api/v1/admin/notifications?page=1' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": {
    "items": [
      {
        "id": 42,
        "type": "change_request.created",
        "entityId": "5f0c6a2e-8d1b-4c3a-9e7f-2a1b3c4d5e6f",
        "metadata": { "username": "agent01", "field": "email" },
        "readAt": null,
        "createdAt": "2026-11-19T10:00:00.000Z"
      }
    ],
    "unreadCount": 1,
    "pagination": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 }
  }
}
```

### 6.3 Mark one as read

`PATCH /{portal}/notifications/:id/read`

```bash
curl --location --request PATCH 'http://localhost:5000/api/v1/admin/notifications/42/read' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": null
}
```

**404**: `Notification not found`. Calling it on an already read notification is safe.

### 6.4 Mark all as read

`PATCH /{portal}/notifications/read-all`

```bash
curl --location --request PATCH 'http://localhost:5000/api/v1/admin/notifications/read-all' \
--header 'Authorization: Bearer <ADMIN_TOKEN>'
```

**200 OK**
```json
{
  "success": true,
  "message": "All notifications marked as read",
  "data": null
}
```

### 6.5 Live stream (Server-Sent Events)

`GET /{portal}/notifications/stream`

The response stays open and sends each new notification the moment it's saved.

```bash
curl --no-buffer --location 'http://localhost:5000/api/v1/admin/notifications/stream' \
--header 'Authorization: Bearer <ADMIN_TOKEN>' \
--header 'Accept: text/event-stream'
```

**200 OK**, `Content-Type: text/event-stream`:
```
retry: 5000

id: 42
event: notification
data: {"id":42,"type":"change_request.created","entityId":"5f0c6a2e-8d1b-4c3a-9e7f-2a1b3c4d5e6f","metadata":{"username":"agent01","field":"email"},"readAt":null,"createdAt":"2026-11-19T10:00:00.000Z"}

: keep-alive

```

| Line | Meaning |
|---|---|
| `event: notification` | A new notification. `data` is the same object as in 6.2 |
| `id: 42` | The notification id. Send it back as the `Last-Event-ID` header when reconnecting to get anything missed (up to 100) |
| `: keep-alive` | Sent every 25 seconds so proxies don't close the connection. Ignore it |
| `retry: 5000` | Wait 5 seconds before reconnecting |

How the stream behaves:
- The token goes in the `Authorization` header, **never in the URL**.
- The server checks the session every 60 seconds. If the session was logged out, timed out or the user deactivated, the server **closes the stream**. Reconnecting then gets a 401.
- Having the stream open **doesn't count as activity**. The 15-minute idle timeout still applies.
- At most **5 open streams per user**. One more returns **429** `TOO_MANY_REQUESTS` (`Too many open connections`).
- Missed notifications are sent again on reconnect (when `Last-Event-ID` is sent), so the same `id` can arrive twice. Ignore ids you already have.

Server setup notes:
- Behind nginx, the backend already sends `X-Accel-Buffering: no`. Make sure `proxy_read_timeout` is above 25 seconds.
- Live events reach streams on the **same server process**. If you run more than one process, add Redis pub/sub first.

---

## 7. Security alert (changed)

`GET /{portal}/security-alerts` and `/{portal}/profile/security-alerts` can now return `type: "account_changed"`:

```json
{
  "id": 77,
  "type": "account_changed",
  "metadata": { "fields": ["email"] },
  "createdAt": "2026-11-19T11:30:00.000Z",
  "resolvedAt": null,
  "user": { "uuid": "a4b1c2d3-e5f6-4789-abcd-ef0123456789", "username": "agent01", "role": "agent" },
  "resolvedBy": null,
  "loginEvent": null
}
```

`metadata.fields` uses the same names as `field`: `email`, `mobile`, `username`. `type=account_changed` also works as a filter.

---

## 8. Errors every endpoint can return

| Status | `error.code` | When | What to do |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad input | Show `details[].message` |
| 401 | `TOKEN_EXPIRED` | Access token expired | Refresh and retry (see `frontend-session-handling.md`) |
| 401 | `INVALID_TOKEN` / `UNAUTHORIZED` | Session ended or no token | Go to login |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Must change password first | Open the change-password screen |
| 403 | `MFA_SETUP_REQUIRED` | MFA required but not set up | Open the MFA setup screen |
| 403 | `FORBIDDEN` | Not allowed | Show the message. **Don't** log out |
| 404 | `NOT_FOUND` | Not found or not yours | Show "not found" |
| 409 | various | Conflict (see each endpoint) | Show the message |
| 429 | `TOO_MANY_REQUESTS` | Daily request limit, or too many open streams | Show the message. **Don't** log out |
