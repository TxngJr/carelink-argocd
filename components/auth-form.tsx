'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { clientApi } from '@/lib/client'

type Props = { mode: 'staff' | 'patient' | 'register' }

export function AuthForm({ mode }: Props) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [birthDate, setBirthDate] = useState('1990-01-01')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'register') {
        const result = await clientApi.patientRegister(displayName, username, birthDate, password)
        if (result.user.role !== 'patient') throw new Error('บัญชีไม่ถูกต้อง')
        router.replace('/patient')
      } else if (mode === 'patient') {
        await clientApi.patientLogin(username, password)
        router.replace('/patient')
      } else {
        const result = await clientApi.login(username, password)
        const role = result.user.role
        if (role === 'admin' || role === 'manager') router.replace('/operations')
        else if (role === 'doctor' || role === 'physician') router.replace('/physician')
        else if (role === 'nurse') router.replace('/intake')
        else if (role === 'registration') router.replace('/registration')
        else if (role === 'vitals_staff') router.replace('/vitals')
        else if (role === 'lab_staff') router.replace('/lab')
        else if (role === 'pharmacy_staff') router.replace('/pharmacy')
        else if (role === 'chemo_staff') router.replace('/chemo')
        else if (role === 'rt_staff') router.replace('/radiation')
        else router.replace('/operations')
      }
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const isStaff = mode === 'staff'
  const isRegister = mode === 'register'

  return (
    <div className="auth-card">
      <div className="brand-row">
        <img src="/logo-mark.svg" alt="" width={46} height={46} />
        <div><strong>CareLink</strong><span>AMIS DynaFlow 2.0</span></div>
      </div>
      <div className="auth-heading">
        <span className="eyebrow">{isStaff ? 'STAFF PORTAL' : 'PATIENT PORTAL'}</span>
        <h1>{isRegister ? 'สมัครสมาชิกผู้ป่วย' : isStaff ? 'เข้าสู่ระบบบุคลากร' : 'เข้าสู่ระบบผู้ป่วย'}</h1>
        <p>{isStaff ? 'สำหรับพยาบาล แพทย์ และเจ้าหน้าที่ทุกแผนก เพื่อจัดการนัดหมายและคิวการรักษา' : 'ดูนัดหมาย ติดตามคิวสด และเส้นทางการรับบริการได้จากมือถือ'}</p>
      </div>
      <form onSubmit={submit} className="auth-form">
        {isRegister && (
          <label>
            <span>ชื่อ-นามสกุล</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="เช่น สมชาย ใจดี" autoComplete="name" required />
          </label>
        )}
        {isRegister && (
          <label>
            <span>วันเกิด</span>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
          </label>
        )}
        <label>
          <span>{isStaff ? 'ชื่อผู้ใช้' : 'เบอร์โทรศัพท์'}</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={isStaff ? 'admin, nurse, doctor, lab, pharmacy, chemo, radiation' : '0812345678'}
            autoComplete={isStaff ? 'username' : 'tel'}
            inputMode={isStaff ? 'text' : 'tel'}
            required
          />
        </label>
        <label>
          <span>รหัสผ่าน</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isRegister ? 'อย่างน้อย 6 ตัวอักษร' : '••••••••'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 6 : undefined} required />
        </label>
        {error && <div className="inline-alert danger">{error}</div>}
        <button className="button primary large" type="submit" disabled={busy}>{busy ? 'กำลังดำเนินการ…' : isRegister ? 'สมัครและเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}</button>
      </form>
      <div className="auth-footer">
        {isStaff ? (
          <><span>เป็นผู้ป่วย?</span><Link href="/login/patient">เข้าสู่ระบบผู้ป่วย</Link></>
        ) : isRegister ? (
          <><span>มีบัญชีแล้ว?</span><Link href="/login/patient">เข้าสู่ระบบ</Link></>
        ) : (
          <><Link href="/register/patient">สร้างบัญชีผู้ป่วย</Link><span>·</span><Link href="/login/nurse">เข้าสู่ระบบบุคลากร</Link></>
        )}
      </div>
      {isStaff && (
        <div className="demo-note">
          <strong>บัญชีทดสอบ (รหัส: password123):</strong>
          <span>admin</span>
          <span>manager</span>
          <span>nurse</span>
          <span>doctor</span>
          <span>lab</span>
          <span>pharmacy</span>
          <span>chemo</span>
          <span>radiation</span>
        </div>
      )}
    </div>
  )
}
