# Authentication & Authorization API (`/api/auth` & `/auth`)

MediLink AI implements secure, stateless authentication using JSON Web Tokens (JWT) stored in HTTP-only, SameSite cookies.

---

## Endpoints

### 1. User Registration
* **Endpoint**: `POST /api/auth/register`
* **Access**: Public
* **Payload**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "securePassword123",
    "role": "patient",
    "phone": "+1234567890",
    "age": 35,
    "gender": "Female",
    "bloodGroup": "O+"
  }
  ```
* **Response** (`201 Created`):
  ```json
  {
    "message": "Registration successful",
    "user": {
      "id": "6ac8b225da7525852305db1b",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "patient"
    }
  }
  ```
* **Cookie**: Sets `carelink_auth` (HttpOnly, SameSite, Secure in prod).

---

### 2. User Login
* **Endpoint**: `POST /api/auth/login`
* **Access**: Public (Rate-limited: 20 req/15min in production)
* **Payload**:
  ```json
  {
    "email": "jane@example.com",
    "password": "securePassword123"
  }
  ```
* **Response** (`200 OK`):
  ```json
  {
    "message": "Login successful",
    "user": {
      "id": "6ac8b225da7525852305db1b",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "patient"
    }
  }
  ```
* **Note**: JWT token is **never** sent in response JSON body to prevent XSS leakage. It is transmitted solely via the `carelink_auth` HttpOnly cookie.

---

### 3. Get Current User Profile
* **Endpoint**: `GET /api/auth/me`
* **Access**: Authenticated (`carelink_auth` cookie or `Bearer <token>`)
* **Response** (`200 OK`):
  ```json
  {
    "id": "6ac8b225da7525852305db1b",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "patient"
  }
  ```

---

### 4. User Logout
* **Endpoint**: `POST /api/auth/logout`
* **Access**: Authenticated
* **Response** (`200 OK`):
  ```json
  {
    "message": "Logged out successfully"
  }
  ```
* **Action**: Clears `carelink_auth` cookie on `/`.

---

### 5. Google OAuth 2.0 Flow
* **Initiation**: `GET /auth/google` (Redirects to Google OAuth consent screen)
* **Callback**: `GET /auth/google/callback` (Validates code, sets `carelink_auth` cookie, redirects to role-appropriate portal without exposing token in query params).
