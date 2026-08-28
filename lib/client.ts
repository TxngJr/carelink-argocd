import type {
  Appointment,
  AppointmentMeasurements,
  ChemoSession,
  ClinicalOrder,
  Encounter,
  HelpRequest,
  HelpRequestSubmission,
  Journey,
  Notice,
  OperationsSnapshot,
  Patient,
  Previsit,
  PrevisitSubmission,
  PublicUser,
  QueueData,
  RadiationSession,
  TriageSession,
  VitalsRecord,
} from '@/lib/types'

export class ClientApiError extends Error {
  constructor(message: string, public code = 'API_ERROR', public status = 500) {
    super(message)
  }
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path.startsWith('/') ? `/api${path}` : `/api/${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    const message = payload?.error?.message || payload?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ'
    const code = payload?.error?.code || 'API_ERROR'
    throw new ClientApiError(message, code, response.status)
  }
  return payload.data as T
}

export const clientApi = {
  // Auth
  login: (username: string, password: string) => request<{ token: string; user: PublicUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  patientLogin: (username: string, password: string) => request<{ token: string; user: PublicUser }>('/mobile/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  patientRegister: (display_name: string, phone: string, birth_date: string, password: string) =>
    request<{ token: string; user: PublicUser }>('/mobile/auth/register', { method: 'POST', body: JSON.stringify({ display_name, phone, birth_date, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getStaffMe: () => request<PublicUser>('/auth/me'),
  getPatientMe: () => request<PublicUser>('/mobile/me'),

  // Patient App
  getJourney: () => request<Journey | null>('/mobile/journey/current'),
  getNotifications: () => request<Notice[]>('/mobile/notifications'),
  markNotificationRead: (id: string) => request(`/mobile/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/mobile/notifications/read-all', { method: 'PATCH' }),
  getCurrentAppointment: () => request<Appointment | null>('/mobile/appointment-requests/current'),
  createAppointment: (chief_complaint: string, measurements?: AppointmentMeasurements) =>
    request<Appointment>('/mobile/appointment-requests', { method: 'POST', body: JSON.stringify({ chief_complaint, measurements }) }),
  updateAppointment: (id: string, chief_complaint: string, measurements?: AppointmentMeasurements) =>
    request<Appointment>(`/mobile/appointment-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ chief_complaint, measurements }) }),
  cancelAppointment: (id: string, reason = '') =>
    request(`/mobile/appointment-requests/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  reportArrival: (id: string) => request(`/mobile/appointment-requests/${id}/report-arrival`, { method: 'POST' }),

  // Previsit & AI Triage & Help
  getPrevisit: () => request<Previsit | null>('/mobile/previsit/current'),
  savePrevisit: (data: PrevisitSubmission) => request<Previsit>('/mobile/previsit/current', { method: 'PUT', body: JSON.stringify(data) }),
  createTriageSession: () => request<TriageSession>('/mobile/triage/sessions', { method: 'POST' }),
  getCurrentTriageSession: () => request<TriageSession | null>('/mobile/triage/sessions/current'),
  sendTriageMessage: (sessionId: string, message: string) =>
    request<TriageSession>(`/mobile/triage/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
  submitTriageSession: (sessionId: string) =>
    request<TriageSession>(`/mobile/triage/sessions/${sessionId}/submit`, { method: 'POST' }),
  createHelpRequest: (category: HelpRequestSubmission['category'], message: string) =>
    request<HelpRequest>('/mobile/help-request', { method: 'POST', body: JSON.stringify({ category, message }) }),

  // Nurse
  getNurseRequests: (status?: string) => request<Appointment[]>(`/nurse/appointment-requests${status ? `?status=${status}` : ''}`),
  proposeAppointment: (id: string, data: { appointment_at: string; note?: string }) =>
    request<Appointment>(`/nurse/appointment-requests/${id}/propose`, { method: 'POST', body: JSON.stringify(data) }),
  cancelAppointmentByStaff: (id: string, reason = '') =>
    request(`/nurse/appointment-requests/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getTodayArrivals: () => request<Appointment[]>('/nurse/arrivals/today'),
  confirmCheckIn: (id: string) => request(`/nurse/appointment-requests/${id}/confirm-checkin`, { method: 'POST' }),
  saveAssessment: (encounterId: string, payload: Record<string, unknown>) =>
    request(`/nurse/assessment/${encounterId}`, { method: 'POST', body: JSON.stringify(payload) }),
  markUrgent: (encounterId: string) => request(`/nurse/urgent/${encounterId}`, { method: 'POST' }),

  // Doctor
  getDoctorRequests: (status?: string) => request<Appointment[]>(`/doctor/appointment-requests${status ? `?status=${status}` : ''}`),
  confirmAppointment: (id: string, data: { appointment_at: string; assigned_pc: string; note?: string }) =>
    request<Appointment>(`/doctor/appointment-requests/${id}/confirm`, { method: 'POST', body: JSON.stringify(data) }),
  setDoctorRoute: (encounterId: string, station_codes: string[]) =>
    request(`/doctor/encounters/${encounterId}/route`, { method: 'POST', body: JSON.stringify({ station_codes }) }),
  saveConsultation: (encounterId: string, payload: Record<string, unknown>) =>
    request(`/doctor/encounters/${encounterId}/note`, { method: 'POST', body: JSON.stringify(payload) }),
  createOrders: (encounterId: string, payload: { items: unknown[]; notes?: string }) =>
    request<ClinicalOrder>(`/doctor/encounters/${encounterId}/orders`, { method: 'POST', body: JSON.stringify(payload) }),

  // Patients & Encounters
  searchPatients: (q = '') => request<Patient[]>(`/registration/patients?q=${encodeURIComponent(q)}`),
  getPatient: (id: string) => request<Patient>(`/patients/${id}`),
  listEncounters: (status?: string) => request<Encounter[]>(`/patients/encounters${status ? `?status=${status}` : ''}`),
  getEncounterDetail: (id: string) => request<Encounter>(`/patients/encounters/${id}`),

  // Vitals
  saveVitals: (encounterId: string, data: Record<string, unknown>) =>
    request<VitalsRecord>(`/vitals/${encounterId}`, { method: 'POST', body: JSON.stringify(data) }),
  getLatestVitals: (encounterId: string) => request<VitalsRecord | null>(`/vitals/${encounterId}/latest`),

  // Lab
  getLabQueue: () => request<ClinicalOrder[]>('/lab/queue'),
  collectLabSample: (orderId: string) => request(`/lab/${orderId}/collect`, { method: 'POST' }),
  saveLabResults: (orderId: string, results: Record<string, unknown>) =>
    request(`/lab/${orderId}/results`, { method: 'POST', body: JSON.stringify(results) }),
  verifyLabResults: (orderId: string) => request(`/lab/${orderId}/verify`, { method: 'POST' }),

  // Pharmacy
  getPharmacyQueue: () => request<ClinicalOrder[]>('/pharmacy/queue'),
  startPreparePharmacy: (orderId: string) => request(`/pharmacy/${orderId}/prepare`, { method: 'POST' }),
  readyPharmacy: (orderId: string) => request(`/pharmacy/${orderId}/ready`, { method: 'POST' }),
  dispensePharmacy: (orderId: string) => request(`/pharmacy/${orderId}/dispense`, { method: 'POST' }),

  // Chemo
  getChemoChairs: () => request<ChemoSession[]>('/chemo/chairs'),
  assignChemoChair: (encounter_id: string, chair_no: number, protocol_name: string, duration_min = 60) =>
    request<ChemoSession>('/chemo/assign-chair', { method: 'POST', body: JSON.stringify({ encounter_id, chair_no, protocol_name, duration_min }) }),
  startChemoPremed: (sessionId: string) => request(`/chemo/${sessionId}/start-premed`, { method: 'POST' }),
  startChemo: (sessionId: string) => request(`/chemo/${sessionId}/start`, { method: 'POST' }),
  updateChemoProgress: (sessionId: string, progress: number) =>
    request(`/chemo/${sessionId}/progress`, { method: 'PATCH', body: JSON.stringify({ progress }) }),
  callChemoNurse: (sessionId: string, note = '') => request(`/chemo/${sessionId}/call-nurse`, { method: 'POST', body: JSON.stringify({ note }) }),
  completeChemo: (sessionId: string) => request(`/chemo/${sessionId}/complete`, { method: 'POST' }),

  // Radiation
  getRadiationSchedule: () => request<RadiationSession[]>('/radiation/schedule'),
  arriveRadiation: (sessionId: string) => request(`/radiation/${sessionId}/arrive`, { method: 'POST' }),
  startRadiation: (sessionId: string) => request(`/radiation/${sessionId}/start`, { method: 'POST' }),
  completeRadiation: (sessionId: string) => request(`/radiation/${sessionId}/complete`, { method: 'POST' }),
  rescheduleRadiation: (sessionId: string, new_time: string, reason?: string) =>
    request(`/radiation/${sessionId}/reschedule`, { method: 'POST', body: JSON.stringify({ new_time, reason }) }),

  // Operations & Flow Engine
  getOperationsSnapshot: () => request<OperationsSnapshot>('/operations/snapshot'),
  reportBottleneck: (station_code: string, note = '') =>
    request('/operations/bottleneck', { method: 'POST', body: JSON.stringify({ station_code, note }) }),
  acceptRecommendation: (id: string) => request(`/operations/recommendations/${id}/accept`, { method: 'POST' }),
  rejectRecommendation: (id: string) => request(`/operations/recommendations/${id}/reject`, { method: 'POST' }),
  listHelpRequests: () => request<HelpRequest[]>('/operations/help-requests'),
  resolveHelpRequest: (id: string, notes = '') => request(`/operations/help-requests/${id}/resolve`, { method: 'POST', body: JSON.stringify({ notes }) }),

  // Station Queues
  getStationQueue: (stationCode: string) => request<QueueData>(`/stations/${stationCode}/queue`),
  callNext: (stationCode: string) => request<{ queue_item: unknown }>(`/stations/${stationCode}/call-next`, { method: 'POST' }),
  queueAction: (stationCode: string, itemId: string, action: 'start' | 'complete' | 'recall' | 'skip' | 'requeue') =>
    request<{ queue_item: unknown; next_queue_item?: unknown }>(`/stations/${stationCode}/queue/${itemId}/${action}`, { method: 'POST' }),

  // Public Screens & Dev
  getTvBoard: (station?: string) => request<{ serving: unknown[]; waiting: unknown[]; updated_at: string }>(`/tv${station ? `?station=${station}` : ''}`),
  getMapOverview: () => request<Array<{ floor: string; stations: unknown[] }>>('/map/overview'),
  reseed: () => request('/dev/seed', { method: 'POST' }),
}
