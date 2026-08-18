# CareLink — Demo Accounts

บัญชีทั้งหมดถูกสร้างอัตโนมัติโดย seed data (`backend/internal/seed/seed.go`)
รหัสผ่านของทุกบัญชี **เหมือนกันหมด**: `password123`

> ใช้สำหรับ demo/dev เท่านั้น ห้ามใช้ข้อมูลนี้ในระบบจริง

## Web (staff) — http://localhost:5173

| Username | Password | Role | ชื่อที่แสดง | แผนก / สถานี | เมนูที่เห็น |
|---|---|---|---|---|---|
| `admin` | `password123` | admin | ผู้ดูแลระบบ | IT | ทุกเมนู (Dashboard, ทุกสถานี, Flow Board, แผนที่สถานี) |
| `manager` | `password123` | manager | น.ท.หญิง สมศรี จ. | บริหาร | Dashboard, Flow Board (**+ ปุ่มแจ้งคอขวด**), แผนที่สถานี |
| `registration` | `password123` | registration_staff | นางสาวสมใจ ว. | ลงทะเบียน (NPR, EV) | NPR / EV, Flow Board, แผนที่สถานี |
| `vitals` | `password123` | vitals_staff | นางสาวมณี ส. | จุดตรวจ (VM) | VM, Flow Board, แผนที่สถานี |
| `nurse` | `password123` | nurse | นางสาวอารี ร. | พยาบาล (MHT) | MHT, Flow Board, แผนที่สถานี |
| `doctor` | `password123` | doctor | นพ. วิรัช ส. | Oncology (PC) | PC, Flow Board, แผนที่สถานี |
| `lab` | `password123` | lab_staff | นางสาวจินดา ล. | Lab (LABC, LABA) | LAB, Flow Board, แผนที่สถานี |
| `chemo` | `password123` | chemo_staff | นางสาวประภา ค. | Chemo (CHEMO_PRE, CHEMO_INF) | CHEMO, Flow Board, แผนที่สถานี |
| `rt` | `password123` | rt_staff | นางสาวนภา น. | Radiation (RT_L1, RT_L2) | RT / LINAC, Flow Board, แผนที่สถานี |
| `pharmacy` | `password123` | pharmacy_staff | เภสัชกร สมบัติ พ. | Pharmacy (PD_VERIFY, PD_DISP) | PD, Flow Board, แผนที่สถานี |

## Mobile app (ผู้ป่วย) — Expo app

| Username | Password | Role | ชื่อที่แสดง | หมายเหตุ |
|---|---|---|---|---|
| `patient` | `password123` | patient | สมชาย พ. (HN: NG-44821) | บัญชีนี้ผูกกับผู้ป่วยตัวอย่างที่มีข้อมูลครบ (แพ้ Penicillin, มะเร็งลำไส้ใหญ่ ระยะ II) ใช้ demo journey เต็มรูปแบบได้ |

## รีเซ็ตข้อมูล demo (ล้าง + seed ใหม่)

```bash
curl -X POST http://localhost:8080/api/dev/seed
```

หรือรันจาก source:

```bash
cd backend && go run ./cmd/api seed
```

> คำสั่งนี้จะลบข้อมูลเดิมทั้งหมดและสร้างบัญชี/ผู้ป่วย/encounter ตัวอย่างใหม่ (รวมถึงรหัสผ่านชุดเดิมข้างต้น)
