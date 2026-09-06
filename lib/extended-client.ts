export class ExtendedApiError extends Error {
  constructor(message: string, public code = 'API_ERROR', public status = 500) {
    super(message)
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api/extended/${path.replace(/^\//, '')}`, { ...options, headers, credentials: 'same-origin' })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new ExtendedApiError(payload?.error?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ', payload?.error?.code || 'API_ERROR', response.status)
  }
  return payload.data as T
}

export type RichPatientInput = {
  display_name: string
  phone: string
  birth_date: string
  insurance_type: string
  national_id_masked?: string
  gender?: string
  province?: string
  district?: string
  sub_district?: string
  address?: string
  insurance_no?: string
  referral_hospital?: string
  referral_status?: 'not_required' | 'pending' | 'valid' | 'missing'
  emergency_contact?: string
  caregiver_name?: string
}

export type PatientSummary = RichPatientInput & {
  id: string
  hn?: string
  eligibility_status?: string
  allergies?: string[]
  is_out_province?: boolean
  created_at?: string
  updated_at?: string
}

export type ClinicalPatient = {
  id?: string
  hn?: string
  display_name?: string
  phone?: string
  gender?: string
  birth_date?: string
  insurance_type?: string
  province?: string
  allergies?: string[]
  chronic_conditions?: string[]
}

export type ClinicalVitals = {
  sbp?: number
  dbp?: number
  pulse?: number
  temperature?: number
  respiratory_rate?: number
  spo2?: number
  weight_kg?: number
  height_cm?: number
  bmi?: number
  pain_score?: number
  consciousness?: string
  triage_level?: string
  notes?: string
  recorded_at?: string
}

export type ClinicalPrevisit = {
  chief_complaint?: string
  allergies?: string[]
  current_medications?: string[]
  herbal_medications?: string[]
  chronic_conditions?: string[] | string
  food_intake?: string
  nausea_vomiting?: string
  fever_history?: string
  fatigue?: string
  address?: string
  province?: string
  preferred_language?: string
  caregiver_name?: string
  caregiver_phone?: string
  special_needs?: string
  [key: string]: unknown
}

export type ClinicalContext = {
  encounter: Record<string, unknown> | null
  patient: ClinicalPatient | null
  vitals: ClinicalVitals | null
  previsit: ClinicalPrevisit | null
  assessment: Record<string, unknown> | null
  note: Record<string, unknown> | null
  orders: Array<Record<string, unknown>>
}

export type SafetyFlag = { severity: 'block' | 'warning' | 'info'; kind: 'allergy' | 'interaction' | 'dose'; message: string }
export type PharmacySafety = {
  order_id: string
  patient: { id?: string; hn?: string; display_name?: string; allergies?: string[] } | null
  flags: SafetyFlag[]
  blocked: boolean
  latest_review?: { decision?: string; note?: string; created_at?: string } | null
  disclaimer: string
}

export type AdminOverview = {
  users: number
  patients: number
  active_encounters: number
  open_orders: number
  stations: Array<{ id?: string; code: string; name: string; floor?: string; room?: string; capacity?: number; average_service_min?: number }>
  infusion_chairs: Array<{ id: string; code?: string; label?: string; is_active?: boolean }>
  audit_count: number
  environment: string
}

export type AuditRow = { id: string; actor_role?: string; method?: string; action?: string; created_at?: string }
export type HistoricalInsight = {
  source: string
  scope: string
  summary: { mean_baseline_wait_min: number; mean_adapted_wait_min: number; improvement_percent: number }
  stations: Array<{ code: string; label: string; baseline_wait_min: number; adapted_wait_min: number; group: string }>
}
export type MethodologyInfo = {
  mode: string
  deployed_model: boolean
  statement: string
  baseline: string
  adapted: string
  research_adapter: string
  excluded_modules: string[]
}
export type ExtendedPrevisitBundle = { patient: Record<string, unknown> | null; previsit: Record<string, unknown> | null }

export const extendedClient = {
  findPatientDuplicates: (q: string, birthDate = '') => request<PatientSummary[]>(`registration/duplicates?q=${encodeURIComponent(q)}&birth_date=${encodeURIComponent(birthDate)}`),
  registerRichPatient: (payload: RichPatientInput) => request<PatientSummary>('registration/patients', { method: 'POST', body: JSON.stringify(payload) }),
  updateEligibility: (patientId: string, payload: Record<string, unknown>) => request<PatientSummary>(`registration/patients/${patientId}/eligibility`, { method: 'PATCH', body: JSON.stringify(payload) }),
  getClinicalContext: (encounterId: string) => request<ClinicalContext>(`clinical/context/${encounterId}`),
  saveExtendedAssessment: (encounterId: string, payload: Record<string, unknown>) => request<Record<string, unknown>>(`clinical/assessment/${encounterId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getPharmacySafety: (orderId: string) => request<PharmacySafety>(`pharmacy/${orderId}/safety`),
  savePharmacyReview: (orderId: string, payload: { decision: 'approved' | 'override' | 'rejected'; note: string }) => request<Record<string, unknown>>(`pharmacy/${orderId}/review`, { method: 'POST', body: JSON.stringify(payload) }),
  getAdminOverview: () => request<AdminOverview>('admin/overview'),
  getAudit: (q = '') => request<AuditRow[]>(`admin/audit?q=${encodeURIComponent(q)}`),
  resetDemo: () => request<{ status?: string; message?: string; cleared_collections?: number }>('admin/demo-reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET_DEMO' }) }),
  getHistoricalInsights: () => request<HistoricalInsight>('analytics/historical'),
  getExtendedPrevisit: () => request<ExtendedPrevisitBundle>('patient/previsit'),
  saveExtendedPrevisit: (payload: Record<string, unknown>) => request<Record<string, unknown>>('patient/previsit', { method: 'PUT', body: JSON.stringify(payload) }),
  getMethodology: () => request<MethodologyInfo>('analytics/methodology'),
}
