import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Stethoscope, UserRound, LogOut,
} from 'lucide-react'
import { useAuth } from '../App'

const menuItems = {
  nurse: [{ path: '/nurse', label: 'พื้นที่พยาบาล', Icon: Stethoscope }],
  doctor: [{ path: '/doctor', label: 'พื้นที่แพทย์', Icon: UserRound }],
}

const roleLabels = {
  nurse: 'พยาบาล',
  doctor: 'แพทย์',
}

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const items = menuItems[user?.role] || []

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div
      className={`sidebar d-flex flex-column position-fixed ${open ? 'open' : ''}`}
      style={{ width: '250px', top: 0, left: 0, zIndex: 1045 }}
    >
      <div className="px-3 pt-4 pb-3 d-flex align-items-center">
        <img src="/logo-mark.svg" alt="CareLink" width="38" height="38" style={{ borderRadius: 9 }} />
        <div className="ms-2">
          <div className="fw-bold" style={{ fontSize: 16, letterSpacing: '-0.01em' }}>CareLink</div>
          <div style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(234,251,248,0.55)', fontWeight: 600 }}>
            UbonRatchathani Oncology
          </div>
        </div>
      </div>

      <hr className="mx-3 my-1" />

      <div className="px-3 py-2">
        <div className="df-label mb-1" style={{ color: 'rgba(234,251,248,0.45)' }}>เข้าสู่ระบบในบทบาท</div>
        <span className="badge bg-light">{roleLabels[user?.role] || user?.role}</span>
      </div>

      <nav className="nav flex-column flex-grow-1 px-2 mt-1">
        {items.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            <item.Icon size={16} strokeWidth={2} style={{ marginRight: 10, flexShrink: 0 }} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3">
        <div className="d-flex align-items-center mb-3">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center fw-bold"
            style={{ width: 36, height: 36, background: 'var(--teal-700)', color: 'var(--fg-on-brand)' }}
          >
            {user?.display_name?.[0] || '?'}
          </div>
          <div className="ms-2" style={{ minWidth: 0 }}>
            <div className="small text-truncate" style={{ color: 'var(--fg-on-brand)' }}>{user?.display_name}</div>
            <div className="font-mono text-truncate" style={{ fontSize: 11, color: 'rgba(234,251,248,0.5)' }}>@{user?.username}</div>
          </div>
        </div>
        <button className="btn btn-outline-light btn-sm w-100 d-flex align-items-center justify-content-center" onClick={handleLogout}>
          <LogOut size={14} style={{ marginRight: 6 }} />
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}
