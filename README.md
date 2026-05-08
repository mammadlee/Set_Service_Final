# HireApp API — M2Tech

Backend API for HireApp MVP · SET Service MMC · Müqavilə №26/002

## Tech Stack

- **Runtime:** Node.js 22 + TypeScript
- **Framework:** Express 4
- **Database:** PostgreSQL 15 + Prisma ORM
- **Auth:** JWT (access 15dəq + refresh 30gün) + OTP (SMS)
- **Push:** Firebase Cloud Messaging (FCM) — iOS + Android
- **QR:** HMAC-SHA256, stateless, 30 saniyəlik token
- **Monitoring:** Sentry
- **Docs:** Swagger UI → `/docs`

---

## Quick Start

### 1. Tələblər

- Node.js 18+
- PostgreSQL 15+
- (optional) Firebase project (push üçün)

### 2. Quraşdırma

```bash
git clone https://github.com/m2tech/hireapp-api
cd hireapp-api
npm install
npx prisma generate
```

### 3. Environment

```bash
cp .env.example .env
# .env faylını doldurun (aşağıya bax)
```

`.env` minimum tələblər:
```env
DATABASE_URL="postgresql://USER:PASS@localhost:5432/hireapp"
JWT_SECRET="minimum-32-simvol-random-string"
QR_HMAC_SECRET="minimum-32-simvol-baska-string"
```

### 4. Database

```bash
npx prisma migrate dev --name init   # cədvəllər yaranır
npx prisma studio                    # browser-da data gör
```

### 5. Server

```bash
npm run dev     # development (nodemon + ts-node)
npm run build   # TypeScript compile
npm start       # production (dist/)
```

---

## API Endpoints

Tam sənədləşmə: **`/docs`** (Swagger UI)

### Auth
| Method | Path | Rol | Təsvir |
|--------|------|-----|--------|
| POST | `/v1/auth/register` | — | Qeydiyyat + OTP göndər |
| POST | `/v1/auth/verify-otp` | — | OTP doğrula → token al |
| POST | `/v1/auth/refresh` | — | Access token yenilə |
| POST | `/v1/auth/logout` | auth | Çıxış |
| PATCH | `/v1/auth/fcm-token` | auth | Push token yenilə |

### Companies
| Method | Path | Rol | Təsvir |
|--------|------|-----|--------|
| GET | `/v1/companies/me` | company | Öz profili |
| PATCH | `/v1/companies/me` | company | Profil yenilə |
| GET | `/v1/admin/companies` | super_admin | Bütün şirkətlər |
| PATCH | `/v1/admin/companies/:id/approve` | super_admin | Təsdiqlə / rədd et |

### Workers
| Method | Path | Rol | Təsvir |
|--------|------|-----|--------|
| GET | `/v1/workers/me` | worker | Öz profili |
| PATCH | `/v1/workers/me` | worker | Skills + availability yenilə |
| GET | `/v1/admin/workers` | super_admin | Siyahı (skills filtr) |

### Orders
| Method | Path | Rol | Təsvir |
|--------|------|-----|--------|
| GET | `/v1/orders` | company, admin | Sifariş siyahısı |
| POST | `/v1/orders` | company | Yeni sifariş |
| GET | `/v1/orders/:id` | company, admin | Detal |
| PATCH | `/v1/orders/:id` | company, admin | Ləğv et |
| POST | `/v1/orders/:id/assign` | super_admin | İşçi təyin et |

### Assignments
| Method | Path | Rol | Təsvir |
|--------|------|-----|--------|
| GET | `/v1/assignments/me` | worker | Öz tapşırıqları |
| PATCH | `/v1/assignments/:id/status` | worker | Qəbul / rədd |

### Attendance (QR)
| Method | Path | Rol | Təsvir |
|--------|------|-----|--------|
| GET | `/v1/attendance/qr-token` | company | Planşet QR token (30s) |
| POST | `/v1/attendance/checkin` | worker | QR ilə giriş |
| POST | `/v1/attendance/checkout` | worker | QR ilə çıxış |

### Ratings
| Method | Path | Rol | Təsvir |
|--------|------|-----|--------|
| POST | `/v1/ratings` | company, admin | İşçi qiymətləndir |
| GET | `/v1/ratings/worker/:id` | auth | İşçinin reytinq tarixçəsi |

---

## Test — OTP

Development mühitdə OTP həmişə **`123456`** — SMS göndərilmir.

```bash
# Qeydiyyat
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"+994501234567","role":"worker","name":"Test İşçi"}'

# OTP doğrula
curl -X POST http://localhost:3000/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+994501234567","otp_code":"123456"}'
```

---

## Sentry

`SENTRY_DSN` boş olarsa Sentry disabled olur — dev mühitdə crash etmir.

Production üçün [sentry.io](https://sentry.io)-da layihə yaradıb DSN əlavə edin.

---

## Arxitektura Qərarları

- **Modulyar monolith** — `auth`, `companies`, `workers`, `orders`, `assignments`, `attendance`, `ratings`
- **JWT + Refresh Token Rotation** — logout-da token silinir (blacklist deyil, delete)
- **QR HMAC stateless** — DB hit yoxdur, 30s window, timing-safe comparison
- **FCM fan-out** — push bildirişlər `Promise.allSettled` ilə paralel göndərilir, xəta crash etmir
- **Zod** — bütün request body-lər validate olunur, xəta mesajları Azərbaycan dilindədir
- **JSONB skills** — Worker bacarıqları sxema dəyişmədən genişləndirilə bilər

---

## Branch Strategy

```
main          → production
develop       → development
feature/xxx   → yeni funksionallıq
fix/xxx       → bug fix
```

PR qaydasıyla `develop`-a merge, release-də `main`-ə.

---

## Növbəti Addımlar (2-ci həftə)

- [ ] SMS provider inteqrasiyası (`src/modules/auth/auth.service.ts` → `sendSms()`)
- [ ] S3 file upload endpoint (şirkət sənədləri)
- [ ] `Order.status` → `completed` keçidi (cron və ya manual admin action)
- [ ] Firebase credentials əlavə et → push test et
- [ ] TestFlight ilk build
