const API_BASE = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`
let authToken = localStorage.getItem('carelink_token') || null

export function setToken(token) {
  authToken = token
  localStorage.setItem('carelink_token', token)
}

export function clearToken() {
  authToken = null
  localStorage.removeItem('carelink_token')
  localStorage.removeItem('carelink_user')
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('carelink_user'))
  } catch {
    return null
  }
}

export function setUser(user) {
  localStorage.setItem('carelink_user', JSON.stringify(user))
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json().catch(() => null)
  if (!result || !response.ok || !result.success) {
    throw new Error(result?.error?.message || 'เชื่อมต่อระบบไม่สำเร็จ')
  }
  return result
}

export const api = {
  login: (username, password) => request('POST', '/auth/login', { username, password }),

  getStationQueue: code => request('GET', `/stations/${code}/queue`),
  callNext: code => request('POST', `/stations/${code}/call-next`),
  startQueue: (code, itemId) => request('POST', `/stations/${code}/queue/${itemId}/start`),
  completeQueue: (code, itemId) => request('POST', `/stations/${code}/queue/${itemId}/complete`),
  recallQueue: (code, itemId) => request('POST', `/stations/${code}/queue/${itemId}/recall`),
  skipQueue: (code, itemId) => request('POST', `/stations/${code}/queue/${itemId}/skip`),
  requeueQueue: (code, itemId) => request('POST', `/stations/${code}/queue/${itemId}/requeue`),

  getNurseRequests: (status = '') => request('GET', `/nurse/appointment-requests${status ? `?status=${status}` : ''}`),
  proposeAppointment: (id, data) => request('POST', `/nurse/appointment-requests/${id}/propose`, data),
  cancelAppointmentByNurse: (id, reason) => request('POST', `/nurse/appointment-requests/${id}/cancel`, { reason }),
  getTodayArrivals: () => request('GET', '/nurse/arrivals/today'),
  confirmCheckIn: id => request('POST', `/nurse/appointment-requests/${id}/confirm-checkin`),

  getDoctorAppointmentRequests: () => request('GET', '/doctor/appointment-requests?status=nurse_proposed'),
  confirmAppointment: (id, data) => request('POST', `/doctor/appointment-requests/${id}/confirm`, data),
  setDoctorRoute: (encounterId, stationCodes) =>
    request('POST', `/doctor/encounters/${encounterId}/route`, { station_codes: stationCodes }),
}
