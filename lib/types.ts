export type Role = 'nurse' | 'doctor' | 'patient'

export type PublicUser = {
  id: string
  username?: string
  display_name: string
  role: Role
  department?: string
  station_codes?: string[]
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

export type QueueItem = {
  id: string
  queue_no: string
  encounter_id: string
  patient_id: string
  station_code: string
  status: 'waiting' | 'called' | 'in_progress' | 'completed' | 'no_show'
  estimated_wait_min?: number
  call_count?: number
  skip_count?: number
  patient?: { hn?: string; display_name?: string }
}

export type QueueData = {
  items: QueueItem[]
  now_serving: QueueItem[]
  counts: { waiting: number; called: number; in_progress: number }
}

export type Journey = {
  encounter?: { id: string; status: string }
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
  estimated_wait?: number
  now_serving_queue_no?: string
  step_current?: number
  step_total?: number
  route?: Array<{ id?: string; station_code: string; status: string }>
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
