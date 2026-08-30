'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  KeyRound,
  LoaderCircle,
  LogIn,
  Search,
  UsersRound,
} from 'lucide-react'
import { clientApi } from '@/lib/client'
import type { DevelopmentAccount } from '@/lib/development-accounts'

type Props = {
  mode: 'staff' | 'patient' | 'register'
  enableDevelopmentLogin?: boolean
}

export function AuthForm({ mode, enableDevelopmentLogin = false }: Props) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [birthDate, setBirthDate] = useState('1990-01-01')
  const [busy, setBusy] = useState(false)
  const [developmentAccounts, setDevelopmentAccounts] = useState<DevelopmentAccount[]>([])
  const [developmentAccountsLoading, setDevelopmentAccountsLoading] = useState(enableDevelopmentLogin && mode === 'staff')
  const [selectedDevelopmentAccount, setSelectedDevelopmentAccount] = useState('')
  const [accountQuery, setAccountQuery] = useState('')
  const [accountRole, setAccountRole] = useState('all')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enableDevelopmentLogin || mode !== 'staff') return
    let active = true
    clientApi.getDevelopmentAccounts()
      .then((accounts) => {
        if (active) setDevelopmentAccounts(accounts)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'โหลดรายการบัญชีสำหรับทดสอบไม่สำเร็จ')
      })
      .finally(() => {
        if (active) setDevelopmentAccountsLoading(false)
      })
    return () => { active = false }
  }, [enableDevelopmentLogin, mode])

  const developmentRoleOptions = useMemo(() => {
    const roles = new Map<string, string>()
    developmentAccounts.forEach((account) => roles.set(account.role, account.role_label))
    return [...roles.entries()]
  }, [developmentAccounts])

  const filteredDevelopmentAccounts = useMemo(() => {
    const query = accountQuery.trim().toLocaleLowerCase('th')
    return developmentAccounts.filter((account) => {
      if (accountRole !== 'all' && account.role !== accountRole) return false
      if (!query) return true
      return [account.username, account.display_name, account.role_label, account.department, account.duty]
        .some((value) => value.toLocaleLowerCase('th').includes(query))
    })
  }, [accountQuery, accountRole, developmentAccounts])

  function openWorkspace(role: string) {
    if (role === 'admin' || role === 'manager') router.replace('/operations')
    else if (role === 'doctor' || role === 'physician') router.replace('/physician')
    else if (role === 'nurse') router.replace('/intake')
    else if (role === 'registration') router.replace('/registration')
    else if (role === 'vitals_staff') router.replace('/vitals')
    else if (role === 'lab_staff') router.replace('/lab')
    else if (role === 'pharmacy_staff') router.replace('/pharmacy')
    else if (role === 'infusion_staff' || role === 'chemo_staff') router.replace('/infusion')
    else router.replace('/operations')
  }

  async function enterAsDevelopmentAccount(account: DevelopmentAccount) {
    setBusy(true)
    setSelectedDevelopmentAccount(account.username)
    setError('')
    try {
      const result = await clientApi.developmentLogin(account.username)
      openWorkspace(result.user.role)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setBusy(false)
      setSelectedDevelopmentAccount('')
    }
  }

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
        openWorkspace(result.user.role)
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
    <div className={`auth-card${enableDevelopmentLogin && isStaff ? ' development-login-card' : ''}`}>
      <div className="brand-row">
        <Image src="/logo-mark.svg" alt="" width={46} height={46} priority />
        <div><strong>CareLink</strong><span>ระบบบริหารการรักษาและคิวผู้ป่วย</span></div>
      </div>
      <div className="auth-heading">
        <span className="eyebrow">{isStaff ? 'ระบบสำหรับบุคลากร' : 'ระบบสำหรับผู้ป่วย'}</span>
        <h1>{isRegister ? 'สมัครสมาชิกผู้ป่วย' : isStaff ? 'เข้าสู่ระบบเจ้าหน้าที่' : 'เข้าสู่ระบบผู้ป่วย'}</h1>
        <p>{isStaff ? 'สำหรับพยาบาล แพทย์ และเจ้าหน้าที่ทุกแผนก เพื่อจัดการนัดหมายและคิวการรักษา' : 'ดูนัดหมาย ติดตามคิวสด และเส้นทางการรับบริการได้จากมือถือ'}</p>
      </div>

      {error && <div className="inline-alert danger auth-error" role="alert">{error}</div>}

      {enableDevelopmentLogin && isStaff && (
        <section className="development-login" aria-labelledby="development-login-title">
          <div className="development-login-heading">
            <div>
              <span className="development-badge"><KeyRound size={14} aria-hidden="true" />Public Sandbox</span>
              <h2 id="development-login-title">ตารางบัญชีผู้ใช้สำหรับทดสอบ</h2>
              <p>ค้นหาบัญชีหรือกรองตามบทบาท แล้วกดเข้าใช้งานได้ทันทีโดยไม่ต้องกรอกรหัสผ่าน</p>
              <p><strong>ข้อมูลสังเคราะห์และใช้ร่วมกัน:</strong> ผู้ทดสอบอื่นอาจใช้บัญชีเดียวกัน การกระทำจะถูกแยกด้วย demo session และเก็บ audit</p>
            </div>
            <span className="development-account-total"><UsersRound size={16} aria-hidden="true" />{developmentAccounts.length} บัญชี</span>
          </div>

          <div className="development-account-controls">
            <label className="development-account-search">
              <span className="sr-only">ค้นหาบัญชีผู้ใช้</span>
              <Search size={17} aria-hidden="true" />
              <input value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} placeholder="ค้นหาชื่อ ชื่อผู้ใช้ หน่วยงาน หรือหน้าที่" />
            </label>
            <label>
              <span className="sr-only">กรองตามบทบาท</span>
              <select value={accountRole} onChange={(event) => setAccountRole(event.target.value)} aria-label="กรองบัญชีตามบทบาท">
                <option value="all">ทุกบทบาท</option>
                {developmentRoleOptions.map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              </select>
            </label>
            <span className="development-filter-total">พบ {filteredDevelopmentAccounts.length} บัญชี</span>
          </div>

          <div className="development-account-table-wrap" aria-live="polite">
            <table className="development-account-table">
              <thead>
                <tr>
                  <th>ชื่อผู้ใช้งาน</th>
                  <th>ชื่อบัญชี</th>
                  <th>บทบาทและหน่วยงาน</th>
                  <th>หน้าที่รับผิดชอบ</th>
                  <th><span className="sr-only">การดำเนินการ</span></th>
                </tr>
              </thead>
              <tbody>
                {developmentAccountsLoading && (
                  <tr><td colSpan={5} className="development-table-message"><LoaderCircle className="spin" size={20} aria-hidden="true" />กำลังโหลดบัญชีผู้ใช้…</td></tr>
                )}
                {!developmentAccountsLoading && filteredDevelopmentAccounts.map((account) => {
                  const isSelected = selectedDevelopmentAccount === account.username
                  return (
                    <tr key={account.username} className={isSelected ? 'selected' : ''}>
                      <td data-label="ชื่อผู้ใช้งาน"><strong>{account.display_name}</strong></td>
                      <td data-label="ชื่อบัญชี"><code className="mono">{account.username}</code></td>
                      <td data-label="บทบาทและหน่วยงาน"><span className="development-role-badge">{account.role_label}</span><small>{account.department}</small></td>
                      <td data-label="หน้าที่รับผิดชอบ">{account.duty}</td>
                      <td className="development-login-action">
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => enterAsDevelopmentAccount(account)}
                          disabled={busy}
                          aria-label={`เข้าสู่ระบบด้วยบัญชี ${account.username} บทบาท${account.role_label}`}
                        >
                          {isSelected ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
                          {isSelected ? 'กำลังเข้าสู่ระบบ…' : 'เข้าใช้งาน'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {!developmentAccountsLoading && filteredDevelopmentAccounts.length === 0 && (
                  <tr><td colSpan={5} className="development-table-message">ไม่พบบัญชีที่ตรงกับคำค้นหา</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="auth-separator"><span>หรือเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน</span></div>
        </section>
      )}

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
            placeholder={isStaff ? 'กรอกชื่อผู้ใช้ของคุณ' : '0812345678'}
            autoComplete={isStaff ? 'username' : 'tel'}
            inputMode={isStaff ? 'text' : 'tel'}
            disabled={busy}
            required
          />
        </label>
        <label>
          <span>รหัสผ่าน</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isRegister ? 'อย่างน้อย 6 ตัวอักษร' : '••••••••'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 6 : undefined} disabled={busy} required />
        </label>
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
    </div>
  )
}
