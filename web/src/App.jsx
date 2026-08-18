import React, { useState, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { api, setToken, clearToken, getStoredUser, setUser } from './services/api'
import LoginPage from './pages/LoginPage'
import SimpleNursePage from './pages/SimpleNursePage'
import SimpleDoctorPage from './pages/SimpleDoctorPage'
import Sidebar from './components/Sidebar'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmDialog'

export const AuthContext = createContext(null)

const roleRoutes = {
  nurse: '/nurse',
  doctor: '/doctor',
}

export function useAuth() {
  return useContext(AuthContext)
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  if (!user) return <Navigate to="/login" />
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleRoutes[user.role] || '/'} />
  }
  return (
    <div className="d-flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <div className="flex-grow-1 app-content" style={{ marginLeft: '250px' }}>
        <button
          className="sidebar-toggle btn btn-outline-secondary btn-sm m-2 align-items-center"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUserState] = useState(getStoredUser())
  const login = async (username, password) => {
    const res = await api.login(username, password)
    setToken(res.data.token)
    setUser(res.data.user)
    setUserState(res.data.user)
    return res.data.user
  }

  const logout = () => {
    clearToken()
    setUserState(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <ToastProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/nurse" element={
              <ProtectedRoute allowedRoles={['nurse']}>
                <SimpleNursePage />
              </ProtectedRoute>
            } />
            <Route path="/doctor" element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <SimpleDoctorPage />
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to={user ? (roleRoutes[user.role] || '/login') : '/login'} />} />
          </Routes>
        </BrowserRouter>
      </ConfirmProvider>
      </ToastProvider>
    </AuthContext.Provider>
  )
}
