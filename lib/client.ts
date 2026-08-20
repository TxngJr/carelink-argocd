import type { AppointmentMeasurements } from '@/lib/types'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type Envelope<T> = { success: true; data: T; message: string } | { success: false; error: { code: string; message: string } }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const result = (await response.json().catch(() => null)) as Envelope<T> | null
  if (!result || !response.ok || !result.success) {
    const error = result && !result.success ? result.error : null
    throw new ApiError(error?.message || 'เชื่อมต่อระบบไม่สำเร็จ', response.status, error?.code)
  }
  return result.data
}

export const clientApi = {
  staffLogin: (username: string, password: string) => request<{ user: { id: string; role: string; display_name: string; username: string } }>('POST', '/auth/login', { username, password }),
  patientLogin: (username: string, password: string) => request<{ user: { id: string; role: string; display_name: string } }>('POST', '/mobile/auth/login', { username, password }),
  patientRegister: (data: { display_name: string; phone: string; birth_date: string; password: string }) => request<{ user: { id: string; role: string; display_name: string } }>('POST', '/mobile/auth/register', data),
  logout: () => request<null>('POST', '/auth/logout'),
  me: () => request<Record<string, unknown>>('GET', '/auth/me'),

  getNurseRequests: (status = 'submitted') => request<unknown[]>('GET', `/nurse/appointment-requests?status=${encodeURIComponent(status)}`),
  proposeAppointment: (id: string, data: { appointment_at: string; note: string }) => request('POST', `/nurse/appointment-requests/${id}/propose`, data),
  cancelByNurse: (id: string, reason: string) => request('POST', `/nurse/appointment-requests/${id}/cancel`, { reason }),
  getTodayArrivals: () => request<unknown[]>('GET', '/nurse/arrivals/today'),
  confirmCheckIn: (id: string) => request('POST', `/nurse/appointment-requests/${id}/confirm-checkin`),

  getDoctorRequests: () => request<unknown[]>('GET', '/doctor/appointment-requests?status=nurse_proposed'),
  confirmAppointment: (id: string, data: { appointment_at: string; assigned_pc: string; note: string }) => request('POST', `/doctor/appointment-requests/${id}/confirm`, data),
  setDoctorRoute: (encounterId: string, stationCodes: string[]) => request('POST', `/doctor/encounters/${encounterId}/route`, { station_codes: stationCodes }),

  getStationQueue: (code: string) => request('GET', `/stations/${code}/queue`),
  callNext: (code: string) => request('POST', `/stations/${code}/call-next`),
  queueAction: (code: string, itemId: string, action: 'start' | 'complete' | 'recall' | 'skip' | 'requeue') => request('POST', `/stations/${code}/queue/${itemId}/${action}`),

  getPatientMe: () => request('GET', '/mobile/me'),
  getJourney: () => request('GET', '/mobile/journey/current'),
  getNotifications: () => request('GET', '/mobile/notifications'),
  markNotificationRead: (id: string) => request('PATCH', `/mobile/notifications/${id}/read`),
  getCurrentAppointment: () => request('GET', '/mobile/appointment-requests/current'),
  createAppointment: (chief_complaint: string, measurements: AppointmentMeasurements) => request('POST', '/mobile/appointment-requests', { chief_complaint, measurements }),
  updateAppointment: (id: string, chief_complaint: string, measurements: AppointmentMeasurements) => request('PATCH', `/mobile/appointment-requests/${id}`, { chief_complaint, measurements }),
  cancelAppointment: (id: string, reason = '') => request('POST', `/mobile/appointment-requests/${id}/cancel`, { reason }),
  reportArrival: (id: string) => request('POST', `/mobile/appointment-requests/${id}/report-arrival`),
}
