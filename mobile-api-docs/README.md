# CareLink Mobile API (สำหรับ React Native Expo Patient App)

Base URL: `http://localhost:8080` (Android emulator ใช้ `http://10.0.2.2:8080`, เครื่องจริงใช้ IP ของเครื่องที่รัน backend)

ทุก endpoint (ยกเว้น login) ต้องส่ง header: `Authorization: Bearer <token>`

รูปแบบ response มาตรฐาน:

```json
{ "success": true, "data": {}, "message": "OK" }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

## Auth

### POST /api/mobile/auth/login
```json
{ "username": "patient", "password": "password123" }
```
ตอบกลับ: `data.token` (JWT), `data.user { id, display_name, role }`

### GET /api/mobile/me
ข้อมูลผู้ใช้ปัจจุบัน

## Journey

### GET /api/mobile/journey/current
สถานะ visit วันนี้ของผู้ป่วย:
```json
{
  "current_station": "MHT",
  "station_name": "ซักประวัติ",
  "next_station": "PC",
  "estimated_wait": 28,
  "queue_no": "MHT-04",
  "route": [ { "station_code": "NPR", "status": "completed" }, ... ],
  "encounter": { ... }
}
```
ถ้าไม่มี visit วันนี้: `data = null`, `message = "ไม่มี visit ปัจจุบัน"`

## Pre-screening / Home Vitals

### POST /api/mobile/pre-screening
```json
{
  "chief_complaint": "อ่อนเพลีย เบื่ออาหาร 1 สัปดาห์",
  "food_intake": "ได้น้อยลง",
  "symptoms": ["อ่อนเพลีย", "เบื่ออาหาร"],
  "allergies": ["Penicillin"],
  "current_medications": ["Paracetamol"],
  "home_vitals": { "sbp": 138, "dbp": 86, "pulse": 82, "temperature": 36.8, "spo2": 98, "weight": 64 }
}
```
ระบบคำนวณ `ai_risk_level` (low/medium/high) อัตโนมัติแบบ rule-based

### POST /api/mobile/vitals-home
```json
{ "sbp": 138, "dbp": 86, "pulse": 82, "temperature": 36.8, "spo2": 98, "weight": 64 }
```

## AI Chat (rule-based)

### POST /api/mobile/ai-chat
```json
{ "message": "มีไข้สูง หายใจลำบาก" }
```
ตอบกลับ: `data { response, risk_level, disclaimer }` —
AI ไม่วินิจฉัยโรค เป็นเพียงผู้ช่วยคัดกรองเบื้องต้น

## Notifications / Help

### GET /api/mobile/notifications
### PATCH /api/mobile/notifications/:id/read
### POST /api/mobile/help-request

## Station Map (ดูได้ทุก role)

### GET /api/map/overview
```json
{
  "stations": [
    { "code": "VM", "name": "จุดวัดสัญญาณชีพ", "floor": "ชั้น 1", "capacity": 4,
      "waiting": 1, "in_progress": 0, "estimated_wait_min": 2,
      "patients": [ { "queue_no": "VM-01", "display_name": "...", "status": "waiting", "priority": "normal" } ] }
  ],
  "transits": [
    { "display_name": "สมชาย พ.", "from_station": "NPR", "to_station": "EV", "queue_no": "EV-01" }
  ]
}
```

## Real-time

WebSocket: `ws://localhost:8080/ws?token=<jwt>`

Event types ที่เกี่ยวข้องกับผู้ป่วย: `PATIENT_MOVED`, `QUEUE_UPDATED`,
`PATIENT_NOTIFICATION_CREATED`, `LAB_RESULT_READY`, `PHARMACY_READY`
