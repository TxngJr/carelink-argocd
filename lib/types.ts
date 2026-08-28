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
  | 'chemo_staff'
  | 'rt_staff'
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
  type: 'lab' | 'imaging' | 'medication' | 'chemo' | 'radiation' | 'procedure'
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
}

export type ClinicalOrder = {
  id: string
  encounter_id: string
  patient_id: string
  patient?: { hn?: string; display_name?: string }
  doctor_id: string
  order_type: 'lab' | 'imaging' | 'medication' | 'chemo' | 'radiation' | 'mixed'
  items: OrderItem[]
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
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

export type ChemoSession = {
  id: string
  encounter_id: string
  patient_id: string
  patient?: { hn?: string; display_name?: string }
  chair_no: number
  protocol_name: string
  cycle_no: number
  total_cycles?: number
  premed_completed: boolean
  progress_percent: number
  total_duration_min: number
  remaining_min: number
  nurse_call: boolean
  nurse_call_note?: string
  status: 'assigned' | 'premed' | 'infusing' | 'paused' | 'completed'
  started_at?: string
  completed_at?: string
  created_at?: string
}

export type RadiationSession = {
  id: string
  encounter_id?: string
  patient_id: string
  patient?: { hn?: string; display_name?: string }
  machine_code: 'RT_SIM' | 'RT_L1' | 'RT_L2' | 'BRA'
  machine_name: string
  fraction_no: number
  total_fractions: number
  dose_gy: number
  scheduled_time: string
  status: 'scheduled' | 'arrived' | 'in_progress' | 'completed' | 'rescheduled' | 'no_show'
  notes?: string
  therapist_id?: string
  started_at?: string
  completed_at?: string
  created_at?: string
}

export type RouteStep = {
  id?: string
  station_code: string
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  started_at?: string
  completed_at?: string
  estimated_wait_min?: number
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
  created_at: string
}

export type StationFlowStatus = {
  code: string
  name: string
  floor: string
  state: 'flowing' | 'building' | 'bottleneck' | 'idle'
  waiting_count: number
  in_progress_count: number
  capacity: number
  avg_service_min: number
  est_wait_min: number
  throughput_per_hour: number
}

export type OperationsSnapshot = {
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
