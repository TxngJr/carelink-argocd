import type {
  Appointment,
  AppointmentMeasurements,
  ActivePatientFlow,
  ClinicalOrder,
  Encounter,
  HelpRequest,
  HelpRequestSubmission,
  InfusionBoard,
  InfusionChair,
  InfusionEvent,
  InfusionSession,
  InfusionTemplate,
  Journey,
  FlowScheduleSlot,
  MapOverview,
  Notice,
  OperationsSnapshot,
  OperationsInsights,
  Patient,
  Previsit,
  PrevisitSubmission,
  PublicUser,
  QueueData,
  TriageSession,
  VitalsRecord,
} from '@/lib/types'
import type { DevelopmentAccount } from '@/lib/development-accounts'

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
  getDevelopmentAccounts: () => request<DevelopmentAccount[]>('/auth/development-accounts'),
  developmentLogin: (username: string) => request<{ token: string; user: PublicUser }>('/auth/development-login', { method: 'POST', body: JSON.stringify({ username }) }),
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

  // Previsit, rule-based symptom screening & Help
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
  registerPatientByStaff: (payload: { display_name: string; phone: string; birth_date: string; insurance_type: string }) =>
    request<Patient>('/registration/patients', { method: 'POST', body: JSON.stringify(payload) }),
  getPatient: (id: string) => request<Patient>(`/patients/${id}`),
  listEncounters: (status?: string) => request<Encounter[]>(`/encounters${status ? `?status=${status}` : ''}`),
  getEncounterDetail: (id: string) => request<Encounter>(`/encounters/${id}`),

  // Vitals
  saveVitals: (encounterId: string, data: Record<string, unknown>) =>
    request<VitalsRecord>(`/vitals/${encounterId}`, { method: 'POST', body: JSON.stringify(data) }),
  getLatestVitals: (encounterId: string) => request<VitalsRecord | null>(`/vitals/${encounterId}/latest`),

  // Lab
  getLabQueue: () => request<ClinicalOrder[]>('/lab/queue'),
  collectLabSample: (orderId: string, version: number) => request<ClinicalOrder>(`/lab/${orderId}/collect`, { method: 'POST', body: JSON.stringify({ version }) }),
  saveLabResults: (orderId: string, version: number, results: Record<string, unknown>) =>
    request<ClinicalOrder>(`/lab/${orderId}/results`, { method: 'POST', body: JSON.stringify({ version, results }) }),
  verifyLabResults: (orderId: string, version: number, reason: string) => request<ClinicalOrder>(`/lab/${orderId}/verify`, { method: 'POST', body: JSON.stringify({ version, reason }) }),

  // Pharmacy
  getPharmacyQueue: () => request<ClinicalOrder[]>('/pharmacy/queue'),
  startPreparePharmacy: (orderId: string, version: number) => request<ClinicalOrder>(`/pharmacy/${orderId}/prepare`, { method: 'POST', body: JSON.stringify({ version }) }),
  readyPharmacy: (orderId: string, version: number) => request<ClinicalOrder>(`/pharmacy/${orderId}/ready`, { method: 'POST', body: JSON.stringify({ version }) }),
  dispensePharmacy: (orderId: string, version: number, reason: string) => request<ClinicalOrder>(`/pharmacy/${orderId}/dispense`, { method: 'POST', body: JSON.stringify({ version, reason }) }),

  // Infusion Lounge
  getInfusionBoard: () => request<InfusionBoard>('/infusion/board'),
  getInfusionTemplates: () => request<InfusionTemplate[]>('/infusion/templates'),
  getInfusionResources: () => request<{ chairs: InfusionChair[]; templates: InfusionTemplate[] }>('/infusion/resources'),
  addInfusionChairs: (count: number, default_duration_min?: number) =>
    request<InfusionChair[]>('/infusion/chairs/bulk', { method: 'POST', body: JSON.stringify({ count, default_duration_min }) }),
  updateInfusionChair: (id: string, payload: Partial<Pick<InfusionChair, 'label' | 'default_duration_min' | 'is_active'>>) =>
    request<InfusionChair>(`/infusion/chairs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  createInfusionTemplate: (payload: Omit<InfusionTemplate, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'is_demo'>) =>
    request<InfusionTemplate>('/infusion/templates', { method: 'POST', body: JSON.stringify(payload) }),
  updateInfusionTemplate: (id: string, payload: Partial<InfusionTemplate>) =>
    request<InfusionTemplate>(`/infusion/templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  callInfusionPatient: (chairId: string, queue_item_id: string, payload: { duration_override_min?: number; override_reason?: string } = {}) =>
    request<InfusionSession>(`/infusion/chairs/${chairId}/call`, { method: 'POST', body: JSON.stringify({ queue_item_id, ...payload }) }),
  startInfusionPhase: (id: string, version: number) =>
    request<InfusionSession>(`/infusion/sessions/${id}/start`, { method: 'POST', body: JSON.stringify({ version }) }),
  pauseInfusion: (id: string, version: number, reason: string) =>
    request<InfusionSession>(`/infusion/sessions/${id}/pause`, { method: 'POST', body: JSON.stringify({ version, reason }) }),
  adjustInfusionTime: (id: string, version: number, delta_min: number, reason: string) =>
    request<InfusionSession>(`/infusion/sessions/${id}/adjust`, { method: 'POST', body: JSON.stringify({ version, delta_min, reason }) }),
  completeInfusionPhase: (id: string, version: number, reason = '') =>
    request<InfusionSession>(`/infusion/sessions/${id}/complete-phase`, { method: 'POST', body: JSON.stringify({ version, reason }) }),
  completeInfusionSession: (id: string, version: number, reason = '') =>
    request<InfusionSession>(`/infusion/sessions/${id}/complete`, { method: 'POST', body: JSON.stringify({ version, reason }) }),
  recallInfusionPatient: (id: string) => request(`/infusion/sessions/${id}/recall`, { method: 'POST' }),
  noShowInfusionPatient: (id: string, reason: string) => request(`/infusion/sessions/${id}/no-show`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getInfusionHistory: (filters: { q?: string; status?: string; from?: string; to?: string } = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])))
    return request<Array<InfusionSession & { events: InfusionEvent[] }>>(`/infusion/history${params.size ? `?${params}` : ''}`)
  },

  // Operations & Flow Engine
  getOperationsSnapshot: () => request<OperationsSnapshot>('/operations/snapshot'),
  getFlowSchedule: () => request<FlowScheduleSlot[]>('/operations/schedule'),
  getActivePatientFlow: () => request<ActivePatientFlow[]>('/operations/active-patients'),
  getOperationsInsights: (from?: string, to?: string) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return request<OperationsInsights>(`/operations/insights${params.size ? `?${params}` : ''}`)
  },
  reportBottleneck: (station_code: string, note = '') =>
    request('/operations/bottleneck', { method: 'POST', body: JSON.stringify({ station_code, note }) }),
  acceptRecommendation: (id: string, version: number, reason: string) => request(`/operations/recommendations/${id}/accept`, { method: 'POST', body: JSON.stringify({ version, reason }) }),
  rejectRecommendation: (id: string, version: number, reason: string) => request(`/operations/recommendations/${id}/reject`, { method: 'POST', body: JSON.stringify({ version, reason }) }),
  listHelpRequests: () => request<HelpRequest[]>('/operations/help-requests'),
  resolveHelpRequest: (id: string, notes = '') => request(`/operations/help-requests/${id}/resolve`, { method: 'POST', body: JSON.stringify({ notes }) }),

  // Station Queues
  getStationQueue: (stationCode: string) => request<QueueData>(`/stations/${stationCode}/queue`),
  callNext: (stationCode: string) => request<{ queue_item: unknown }>(`/stations/${stationCode}/call-next`, { method: 'POST' }),
  queueAction: (stationCode: string, itemId: string, action: 'start' | 'complete' | 'recall' | 'skip' | 'requeue', version: number) =>
    request<{ queue_item: unknown; next_queue_item?: unknown }>(`/stations/${stationCode}/queue/${itemId}/${action}`, { method: 'POST', body: JSON.stringify({ version }) }),

  // Public Screens & Dev
  getTvBoard: (station?: string) => request<{ serving: unknown[]; waiting: unknown[]; updated_at: string }>(`/tv${station ? `?station=${station}` : ''}`),
  getKioskJourney: (identifier: string, birth_date: string) => request<{ patient: Pick<Patient, 'display_name' | 'hn'>; journey: Journey | null }>('/kiosk/lookup', { method: 'POST', body: JSON.stringify({ identifier, birth_date }) }),
  getMapOverview: () => request<MapOverview>('/map/overview'),
}
