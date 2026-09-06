# CareLink — Staff Portal & Infusion Lounge

CareLink เป็น educational prototype สำหรับจัดการนัดหมาย patient flow คิว และเส้นทางรับบริการ โดยรวม Staff Portal, Patient Portal, TV และ Kiosk ไว้ใน Next.js application เดียว

> ระบบนี้ไม่ใช่ medical device และ Template Infusion ที่ให้มาเป็นข้อมูลสาธิตเท่านั้น หน่วยงานต้องกำหนดและทบทวน clinical protocol จริงก่อนใช้งาน
>
> Public Sandbox ใช้ข้อมูลสังเคราะห์ร่วมกัน ผู้ทดสอบหลายคนอาจใช้บัญชีเดียวกัน และข้อมูลสาธิตจะคงอยู่จนกว่าผู้ดูแล cluster จะสั่งรีเซ็ต

## Architecture

- Next.js App Router + TypeScript สำหรับ UI และ API Route Handlers
- MongoDB replica set สำหรับข้อมูล workflow, optimistic state transition และ unique active-session constraints
- HttpOnly cookie session พร้อมรองรับ legacy Bearer JWT
- Server-Sent Events (SSE) สำหรับสถานะคิว เก้าอี้ readiness และ session แบบ realtime
- Staff UI ภาษาไทยด้วย Noto Sans Thai, ตัวเลขด้วย IBM Plex Mono และ Lucide icons
- Docker image เดียว: `ghcr.io/txngjr/carelink-argocd-web:<sha>`

## Staff workspaces และสิทธิ์ตามบทบาท

Navbar, route guard, station queue และ API guard ใช้หลัก least privilege: แต่ละบทบาทเห็นและดำเนินการเฉพาะ workspace ที่รับผิดชอบ ส่วน Admin ใช้ได้ทุก staff workspace

| บทบาท | Workspace ที่ใช้ | URL หลัก |
|---|---|---|
| Admin | ทุก staff workspace | `/operations` |
| Manager | ภาพรวม, ตารางเวลา, ผู้ป่วยในระบบ, Insights, แผนผัง | `/operations` |
| Operations | ภาพรวม, ตารางเวลา, ผู้ป่วยในระบบ, Insights, แผนผัง | `/operations` |
| Nurse | นัดหมาย/เช็กอิน และซักประวัติ/คัดกรอง | `/appointments`, `/intake` |
| Registration | ลงทะเบียนและตรวจสิทธิ NPR/EV | `/registration` |
| Vitals staff | วัดสัญญาณชีพ VM | `/vitals` |
| Doctor / Physician | ยืนยันนัดและห้องตรวจ PC1–PC4 | `/physician/appointments`, `/physician` |
| Lab staff | LAB/LABC | `/lab` |
| Pharmacy staff | PD | `/pharmacy` |
| Infusion staff | INFUSION | `/infusion` |

`/appointments` เป็น workspace ของพยาบาลเท่านั้น ส่วนแพทย์ยืนยันนัดที่ `/physician/appointments` และตรวจผู้ป่วยที่ `/physician` เพื่อไม่ให้ workflow ของ Nurse/Doctor ปะปนกันในหน้าเดียว

`/nurse` และ `/doctor` redirect ไป workspace หลักของบทบาท ส่วน `/chemo` redirect ไป `/infusion` เพื่อรองรับ bookmark เดิม TV และ Kiosk ยังคงเป็น public routes แต่ไม่แสดงใน Navbar ของเจ้าหน้าที่

เส้นทางใหม่ที่แพทย์สร้างได้ใน public demo จำกัดไว้ที่ Station ที่มี operator workspace ครบวงจร ได้แก่ `LAB`, `LABC`, `INFUSION` และ `PD` ก่อนจบที่ `DH` เพื่อป้องกัน journey ค้างที่จุดอ้างอิงบนแผนผังซึ่งยังไม่มีหน้าปฏิบัติงาน ส่วน `DH` และ tail `HA → IPW` เป็น terminal semantics ที่ระบบปิดอัตโนมัติหลัง Station สุดท้ายที่มีเจ้าหน้าที่ทำงานเสร็จ จึงไม่ต้องมีเจ้าหน้าที่มาปิดคิว terminal แยก

## Infusion Lounge

- เก้าอี้เริ่มต้น 8 ตัว จำกัดรวม 100 ตัวโดยค่าเริ่มต้น (ปรับด้วย `INFUSION_MAX_CHAIRS`) และ soft-deactivate เพื่อรักษาประวัติ
- Infusion staff ใช้งานภาพรวม คิว ประวัติ และ session; การตั้งค่า resource/template จำกัดไว้ที่ Admin
- Doctor สร้าง Infusion order พร้อม Template, planned time และ duration override ได้ ระบบเติม `INFUSION` ใน route โดยไม่สร้างซ้ำ แต่แพทย์ไม่มีสิทธิ์ควบคุมเก้าอี้หรือ session ใน Infusion Lounge
- readiness ใช้ active order, lab verified และ medication ready ตาม Template
- คง FIFO ของคิวที่ยังไม่พร้อม และเสนอคิวพร้อมลำดับถัดไปพร้อม audit reason
- call จะจองเก้าอี้ทันที; countdown เริ่มเมื่อรับตัวและเริ่ม phase
- รองรับ pause/resume, ปรับเวลา, จบก่อนเวลา, recall และ No-show พร้อมเหตุผลและ audit trail
- แต่ละ phase หยุดที่ `00:00` และต้องยืนยันก่อนเริ่มขั้นถัดไป; phase สุดท้ายไม่ปล่อยเก้าอี้อัตโนมัติ
- Server timestamp เป็น source of truth และ client ชดเชย clock drift หลัง refresh/reconnect

Template สาธิต:

- น้ำเกลือทั่วไป: เตรียม 5 นาที, ให้สารน้ำ 60 นาที, สังเกต 10 นาที
- ยาทางหลอดเลือด: เตรียม 10 นาที, ให้ยา 60 นาที, สังเกต 15 นาที
- เคมีบำบัด: Pre-med 30 นาที, ให้ยา 120 นาที, สังเกต 30 นาที

## Accounts

ฐานข้อมูลว่างจะสร้างบัญชีสาธิต **40 บัญชี (10 บทบาท บทบาทละ 4 บัญชี)** พร้อม one-click login บนหน้าเจ้าหน้าที่ รหัสผ่านสำหรับทดสอบคือ `password123` รายการจริงมาจาก `lib/development-accounts.ts` จึงไม่ต้องดูแลรายชื่อซ้ำใน UI หรือ README

บทบาทที่มีบัญชีทดสอบ ได้แก่ Admin, Manager, Operations, Registration, Nurse, Vitals staff, Doctor, Lab staff, Pharmacy staff และ Infusion staff

Role `chemo_staff` เดิมถูก migrate เป็น `infusion_staff` และ legacy session cookie จะถูก normalize ระหว่างเปลี่ยนผ่าน ส่วน `rt_staff` จะถูก deactivate

## Migration and data preservation

Migration `2026-08-infusion-lounge-v1` ทำงานแบบ idempotent เมื่อเริ่ม application:

- แปลง role, station, encounter route, queue และ `chemo_sessions` ไป schema Infusion ใหม่
- เก็บ legacy identifiers และไม่ลบ collection ต้นทาง `chemo_sessions`
- mark ขั้นตอนฉายแสงเดิมเป็น `skipped` พร้อม migration reason
- ไม่ลบหรือเปิด write API ให้ `radiation_sessions`
- หยุดพร้อม error เมื่อพบ active chair/session หรือ encounter conflict แทนการเขียนทับ

ควรสำรอง MongoDB ก่อน deploy migration ไปยัง environment ที่มีข้อมูลจริง

## Local run

```bash
JWT_SECRET="$(openssl rand -base64 48)" docker compose up --build
```

เปิด `http://localhost:3000` หรือรันแบบ Node:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

ระบบใช้ timezone `Asia/Bangkok`; duration input เป็นนาทีและ countdown แสดง `ชั่วโมง:นาที:วินาที`

## Acceptance checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
export JWT_SECRET="$(openssl rand -base64 48)"
docker compose up -d --wait mongo
docker compose run --rm mongo-init
npx playwright install chromium
npm run test:e2e
docker compose down
unset JWT_SECRET
```

E2E ครอบคลุม public accessibility/kiosk, strict role-aware navbar/redirect/API boundary และ physician → infusion journey จน `encounter`/appointment เป็น `completed` พร้อมตรวจว่าไม่มี `DH/HA/IPW` queue ค้าง

- `GET /health/live` ตรวจ process ของ Next.js โดยไม่ผูกกับฐานข้อมูล
- `GET /health/ready` ตรวจความพร้อมของ MongoDB
- `GET /health` คงไว้เพื่อความเข้ากันได้และตรวจทั้ง application กับ MongoDB

## Deployment

`deploy/k8s` ประกอบด้วย CareLink 2 replicas, MongoDB StatefulSet replica set, NetworkPolicy, PodDisruptionBudget และ MongoDB backup รายคืนบน PVC (เก็บประมาณ 7 วัน) ส่วน Argo CD sync จาก `deploy/k8s` บน branch `main` GitHub Actions จะตรวจ typecheck, lint แบบ zero-warning, unit tests, build, browser E2E, Kustomize render และ container live-health ก่อนสร้าง immutable image

Public demo deploy ได้ครบจาก Git ด้วย Argo CD โดยตรง: `deploy/k8s/secret.yaml` มี `JWT_SECRET` และ `DEVELOPMENT_LOGIN_PASSWORD` แบบ plaintext สำหรับ sandbox นี้โดยเฉพาะ จึงไม่ต้องสร้าง Secret ภายนอกก่อน sync และเปิด automated prune/self-heal ไว้แล้ว เมื่อเปลี่ยนค่า Secret ให้เพิ่ม `carelink.dev/secret-revision` ใน `deploy/k8s/app.yaml` เพื่อ rollout pod ใหม่

> Secret ที่ commit ไว้เป็นค่าทดสอบสาธารณะ ผู้ที่อ่าน repository สามารถสร้าง session ของ demo ได้ ห้ามใช้ค่าชุดนี้กับข้อมูลผู้ป่วยจริง การติดตั้งจริงต้องย้ายไป External Secrets, Sealed Secrets หรือ SOPS พร้อมหมุน credential, เปิด encryption at rest, access logging และผ่าน privacy/compliance review
