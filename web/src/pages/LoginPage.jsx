import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'

const roleRoutes = {
  nurse: '/nurse',
  doctor: '/doctor',
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(username, password)
      navigate(roleRoutes[user.role] || '/login')
    } catch (err) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  const demoAccounts = [
    { user: 'nurse', label: 'พยาบาล' },
    { user: 'doctor', label: 'แพทย์' },
  ]

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'linear-gradient(160deg, #052523 0%, #06302e 60%, #08453f 100%)' }}>
      <div className="card border-0" style={{ width: '440px', borderRadius: '12px', boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <img src="/logo-mark.svg" alt="CareLink" width="52" height="52" className="mb-3" />
            <h3 className="fw-bold mb-0" style={{ color: 'var(--teal-700)', letterSpacing: '-0.02em' }}>CareLink</h3>
            <div className="df-label mt-1" style={{ color: 'var(--teal-600)' }}>UbonRatchathani Oncology Center</div>
            <p className="text-muted small mt-1 mb-0">ระบบนัดหมายและจัดคิวผู้ป่วย</p>
          </div>

          {error && (
            <div className="alert alert-danger py-2" role="alert">{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">ชื่อผู้ใช้</label>
              <input
                type="text"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="กรอกชื่อผู้ใช้"
                required
              />
            </div>
            <div className="mb-4">
              <label className="form-label">รหัสผ่าน</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-100 py-2"
              disabled={loading}
              data-testid="login-button"
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {import.meta.env.VITE_HIDE_DEMO_LOGINS !== 'true' && (
            <>
              <hr className="my-4" />
              <div className="mb-2">
                <small className="text-muted fw-bold">บัญชี Demo สำหรับทดสอบ (dev เท่านั้น):</small>
              </div>
              <div className="d-flex flex-wrap gap-1">
                {demoAccounts.map(acc => (
                  <button
                    key={acc.user}
                    className="btn btn-outline-secondary btn-sm"
                    style={{ fontSize: '11px' }}
                    onClick={() => {
                      setUsername(acc.user)
                      setPassword('password123')
                    }}
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
