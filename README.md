# CareLink Argo CD

โปรเจ็คจบสำหรับ deploy ระบบ CareLink แบบ GitOps ประกอบด้วยเว็บเจ้าหน้าที่, Go API, MongoDB และ Android patient app

- Web/API: <https://carelink.denmannsolutions.com>
- Health check: <https://carelink.denmannsolutions.com/health>
- Android package: `com.txngjr.carelink`
- Kubernetes namespace: `carelink`
- Argo CD application: `carelink`

## การทำงานของ GitOps

เมื่อ push การแก้ไขใน `backend/` หรือ `web/` เข้า branch `main`:

1. GitHub Actions รัน test และ build Docker images
2. Push images ไป GHCR ด้วย tag เดียวกัน เช่น `sha-a1b2c3d`
3. Workflow แก้ `deploy/k8s/kustomization.yaml` แล้ว commit tag กลับเข้า `main`
4. Argo CD เห็น commit ใหม่และ auto-sync เข้า namespace `carelink`

ไม่ต้องแก้ tag ด้วยมือ และไม่มี `latest` ใน deployment

## Deploy ครั้งแรก

### 1. รอ GitHub Actions build images

เปิดแท็บ **Actions → Build images and update Argo CD** ให้สถานะเป็นสีเขียว หลังจบจะเห็น `newTag: sha-.......` ใน `deploy/k8s/kustomization.yaml`

GHCR สร้าง package ครั้งแรกเป็น private ให้เปลี่ยนสอง package นี้เป็น **Public** ครั้งเดียว เพื่อให้ K3s pull ได้โดยไม่ต้องมี registry token:

- `carelink-argocd-backend`
- `carelink-argocd-web`

ไปที่หน้า package → **Package settings → Change visibility → Public**

### 2. เพิ่ม Application ใน Argo CD

วิธีสั้นที่สุดคือ apply Application manifest:

```bash
kubectl apply -f deploy/argocd/application.yaml
```

หรือกด **NEW APP** ในหน้า Argo CD แล้วใช้ค่า:

| ช่อง | ค่า |
|---|---|
| Application Name | `carelink` |
| Project | `default` |
| Sync Policy | `Automatic` |
| Repository URL | `https://github.com/TxngJr/carelink-argocd.git` |
| Revision | `main` |
| Path | `deploy/k8s` |
| Cluster | `https://kubernetes.default.svc` |
| Namespace | `carelink` |

manifest เปิด `prune` และ `selfHeal` ไว้แล้ว หลัง sync ควรเห็น `web`, `backend` และ `mongo` เป็น Healthy

ตรวจจากเครื่องที่เข้าถึง cluster:

```bash
kubectl -n carelink get pods,svc,pvc
kubectl -n carelink rollout status statefulset/mongo
kubectl -n carelink rollout status deployment/backend
kubectl -n carelink rollout status deployment/web
```

### 3. เพิ่ม Cloudflare Tunnel route

ใน tunnel เดียวกับภาพตัวอย่าง เพิ่ม Published application route:

| ช่อง | ค่า |
|---|---|
| Hostname | `carelink.denmannsolutions.com` |
| Path | `*` |
| Service | `http://carelink.carelink.svc.cluster.local:80` |

Cloudflare จบ TLS ที่ด้านหน้า ส่วน service ภายใน cluster ใช้ HTTP ตามปกติ จากนั้นทดสอบ:

```bash
curl https://carelink.denmannsolutions.com/health
```

## Android APK

API URL ถูกกำหนดเป็น `https://carelink.denmannsolutions.com` ในทั้ง fallback ของแอปและ EAS profile

สร้าง APK บนเครื่องนี้ด้วย Android SDK:

```bash
./scripts/build-apk.sh
```

ไฟล์จะอยู่ที่ `artifacts/carelink.apk`

หรือใช้ EAS cloud build:

```bash
cd care-link
npx eas-cli login
npx eas-cli build --platform android --profile production-apk
```

บน GitHub สามารถเพิ่ม repository secret ชื่อ `EXPO_TOKEN` แล้วกด **Actions → Build Android APK → Run workflow** ได้เช่นกัน

## ค่า demo ที่ deploy ให้แล้ว

โปรเจ็คนี้ตั้งใจเป็นงานส่งและเก็บ Secret แบบ plain text ใน `deploy/k8s/secret.yaml` ตามโจทย์ Backend ใช้ `APP_ENV=development` เพื่อ seed บัญชี/Station อัตโนมัติครั้งแรก และเก็บข้อมูล MongoDB ใน PVC ขนาด 2 GiB

| Username | Password | สิทธิ์ |
|---|---|---|
| `nurse` | `password123` | นัด/เช็กอิน/Station ที่ไม่ใช่ PC |
| `doctor` | `password123` | ยืนยันนัด/PC–PC4/กำหนด route |

ผู้ป่วยสมัครจาก Android app ด้วยชื่อ เบอร์โทร วันเกิด และรหัสผ่าน

## รันบนเครื่องสำหรับพัฒนา

```bash
docker compose up -d --build
curl http://localhost:8080/health
```

- เว็บเจ้าหน้าที่: <http://localhost:5173>
- Backend: <http://localhost:8080>
- MongoDB host port: `27018`

ล้างและ seed ฐาน development:

```bash
curl -X POST http://localhost:8080/api/dev/seed
```

## Demo flow

1. เปิด Android app สมัครผู้ป่วย แล้วส่งอาการพร้อมค่าที่วัดได้
2. Login เว็บด้วย `nurse` เปิดคำขอใหม่และเสนอวัน/เวลา
3. Login ด้วย `doctor` ยืนยันนัดและเลือก `PC–PC4`
4. ผู้ป่วยกดแจ้งมาถึง แล้วพยาบาลยืนยันเช็กอิน
5. เดินคิว `NPR → EV → VM → MHT → PCx`
6. แพทย์กำหนด route หลังตรวจ เช่น `LAB → RC → PD → DH` หรือ `HA → IPW`
7. Android app แสดงสถานะจน visit เสร็จสมบูรณ์

## ทดสอบ

```bash
cd backend
go test ./...
go vet ./...

cd ../web
npm ci
npm test
npm run build

cd ../care-link
npm ci
npm test
npx expo export --platform web

cd ..
kubectl kustomize deploy/k8s
```

ตรวจระบบครบ flow หลัง `docker compose up`:

```bash
node scripts/acceptance.mjs
```

