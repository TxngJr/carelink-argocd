# CareLink — Single Next.js Prototype

CareLink is a graduation-project prototype for appointment, patient-flow, queue, and patient-journey management. The repository has been consolidated into **one full-stack Next.js application**. The previous Go backend, Vite staff frontend, and Expo patient application are no longer separate deployable applications.

## Architecture

- **Next.js App Router + TypeScript** — staff UI, patient mobile-first Web App, and API Route Handlers in one project.
- **MongoDB** — retains the existing CareLink collections and snake_case document fields so existing prototype data remains compatible.
- **HttpOnly cookie session** — browser authentication, while API handlers still accept the legacy Bearer JWT format.
- **Role isolation** — `nurse`, `doctor`, and `patient` are checked server-side before page/API access.
- **Single Docker image** — `ghcr.io/txngjr/carelink-argocd:<sha>`.

## Portals

| Portal | URL | Purpose |
|---|---|---|
| Staff | `/login/nurse` | Nurse + doctor login; role redirects to the correct workspace |
| Patient | `/login/patient` | Patient login |
| Patient registration | `/register/patient` | Create patient account |
| Nurse | `/nurse` | Appointment proposal, arrival/check-in, non-PC queues |
| Doctor | `/doctor` | Appointment confirmation, PC queues, post-consult route |
| Patient app | `/patient` | Appointment request, queue journey, notifications, profile |

Prototype staff accounts are seeded on first database connection:

- `nurse` / `password123`
- `doctor` / `password123`

Patients register with phone number + password. Existing users are not overwritten by the seed.

## Preserved core workflow

1. Patient registers/logs in and submits a chief complaint plus optional measurements.
2. Nurse reviews the request and proposes an appointment time.
3. Doctor confirms the time and assigns `PC`, `PC2`, `PC3`, or `PC4`.
4. On the appointment day, the patient reports arrival.
5. Nurse confirms check-in; CareLink creates an active encounter and the first `NPR-###` queue.
6. Default route: `NPR → EV → VM → MHT → PCx`.
7. Doctor defines the post-PC route. It must finish at `DH`, or `HA → IPW`.
8. Queue actions remain: call, start, recall, skip/no-show, requeue, complete-and-advance.
9. Patient sees current queue, queue ahead, estimated wait, next station, route timeline, and notifications.

## Local run

### Docker (recommended)

```bash
docker compose up --build
```

Open `http://localhost:3000`.

### Node

Use Node 22 (minimum supported by this repository is Node 20.9):

```bash
npm install
cp .env.example .env.local
npm run dev
```

When running Mongo through `docker compose`, use the host URI from `.env.example`.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

`GET /health` checks the Next.js service and Mongo connection.

## Deployment

`deploy/k8s` now deploys only:

- one CareLink Next.js `Deployment` + `Service`
- MongoDB `StatefulSet`
- prototype `Secret`

The checked-in `secret.yaml` intentionally contains demo values because this repository is a classroom prototype. Do not copy that practice to a real healthcare production system.

Argo CD continues to sync `deploy/k8s` from `main`. GitHub Actions builds one immutable image and updates the Kustomize tag.

## Important prototype note

This is an educational prototype, not a production medical device or a hospital information system. Do not use real patient-identifiable or clinical data without a proper security/privacy review, access logging, backup strategy, secrets management, and compliance controls.
