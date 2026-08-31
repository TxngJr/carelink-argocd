export type Role =
  | 'admin'
  | 'manager'
  | 'operations'
  | 'nurse'
  | 'doctor'
  | 'physician'
  | 'registration'
  | 'vitals_staff'
  | 'lab_staff'
  | 'pharmacy_staff'
  | 'infusion_staff'
  | 'chemo_staff' // Legacy session/user value; migrated to infusion_staff on startup.
  | 'patient'

export type PublicUser = {
  id: string
  username?: string
  display_name: string
  role: Role
  department?: string
  station_codes?: string[]
  permissions?: string[]
}

export type FlowEstimateSource = 'history' | 'configured_fallback'

export type FlowEstimate = {
  p50_min: number
  p80_min: number
  sample_count: number
  source: FlowEstimateSource
  window_days: number
}

export type FlowPlanSegment = {
  id: string
  encounter_id?: string
  station_code: string
  baseline_start_at: string
  baseline_end_at: string
  adapted_start_at: string
  adapted_end_at: string
  shift_min: number
  reason: string
}

export type FlowState = 'flowing' | 'building' | 'bottleneck' | 'idle'

export type Patient = {
  id: string
  hn: string
  national_id_masked?: string
  first_name?: string
  last_name?: string
  display_name: string
  gender?: string
  age?: number
  birth_date?: string
  phone: string
  province?: string
  is_out_province?: boolean
  insurance_type?: string
  eligibility_status?: string
  allergies?: string[]
  chronic_conditions?: string[]
  created_at?: string
  updated_at?: string
}

export type AppointmentMeasurements = {
  height_cm?: number
  weight_kg?: number
  sbp?: number
  dbp?: number
  spo2?: number
}

export type Appointment = {
  id: string
  patient_id?: string
  patient?: { id?: string; hn?: string; display_name?: string; phone?: string }
  chief_complaint: string
  measurements?: AppointmentMeasurements
  status: string
  appointment_at?: string
  assigned_pc?: string
  nurse_note?: string
  doctor_note?: string
  cancel_reason?: string
  encounter_id?: string
  created_at?: string
  updated_at?: string
}

export type VitalsRecord = {
  id: string
  encounter_id: string
  patient_id: string
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
  triage_level?: 'ESI-1' | 'ESI-2' | 'ESI-3' | 'ESI-4' | 'ESI-5' | 'urgent' | 'normal' | 'fast_track'
  consciousness?: 'alert' | 'voice' | 'pain' | 'unresponsive'
  notes?: string
  recorded_by?: string
  recorded_at?: string
}

export type ClinicalAssessment = {
  id: string
  encounter_id: string
  patient_id: string
  chief_complaint: string
  history_of_illness?: string
  triage_level: string
  is_urgent?: boolean
  is_fast_track?: boolean
  food_intake?: string
  symptoms?: string[]
  nurse_notes?: string
  assessed_by?: string
  assessed_at?: string
}

export type ClinicalNote = {
  id: string
  encounter_id: string
  patient_id: string
  doctor_id: string
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
  icd10_codes?: Array<{ code: string; name: string; is_primary?: boolean }>
  created_at?: string
  updated_at?: string
}

export type OrderItem = {
  id: string
  type: 'lab' | 'imaging' | 'medication' | 'infusion' | 'procedure'
  code: string
  name: string
  quantity?: number
  dosage?: string
  frequency?: string
  route?: string
  instructions?: string
  status: 'ordered' | 'in_progress' | 'sample_collected' | 'analyzed' | 'prepared' | 'ready' | 'dispensed' | 'completed' | 'cancelled'
  results?: string | Record<string, unknown>
  target_station?: string
  service_template_id?: string
  planned_for?: string
  duration_override_min?: number
  readiness_override?: boolean
  readiness_metadata?: {
    requirements: InfusionReadinessRequirement[]
    source: 'service_template'
  }
}

export type ClinicalOrder = {
  id: string
  encounter_id: string
  patient_id: string
  patient?: { hn?: string; display_name?: string }
  doctor_id: string
  order_type: 'lab' | 'imaging' | 'medication' | 'infusion' | 'mixed'
  items: OrderItem[]
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  version?: number
  lab_status?: 'ordered' | 'sample_collected' | 'results_recorded' | 'verified'
  pharmacy_status?: 'waiting' | 'preparing' | 'ready' | 'dispensed'
  notes?: string
  created_at?: string
  updated_at?: string
}

export type LabResultItem = {
  test_name: string
  value: string | number
  unit: string
  ref_range: string
  flag?: 'normal' | 'high' | 'low' | 'critical'
}

export type LabOrder = {
  id: string
  encounter_id: string
  patient_id: string
  patient?: { hn?: string; display_name?: string }
  order_id?: string
  order_item_id?: string
  items: Array<{
    code: string
    name: string
    status: 'ordered' | 'sample_collected' | 'analyzing' | 'completed'
    results?: LabResultItem[]
  }>
  specimen_collected_at?: string
  specimen_collected_by?: string
  analyzed_at?: string
  analyzed_by?: string
  status: 'ordered' | 'sample_collected' | 'analyzing' | 'completed'
  created_at?: string
  updated_at?: string
}

export type PrescriptionItem = {
  drug_code: string
  drug_name: string
  dosage: string
  frequency: string
  route: string
  quantity: number
  instructions: string
}

export type PharmacyPrescription = {
  id: string
  encounter_id: string
  patient_id: string
  patient?: { hn?: string; display_name?: string }
  doctor_id?: string
  items: PrescriptionItem[]
  status: 'pending' | 'reviewing' | 'preparing' | 'ready' | 'dispensed'
  pharmacist_notes?: string
  prepared_by?: string
  dispensed_by?: string
  created_at?: string
  updated_at?: string
}

export type InfusionPhaseKind = 'preparation' | 'premed' | 'infusion' | 'observation'

export type InfusionPhaseTemplate = {
  key: string
  label: string
  kind: InfusionPhaseKind
  duration_min: number
}

export type InfusionReadinessRequirement = 'active_order' | 'lab_verified' | 'medication_ready'

export type InfusionChair = {
  id: string
  code: string
  label: string
  sort_order: number
  default_duration_min?: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type InfusionTemplate = {
  id: string
  code: string
  name: string
  service_kind: 'hydration' | 'iv_medication' | 'chemotherapy'
  phases: InfusionPhaseTemplate[]
  readiness_requirements: InfusionReadinessRequirement[]
  is_active: boolean
  is_demo?: boolean
  created_at?: string
  updated_at?: string
}

export type InfusionPhase = InfusionPhaseTemplate & {
  status: 'pending' | 'active' | 'paused' | 'due' | 'completed'
  effective_duration_sec: number
  remaining_sec: number
  started_at?: string
  completed_at?: string
  paused_at?: string
}

export type InfusionSessionStatus = 'reserved' | 'active' | 'paused' | 'due' | 'completed' | 'no_show' | 'cancelled'

export type InfusionSession = {
  id: string
  chair_id: string
  chair?: InfusionChair
  encounter_id?: string
  queue_item_id?: string
  order_id?: string
  order_item_id?: string
  patient_id: string
  patient?: { hn?: string; display_name?: string }
  template_id?: string
  template_name: string
  service_kind: 'hydration' | 'iv_medication' | 'chemotherapy'
  status: InfusionSessionStatus
  phases: InfusionPhase[]
  current_phase_index: number
  planned_duration_sec: number
  remaining_sec: number
  progress_percent: number
  version: number
  reserved_at?: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at?: string
}

export type InfusionQueueEntry = QueueItem & {
  order_id?: string
  order_item_id?: string
  template_id?: string
  template_name?: string
  service_kind?: 'hydration' | 'iv_medication' | 'chemotherapy'
  planned_for?: string
  duration_override_min?: number
  readiness: {
    ready: boolean
    requirements: Array<{ key: InfusionReadinessRequirement; ready: boolean; label: string }>
    overridden?: boolean
    override_reason?: string
  }
}

export type InfusionEvent = {
  id: string
  session_id?: string
  chair_id?: string
  queue_item_id?: string
  action: string
  reason?: string
  performed_by?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export type InfusionBoard = {
  server_now: string
  chairs: Array<InfusionChair & { session?: InfusionSession }>
  queue: InfusionQueueEntry[]
  planned: InfusionQueueEntry[]
  suggested_next?: InfusionQueueEntry
  templates: InfusionTemplate[]
  kpis: {
    active_chairs: number
    total_chairs: number
    infusing: number
    due: number
    waiting: number
  }
}

export type RouteStep = {
  id?: string
  station_code: string
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  started_at?: string
  completed_at?: string
  estimated_wait_min?: number
  baseline_start_at?: string
  baseline_end_at?: string
  adapted_start_at?: string
  adapted_end_at?: string
  shift_min?: number
  adaptation_reason?: string
}

export type Encounter = {
  id: string
  encounter_no: string
  patient_id: string
  patient?: Patient
  appointment_request_id?: string
  visit_date: string
  appointment_time?: string
  status: 'active' | 'completed' | 'cancelled'
  priority: 'normal' | 'urgent' | 'fast_track'
  flags?: string[]
  current_station: string
  current_queue_no: string
  route: RouteStep[]
  total_wait_min: number
  total_visit_min: number
  checked_in_at: string
  completed_at?: string
  created_at: string
  updated_at: string
}

export type QueueItem = {
  id: string
  queue_no: string
  encounter_id: string
  patient_id: string
  station_code: string
  status: 'waiting' | 'called' | 'in_progress' | 'completed' | 'no_show'
  priority?: 'normal' | 'urgent' | 'fast_track'
  estimated_wait_min?: number
  call_count?: number
  skip_count?: number
  assigned_staff_id?: string
  rank?: string
  called_at?: string
  started_at?: string
  completed_at?: string
  patient?: { hn?: string; display_name?: string }
  encounter?: { encounter_no?: string; priority?: string; current_station?: string }
  created_at?: string
  updated_at?: string
  version?: number
}

export type QueueData = {
  items: QueueItem[]
  now_serving: QueueItem[]
  counts: { waiting: number; called: number; in_progress: number; no_show?: number }
}

export type Journey = {
  encounter?: { id: string; encounter_no?: string; status: string; priority?: string }
  patient?: { hn?: string; display_name?: string }
  current_station?: string
  station_name?: string
  station_floor?: string
  next_station?: string
  next_station_name?: string
  next_station_floor?: string
  queue_no?: string
  queue_status?: string
  queue_ahead?: number
  est_wait_min?: number
  est_wait_band?: number
  wait_source?: string
  flow_status?: 'flowing' | 'building' | 'bottleneck' | 'idle'
  now_serving_queue_no?: string
  step_current?: number
  step_total?: number
  route?: RouteStep[]
  updated_at?: string
}

export type PrevisitSubmission = {
  chief_complaint: string
  food_intake?: string
  symptoms?: string[]
  allergies?: string[]
  current_medications?: string[]
  herbal_medications?: string[]
  payer?: string
  contact_phone?: string
  referral_status?: string
  home_vitals?: {
    sbp?: number
    dbp?: number
    pulse?: number
    temperature?: number
    spo2?: number
    weight?: number
  }
}

export type Previsit = PrevisitSubmission & {
  id?: string
  patient_id: string
  state?: string
  submitted_at?: string
  verified_at?: string
  created_at?: string
  updated_at?: string
}

export type TriageMessage = {
  id?: string
  role: 'patient' | 'system' | 'assistant'
  content: string
  created_at?: string
}

export type TriageSession = {
  id: string
  patient_id: string
  status: 'active' | 'submitted'
  messages: TriageMessage[]
  summary?: string
  recommended_specialty?: string
  safety_flags?: string[]
  created_at?: string
  updated_at?: string
}

export type HelpRequestSubmission = {
  category: 'directions' | 'queue' | 'clinical' | 'other'
  message: string
}

export type HelpRequest = HelpRequestSubmission & {
  id: string
  patient_id: string
  patient?: { hn?: string; display_name?: string; phone?: string }
  current_station?: string
  status: 'pending' | 'in_review' | 'resolved'
  staff_notes?: string
  created_at: string
  updated_at?: string
}

export type Notice = {
  id: string
  title: string
  message: string
  type?: string
  is_read: boolean
  created_at: string
}

export type FlowEngineRecommendation = {
  id: string
  station_code: string
  station_name: string
  type: 'load_balance' | 'open_counter' | 'expedite' | 'staff_assist'
  title: string
  reason: string
  action_label: string
  status: 'pending' | 'accepted' | 'rejected' | 'dismissed'
  version?: number
  decision_reason?: string
  decided_by?: string
  resolved_at?: string
  created_at: string
}

export type FlowRecommendationDecision = {
  recommendation_id: string
  decision: 'accepted' | 'rejected'
  actor_id: string
  reason: string
  version: number
  decided_at: string
}

export type StationFlowStatus = {
  code: string
  name: string
  floor: string
  state: FlowState
  waiting_count: number
  in_progress_count: number
  capacity: number
  avg_service_min: number
  est_wait_min: number
  est_wait_p80_min: number
  estimate: FlowEstimate
  queue_pressure: number
  throughput_per_hour: number
}

export type OperationsSnapshot = {
  server_now: string
  generated_at: string
  data_window: { days: number; from: string; to: string }
  kpis: {
    total_patients_today: number
    active_now: number
    completed_today: number
    avg_total_visit_min: number
    avg_wait_min: number
    bottleneck_station_count: number
  }
  stations: StationFlowStatus[]
  recommendations: FlowEngineRecommendation[]
  hourly_flow?: Array<{ hour: string; arrivals: number; discharges: number }>
}

export type FlowScheduleSlot = {
  id: string
  encounter_id?: string
  appointment_id?: string
  patient?: { hn?: string; display_name?: string }
  station_code: string
  station_name: string
  status: 'planned' | 'waiting' | 'called' | 'in_progress' | 'completed'
  baseline_start_at: string
  baseline_end_at: string
  adapted_start_at: string
  adapted_end_at: string
  shift_min: number
  reason: string
}

export type ActivePatientFlow = {
  id: string
  encounter_no: string
  patient: { hn?: string; display_name?: string }
  priority: 'normal' | 'urgent' | 'fast_track'
  current_station: string
  station_name: string
  queue_no: string
  queue_status: QueueItem['status'] | ''
  waiting_since?: string
  est_wait_min: number
  est_wait_p80_min: number
  route: RouteStep[]
  updated_at: string
}

export type OperationsInsights = {
  generated_at: string
  from: string
  to: string
  totals: {
    arrivals: number
    completed: number
    completion_rate_percent: number
    avg_visit_min: number
    avg_wait_min: number
  }
  hourly_flow: Array<{ hour: string; arrivals: number; discharges: number }>
  station_performance: StationFlowStatus[]
}

export type MapMovement = {
  from_station: string
  to_station: string
  patient_count: number
}

export type MapOverview = {
  generated_at: string
  floors: Array<{ floor: string; stations: StationFlowStatus[] }>
  movements: MapMovement[]
}

export type RealtimeEnvelope = {
  id: string
  channel: string
  type: string
  payload: unknown
  timestamp: string
}
