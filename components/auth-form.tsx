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
import { roleHomePath } from '@/lib/access-control'
import type { DevelopmentAccount } from '@/lib/development-accounts'
import type { Role } from '@/lib/types'

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

  function openWorkspace(role: Role) {
    router.replace(roleHomePath(role))
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

  return <div className={`auth-page ${enableDevelopmentLogin && isStaff ? 'development-auth' : ''}`}>
    <section className="auth-side-copy">
      <Image src="/logo-mark.svg" alt="CareLink" width={56} height={56} priority />
      <h2>{isStaff ? 'ระบบบริหารการไหลเวียนผู้ป่วย' : 'ดูแลทุกขั้นตอนของการเข้ารับบริการ'}</h2>
      <p>{isStaff ? 'พื้นที่ทำงานสำหรับบุคลากรทางการแพทย์และทีมปฏิบัติการ' : 'ติดตามคิว นัดหมาย และข้อมูลก่อนเข้ารับบริการจากที่เดียว'}</p>
    </section>

    <section className="auth-card">
      <div className="brand-row"><Image src="/logo-mark.svg" alt="" width={36} height={36} /><div><strong>CareLink</strong><span>{isStaff ? 'สำหรับเจ้าหน้าที่' : 'สำหรับผู้รับบริการ'}</span></div></div>
      <div className="auth-heading">
        <span className="eyebrow">{isRegister ? 'CREATE PATIENT ACCOUNT' : isStaff ? 'STAFF SIGN IN' : 'PATIENT SIGN IN'}</span>
        <h1>{isRegister ? 'ลงทะเบียนผู้รับบริการ' : 'เข้าสู่ระบบ'}</h1>
        <p>{isRegister ? 'สร้างบัญชีเพื่อขอนัดและติดตามเส้นทางบริการ' : 'กรอกข้อมูลบัญชีเพื่อเข้าสู่พื้นที่ใช้งานของคุณ'}</p>
      </div>

      {error && <div className="inline-alert danger auth-error">{error}</div>}

      {enableDevelopmentLogin && isStaff && <div className="development-login">
        <div className="development-login-heading"><div><span className="development-badge"><KeyRound size={13} /> Development access</span><h2>บัญชีสำหรับทดสอบ</h2><p>เลือกบัญชีเพื่อเข้าสู่ Workspace ของบทบาทนั้นทันที</p></div><div className="development-account-total"><UsersRound size={14} /> {developmentAccounts.length} บัญชี</div></div>
        <div className="development-account-controls">
          <label className="development-account-search"><Search size={15} /><input value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} placeholder="ค้นหาชื่อ ผู้ใช้ หน่วยงาน หรืองานที่รับผิดชอบ" /></label>
          <select value={accountRole} onChange={(event) => setAccountRole(event.target.value)} aria-label="กรองตามบทบาท"><option value="all">ทุกบทบาท</option>{developmentRoleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <span className="development-filter-total">พบ {filteredDevelopmentAccounts.length} รายการ</span>
        </div>
        <div className="development-account-table-wrap">
          <table className="development-account-table">
            <thead><tr><th>บัญชี</th><th>บทบาท</th><th>หน่วยงาน</th><th>หน้าที่</th><th /></tr></thead>
            <tbody>
              {developmentAccountsLoading ? <tr><td colSpan={5} className="development-table-message"><LoaderCircle className="spin" size={16} /> กำลังโหลดบัญชี…</td></tr> : filteredDevelopmentAccounts.length === 0 ? <tr><td colSpan={5} className="development-table-message">ไม่พบบัญชีที่ตรงกับตัวกรอง</td></tr> : filteredDevelopmentAccounts.map((account) => <tr key={account.username} className={selectedDevelopmentAccount === account.username ? 'selected' : ''}>
                <td><strong>{account.display_name}</strong><code>{account.username}</code></td><td><span className="development-role-badge">{account.role_label}</span></td><td>{account.department}<small>{account.station_codes.join(', ') || '—'}</small></td><td>{account.duty}</td><td className="development-login-action"><button type="button" className="button secondary" disabled={busy} onClick={() => void enterAsDevelopmentAccount(account)}>{busy && selectedDevelopmentAccount === account.username ? <><LoaderCircle className="spin" size={14} /> กำลังเข้า…</> : <><LogIn size={14} /> เข้าใช้งาน</>}</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="auth-separator">หรือเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน</div>
      </div>}

      <form className="auth-form" onSubmit={submit}>
        {isRegister && <label><span>ชื่อ-นามสกุล</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required autoComplete="name" /></label>}
        <label><span>{isStaff ? 'ชื่อผู้ใช้' : 'เบอร์โทรศัพท์'}</span><input value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" /></label>
        {isRegister && <label><span>วันเกิด</span><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} required /></label>}
        <label><span>รหัสผ่าน</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={isRegister ? 6 : undefined} autoComplete={isRegister ? 'new-password' : 'current-password'} /></label>
        <button className="button primary large full" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> กำลังดำเนินการ…</> : isRegister ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}</button>
      </form>

      {!isStaff && <div className="auth-footer">{isRegister ? <><span>มีบัญชีแล้ว?</span><Link href="/login/patient">เข้าสู่ระบบ</Link></> : <><span>ยังไม่มีบัญชี?</span><Link href="/register/patient">ลงทะเบียน</Link></>}</div>}
    </section>
  </div>
}
