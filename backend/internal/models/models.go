package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	Username     string              `bson:"username" json:"username"`
	PasswordHash string              `bson:"password_hash" json:"-"`
	Role         string              `bson:"role" json:"role"`
	DisplayName  string              `bson:"display_name" json:"display_name"`
	Department   string              `bson:"department" json:"department"`
	StationCodes []string            `bson:"station_codes" json:"station_codes"`
	PatientID    *primitive.ObjectID `bson:"patient_id,omitempty" json:"patient_id,omitempty"`
	IsActive     bool                `bson:"is_active" json:"is_active"`
	CreatedAt    time.Time           `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time           `bson:"updated_at" json:"updated_at"`
}

type Patient struct {
	ID                primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	HN                string             `bson:"hn" json:"hn"`
	NationalIDMasked  string             `bson:"national_id_masked" json:"national_id_masked"`
	FirstName         string             `bson:"first_name" json:"first_name"`
	LastName          string             `bson:"last_name" json:"last_name"`
	DisplayName       string             `bson:"display_name" json:"display_name"`
	Gender            string             `bson:"gender" json:"gender"`
	Age               int                `bson:"age" json:"age"`
	BirthDate         time.Time          `bson:"birth_date" json:"birth_date"`
	Phone             string             `bson:"phone" json:"phone"`
	Province          string             `bson:"province" json:"province"`
	IsOutProvince     bool               `bson:"is_out_province" json:"is_out_province"`
	InsuranceType     string             `bson:"insurance_type" json:"insurance_type"`
	EligibilityStatus string             `bson:"eligibility_status" json:"eligibility_status"`
	Allergies         []string           `bson:"allergies" json:"allergies"`
	ChronicConditions []string           `bson:"chronic_conditions" json:"chronic_conditions"`
	Cancer            *CancerInfo        `bson:"cancer,omitempty" json:"cancer,omitempty"`
	CreatedAt         time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt         time.Time          `bson:"updated_at" json:"updated_at"`
}

type CancerInfo struct {
	Diagnosis        string            `bson:"diagnosis" json:"diagnosis"`
	Stage            string            `bson:"stage" json:"stage"`
	DoctorName       string            `bson:"doctor_name" json:"doctor_name"`
	TreatmentSummary *TreatmentSummary `bson:"treatment_summary,omitempty" json:"treatment_summary,omitempty"`
}

type TreatmentSummary struct {
	Surgery   string `bson:"surgery" json:"surgery"`
	Chemo     string `bson:"chemo" json:"chemo"`
	Radiation string `bson:"radiation" json:"radiation"`
	ECOG      int    `bson:"ecog" json:"ecog"`
}

type Encounter struct {
	ID                   primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	EncounterNo          string              `bson:"encounter_no" json:"encounter_no"`
	PatientID            primitive.ObjectID  `bson:"patient_id" json:"patient_id"`
	AppointmentRequestID *primitive.ObjectID `bson:"appointment_request_id,omitempty" json:"appointment_request_id,omitempty"`
	VisitDate            time.Time           `bson:"visit_date" json:"visit_date"`
	AppointmentTime      *time.Time          `bson:"appointment_time,omitempty" json:"appointment_time,omitempty"`
	Status               string              `bson:"status" json:"status"`
	Priority             string              `bson:"priority" json:"priority"`
	Flags                []string            `bson:"flags" json:"flags"`
	CurrentStation       string              `bson:"current_station" json:"current_station"`
	CurrentQueueNo       string              `bson:"current_queue_no" json:"current_queue_no"`
	Route                []RouteStep         `bson:"route" json:"route"`
	DestinationToday     *string             `bson:"destination_today,omitempty" json:"destination_today,omitempty"`
	TotalWaitMin         int                 `bson:"total_wait_min" json:"total_wait_min"`
	TotalVisitMin        int                 `bson:"total_visit_min" json:"total_visit_min"`
	CheckedInAt          *time.Time          `bson:"checked_in_at,omitempty" json:"checked_in_at,omitempty"`
	CompletedAt          *time.Time          `bson:"completed_at,omitempty" json:"completed_at,omitempty"`
	CreatedAt            time.Time           `bson:"created_at" json:"created_at"`
	UpdatedAt            time.Time           `bson:"updated_at" json:"updated_at"`
}

type RouteStep struct {
	ID               primitive.ObjectID `bson:"id" json:"id"`
	StationCode      string             `bson:"station_code" json:"station_code"`
	Status           string             `bson:"status" json:"status"`
	StartedAt        *time.Time         `bson:"started_at,omitempty" json:"started_at,omitempty"`
	CompletedAt      *time.Time         `bson:"completed_at,omitempty" json:"completed_at,omitempty"`
	EstimatedWaitMin int                `bson:"estimated_wait_min" json:"estimated_wait_min"`
}

type PatientMeasurements struct {
	HeightCM *float64 `bson:"height_cm,omitempty" json:"height_cm,omitempty"`
	WeightKG *float64 `bson:"weight_kg,omitempty" json:"weight_kg,omitempty"`
	SBP      *int     `bson:"sbp,omitempty" json:"sbp,omitempty"`
	DBP      *int     `bson:"dbp,omitempty" json:"dbp,omitempty"`
	SPO2     *int     `bson:"spo2,omitempty" json:"spo2,omitempty"`
}

// AppointmentRequest is the single patient-facing lifecycle used by the
// graduation-project workflow: submission, nurse proposal, doctor confirmation,
// arrival/check-in, service, and completion.
type AppointmentRequest struct {
	ID                primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	PatientID         primitive.ObjectID  `bson:"patient_id" json:"patient_id"`
	Patient           *Patient            `bson:"-" json:"patient,omitempty"`
	ChiefComplaint    string              `bson:"chief_complaint" json:"chief_complaint"`
	Measurements      PatientMeasurements `bson:"measurements" json:"measurements"`
	Status            string              `bson:"status" json:"status"`
	AppointmentAt     *time.Time          `bson:"appointment_at,omitempty" json:"appointment_at,omitempty"`
	AssignedPC        string              `bson:"assigned_pc,omitempty" json:"assigned_pc,omitempty"`
	NurseNote         string              `bson:"nurse_note,omitempty" json:"nurse_note,omitempty"`
	DoctorNote        string              `bson:"doctor_note,omitempty" json:"doctor_note,omitempty"`
	CancelReason      string              `bson:"cancel_reason,omitempty" json:"cancel_reason,omitempty"`
	ProposedAt        *time.Time          `bson:"proposed_at,omitempty" json:"proposed_at,omitempty"`
	ConfirmedAt       *time.Time          `bson:"confirmed_at,omitempty" json:"confirmed_at,omitempty"`
	ArrivalReportedAt *time.Time          `bson:"arrival_reported_at,omitempty" json:"arrival_reported_at,omitempty"`
	CheckedInAt       *time.Time          `bson:"checked_in_at,omitempty" json:"checked_in_at,omitempty"`
	EncounterID       *primitive.ObjectID `bson:"encounter_id,omitempty" json:"encounter_id,omitempty"`
	CreatedAt         time.Time           `bson:"created_at" json:"created_at"`
	UpdatedAt         time.Time           `bson:"updated_at" json:"updated_at"`
}

type DailyCounter struct {
	ID    string `bson:"_id" json:"id"`
	Value int    `bson:"value" json:"value"`
}

type Station struct {
	ID                primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Code              string             `bson:"code" json:"code"`
	Name              string             `bson:"name" json:"name"`
	Type              string             `bson:"type" json:"type"`
	Floor             string             `bson:"floor" json:"floor"`
	Capacity          int                `bson:"capacity" json:"capacity"`
	AverageServiceMin int                `bson:"average_service_min" json:"average_service_min"`
	IsActive          bool               `bson:"is_active" json:"is_active"`
	CurrentOpenSlots  int                `bson:"current_open_slots" json:"current_open_slots"`
	SortOrder         int                `bson:"sort_order" json:"sort_order"`
	CreatedAt         time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt         time.Time          `bson:"updated_at" json:"updated_at"`
}

// QueueItem.Status: waiting | called | in_progress | completed | no_show
type QueueItem struct {
	ID               primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	QueueNo          string              `bson:"queue_no" json:"queue_no"`
	EncounterID      primitive.ObjectID  `bson:"encounter_id" json:"encounter_id"`
	PatientID        primitive.ObjectID  `bson:"patient_id" json:"patient_id"`
	Patient          *Patient            `bson:"-" json:"patient,omitempty"`
	Encounter        *Encounter          `bson:"-" json:"encounter,omitempty"`
	StationCode      string              `bson:"station_code" json:"station_code"`
	Status           string              `bson:"status" json:"status"`
	Priority         string              `bson:"priority" json:"priority"`
	AssignedStaffID  *primitive.ObjectID `bson:"assigned_staff_id,omitempty" json:"assigned_staff_id,omitempty"`
	OrderRefID       *primitive.ObjectID `bson:"order_ref_id,omitempty" json:"order_ref_id,omitempty"`
	EstimatedWaitMin int                 `bson:"estimated_wait_min" json:"estimated_wait_min"`
	// Rank orders the queue independent of CreatedAt so a requeue can send a
	// no-show patient to the back of the line without corrupting wait-time stats.
	Rank        time.Time  `bson:"rank" json:"rank"`
	CallCount   int        `bson:"call_count" json:"call_count"`
	SkipCount   int        `bson:"skip_count" json:"skip_count"`
	CalledAt    *time.Time `bson:"called_at,omitempty" json:"called_at,omitempty"`
	StartedAt   *time.Time `bson:"started_at,omitempty" json:"started_at,omitempty"`
	CompletedAt *time.Time `bson:"completed_at,omitempty" json:"completed_at,omitempty"`
	CreatedAt   time.Time  `bson:"created_at" json:"created_at"`
	UpdatedAt   time.Time  `bson:"updated_at" json:"updated_at"`
}

// QueueEvent.Action: move_to_station | call | recall | start | complete_station | no_show | requeue
type QueueEvent struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	EncounterID primitive.ObjectID `bson:"encounter_id" json:"encounter_id"`
	PatientID   primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	StationCode string             `bson:"station_code" json:"station_code"`
	QueueNo     string             `bson:"queue_no" json:"queue_no"`
	FromStation string             `bson:"from_station" json:"from_station"`
	ToStation   string             `bson:"to_station" json:"to_station"`
	Action      string             `bson:"action" json:"action"`
	PerformedBy primitive.ObjectID `bson:"performed_by" json:"performed_by"`
	Note        string             `bson:"note" json:"note"`
	Metadata    map[string]string  `bson:"metadata" json:"metadata"`
	CreatedAt   time.Time          `bson:"created_at" json:"created_at"`
}

type PreScreening struct {
	ID                 primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	EncounterID        primitive.ObjectID `bson:"encounter_id" json:"encounter_id"`
	PatientID          primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	SubmittedAt        time.Time          `bson:"submitted_at" json:"submitted_at"`
	ChiefComplaint     string             `bson:"chief_complaint" json:"chief_complaint"`
	FoodIntake         string             `bson:"food_intake" json:"food_intake"`
	Symptoms           []string           `bson:"symptoms" json:"symptoms"`
	Allergies          []string           `bson:"allergies" json:"allergies"`
	CurrentMedications []string           `bson:"current_medications" json:"current_medications"`
	HomeVitals         *HomeVitals        `bson:"home_vitals,omitempty" json:"home_vitals,omitempty"`
	UploadedFiles      []UploadedFile     `bson:"uploaded_files" json:"uploaded_files"`
	AIRiskLevel        string             `bson:"ai_risk_level" json:"ai_risk_level"`
	AISummary          string             `bson:"ai_summary" json:"ai_summary"`
	CreatedAt          time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt          time.Time          `bson:"updated_at" json:"updated_at"`
}

type HomeVitals struct {
	SBP         int     `bson:"sbp" json:"sbp"`
	DBP         int     `bson:"dbp" json:"dbp"`
	Pulse       int     `bson:"pulse" json:"pulse"`
	Temperature float64 `bson:"temperature" json:"temperature"`
	SPO2        int     `bson:"spo2" json:"spo2"`
	Weight      float64 `bson:"weight" json:"weight"`
}

type UploadedFile struct {
	FileType string `bson:"file_type" json:"file_type"`
	FileName string `bson:"file_name" json:"file_name"`
	URL      string `bson:"url" json:"url"`
}

type Vitals struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	EncounterID     primitive.ObjectID `bson:"encounter_id" json:"encounter_id"`
	PatientID       primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	Source          string             `bson:"source" json:"source"`
	SBP             int                `bson:"sbp" json:"sbp"`
	DBP             int                `bson:"dbp" json:"dbp"`
	Pulse           int                `bson:"pulse" json:"pulse"`
	Temperature     float64            `bson:"temperature" json:"temperature"`
	SPO2            int                `bson:"spo2" json:"spo2"`
	RespiratoryRate int                `bson:"respiratory_rate" json:"respiratory_rate"`
	Weight          float64            `bson:"weight" json:"weight"`
	Height          float64            `bson:"height" json:"height"`
	BMI             float64            `bson:"bmi" json:"bmi"`
	Warnings        []string           `bson:"warnings" json:"warnings"`
	RecordedBy      primitive.ObjectID `bson:"recorded_by" json:"recorded_by"`
	RecordedAt      time.Time          `bson:"recorded_at" json:"recorded_at"`
	CreatedAt       time.Time          `bson:"created_at" json:"created_at"`
}

type NursingAssessment struct {
	ID                  primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	EncounterID         primitive.ObjectID `bson:"encounter_id" json:"encounter_id"`
	PatientID           primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	ChiefComplaint      string             `bson:"chief_complaint" json:"chief_complaint"`
	PainScore           int                `bson:"pain_score" json:"pain_score"`
	SymptomsReview      []string           `bson:"symptoms_review" json:"symptoms_review"`
	HPI                 string             `bson:"hpi" json:"hpi"`
	CurrentChemoRegimen string             `bson:"current_chemo_regimen" json:"current_chemo_regimen"`
	RegularMedications  []string           `bson:"regular_medications" json:"regular_medications"`
	SmokingStatus       string             `bson:"smoking_status" json:"smoking_status"`
	AlcoholStatus       string             `bson:"alcohol_status" json:"alcohol_status"`
	NurseNote           string             `bson:"nurse_note" json:"nurse_note"`
	IsUrgent            bool               `bson:"is_urgent" json:"is_urgent"`
	RecordedBy          primitive.ObjectID `bson:"recorded_by" json:"recorded_by"`
	CreatedAt           time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt           time.Time          `bson:"updated_at" json:"updated_at"`
}

type DoctorNote struct {
	ID                primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	EncounterID       primitive.ObjectID `bson:"encounter_id" json:"encounter_id"`
	PatientID         primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	DoctorID          primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	Assessment        string             `bson:"assessment" json:"assessment"`
	Plan              string             `bson:"plan" json:"plan"`
	PreTriage         *PreTriage         `bson:"pre_triage,omitempty" json:"pre_triage,omitempty"`
	SelectedOrderSets []string           `bson:"selected_order_sets" json:"selected_order_sets"`
	TreatmentChoices  []string           `bson:"treatment_choices" json:"treatment_choices"`
	DestinationToday  *string            `bson:"destination_today,omitempty" json:"destination_today,omitempty"`
	CalculatedRoute   []string           `bson:"calculated_route" json:"calculated_route"`
	CreatedAt         time.Time          `bson:"created_at" json:"created_at"`
}

type PreTriage struct {
	Decision         string `bson:"decision" json:"decision"`
	MessageToPatient string `bson:"message_to_patient" json:"message_to_patient"`
}

type Order struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	EncounterID    primitive.ObjectID `bson:"encounter_id" json:"encounter_id"`
	PatientID      primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	OrderedBy      primitive.ObjectID `bson:"ordered_by" json:"ordered_by"`
	OrderType      string             `bson:"order_type" json:"order_type"`
	OrderCode      string             `bson:"order_code" json:"order_code"`
	OrderName      string             `bson:"order_name" json:"order_name"`
	TargetStation  string             `bson:"target_station" json:"target_station"`
	Priority       string             `bson:"priority" json:"priority"`
	Status         string             `bson:"status" json:"status"`
	ClinicalReason string             `bson:"clinical_reason" json:"clinical_reason"`
	CreatedAt      time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt      time.Time          `bson:"updated_at" json:"updated_at"`
}

type LabResult struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	OrderID       primitive.ObjectID `bson:"order_id" json:"order_id"`
	EncounterID   primitive.ObjectID `bson:"encounter_id" json:"encounter_id"`
	PatientID     primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	Patient       *Patient           `bson:"-" json:"patient,omitempty"`
	SampleNo      string             `bson:"sample_no" json:"sample_no"`
	TestName      string             `bson:"test_name" json:"test_name"`
	Status        string             `bson:"status" json:"status"`
	TATMin        int                `bson:"tat_min" json:"tat_min"`
	Results       []LabValue         `bson:"results" json:"results"`
	CriticalAlert bool               `bson:"critical_alert" json:"critical_alert"`
	RecordedBy    primitive.ObjectID `bson:"recorded_by" json:"recorded_by"`
	ReportedAt    *time.Time         `bson:"reported_at,omitempty" json:"reported_at,omitempty"`
	CreatedAt     time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt     time.Time          `bson:"updated_at" json:"updated_at"`
}

type LabValue struct {
	Name     string  `bson:"name" json:"name"`
	Value    float64 `bson:"value" json:"value"`
	Unit     string  `bson:"unit" json:"unit"`
	Flag     string  `bson:"flag" json:"flag"`
	Critical bool    `bson:"critical" json:"critical"`
}

type Prescription struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	RxNo        string              `bson:"rx_no" json:"rx_no"`
	EncounterID primitive.ObjectID  `bson:"encounter_id" json:"encounter_id"`
	PatientID   primitive.ObjectID  `bson:"patient_id" json:"patient_id"`
	Patient     *Patient            `bson:"-" json:"patient,omitempty"`
	DoctorID    primitive.ObjectID  `bson:"doctor_id" json:"doctor_id"`
	Items       []PrescriptionItem  `bson:"items" json:"items"`
	Safety      *PrescriptionSafety `bson:"safety,omitempty" json:"safety,omitempty"`
	Status      string              `bson:"status" json:"status"`
	CreatedAt   time.Time           `bson:"created_at" json:"created_at"`
	UpdatedAt   time.Time           `bson:"updated_at" json:"updated_at"`
}

type PrescriptionItem struct {
	DrugName    string `bson:"drug_name" json:"drug_name"`
	Strength    string `bson:"strength" json:"strength"`
	Qty         int    `bson:"qty" json:"qty"`
	Instruction string `bson:"instruction" json:"instruction"`
}

type PrescriptionSafety struct {
	AllergyCheck     string   `bson:"allergy_check" json:"allergy_check"`
	InteractionCheck string   `bson:"interaction_check" json:"interaction_check"`
	Warnings         []string `bson:"warnings" json:"warnings"`
}

type ChemoSession struct {
	ID                    primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	EncounterID           primitive.ObjectID `bson:"encounter_id" json:"encounter_id"`
	PatientID             primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	Patient               *Patient           `bson:"-" json:"patient,omitempty"`
	ChairNo               int                `bson:"chair_no" json:"chair_no"`
	Regimen               string             `bson:"regimen" json:"regimen"`
	CycleText             string             `bson:"cycle_text" json:"cycle_text"`
	Status                string             `bson:"status" json:"status"`
	ProgressPercent       int                `bson:"progress_percent" json:"progress_percent"`
	EstimatedRemainingMin int                `bson:"estimated_remaining_min" json:"estimated_remaining_min"`
	StartedAt             *time.Time         `bson:"started_at,omitempty" json:"started_at,omitempty"`
	CompletedAt           *time.Time         `bson:"completed_at,omitempty" json:"completed_at,omitempty"`
	CreatedAt             time.Time          `bson:"created_at" json:"created_at"`
}

type RadiationSession struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	EncounterID     primitive.ObjectID `bson:"encounter_id" json:"encounter_id"`
	PatientID       primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	Patient         *Patient           `bson:"-" json:"patient,omitempty"`
	MachineCode     string             `bson:"machine_code" json:"machine_code"`
	MachineName     string             `bson:"machine_name" json:"machine_name"`
	FractionCurrent int                `bson:"fraction_current" json:"fraction_current"`
	FractionTotal   int                `bson:"fraction_total" json:"fraction_total"`
	ScheduledTime   time.Time          `bson:"scheduled_time" json:"scheduled_time"`
	Status          string             `bson:"status" json:"status"`
	StartedAt       *time.Time         `bson:"started_at,omitempty" json:"started_at,omitempty"`
	CompletedAt     *time.Time         `bson:"completed_at,omitempty" json:"completed_at,omitempty"`
	CreatedAt       time.Time          `bson:"created_at" json:"created_at"`
}

type Notification struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	UserID      *primitive.ObjectID `bson:"user_id,omitempty" json:"user_id,omitempty"`
	PatientID   primitive.ObjectID  `bson:"patient_id" json:"patient_id"`
	EncounterID primitive.ObjectID  `bson:"encounter_id" json:"encounter_id"`
	Channel     string              `bson:"channel" json:"channel"`
	Title       string              `bson:"title" json:"title"`
	Message     string              `bson:"message" json:"message"`
	Type        string              `bson:"type" json:"type"`
	IsRead      bool                `bson:"is_read" json:"is_read"`
	CreatedAt   time.Time           `bson:"created_at" json:"created_at"`
	ReadAt      *time.Time          `bson:"read_at,omitempty" json:"read_at,omitempty"`
}

type FlowRecommendation struct {
	ID                   primitive.ObjectID    `bson:"_id,omitempty" json:"id"`
	Type                 string                `bson:"type" json:"type"`
	Title                string                `bson:"title" json:"title"`
	Description          string                `bson:"description" json:"description"`
	AffectedStationCodes []string              `bson:"affected_station_codes" json:"affected_station_codes"`
	AffectedEncounterIDs []primitive.ObjectID  `bson:"affected_encounter_ids" json:"affected_encounter_ids"`
	Impact               string                `bson:"impact,omitempty" json:"impact,omitempty"` // high | medium | low
	ExpectedImpact       *RecommendationImpact `bson:"expected_impact,omitempty" json:"expected_impact,omitempty"`
	Status               string                `bson:"status" json:"status"`
	CreatedBy            string                `bson:"created_by" json:"created_by"`
	AcceptedBy           *primitive.ObjectID   `bson:"accepted_by,omitempty" json:"accepted_by,omitempty"`
	CreatedAt            time.Time             `bson:"created_at" json:"created_at"`
	ResolvedAt           *time.Time            `bson:"resolved_at,omitempty" json:"resolved_at,omitempty"`
}

type RecommendationImpact struct {
	WaitReductionMin           int `bson:"wait_reduction_min" json:"wait_reduction_min"`
	BottleneckReductionPercent int `bson:"bottleneck_reduction_percent" json:"bottleneck_reduction_percent"`
}

type AuditLog struct {
	ID          primitive.ObjectID     `bson:"_id,omitempty" json:"id"`
	ActorUserID primitive.ObjectID     `bson:"actor_user_id" json:"actor_user_id"`
	Role        string                 `bson:"role" json:"role"`
	Action      string                 `bson:"action" json:"action"`
	EntityType  string                 `bson:"entity_type" json:"entity_type"`
	EntityID    primitive.ObjectID     `bson:"entity_id" json:"entity_id"`
	EncounterID primitive.ObjectID     `bson:"encounter_id" json:"encounter_id"`
	PatientID   primitive.ObjectID     `bson:"patient_id" json:"patient_id"`
	Before      map[string]interface{} `bson:"before,omitempty" json:"before,omitempty"`
	After       map[string]interface{} `bson:"after,omitempty" json:"after,omitempty"`
	IPAddress   string                 `bson:"ip_address" json:"ip_address"`
	CreatedAt   time.Time              `bson:"created_at" json:"created_at"`
}
