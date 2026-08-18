package seed

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

type SeedData struct{}

func NewSeedData() *SeedData {
	return &SeedData{}
}

var allCollections = []string{
	"users", "stations", "patients", "encounters",
	"queue_items", "queue_events", "pre_screenings", "vitals",
	"nursing_assessments", "doctor_notes", "orders", "lab_results",
	"prescriptions", "chemo_sessions", "radiation_sessions",
	"notifications", "flow_recommendations", "audit_logs",
	"appointment_requests", "daily_counters",
}

// Reset removes demo documents but preserves the indexes created at startup.
func (s *SeedData) Reset() {
	ctx := context.Background()
	for _, name := range allCollections {
		if _, err := db.GetCollection(name).DeleteMany(ctx, bson.M{}); err != nil {
			log.Printf("failed to clear %s: %v", name, err)
		}
	}
	log.Println("All demo collections cleared")
}

func (s *SeedData) Run() {
	ctx := context.Background()

	count, _ := db.GetCollection("users").CountDocuments(ctx, bson.M{})
	if count > 0 {
		log.Println("Seed data already exists, skipping...")
		return
	}

	log.Println("Seeding users...")
	s.seedUsers(ctx)
	log.Println("Seeding stations...")
	s.seedStations(ctx)
	log.Println("Simple CareLink seed created. Register patients from the mobile app.")
}

// seedHistoricalQueueTraffic backfills completed queue_items (with realistic
// call/start/complete timestamps) spread over the past 3 hours, so the
// measured wait-time stats (StatsService) have data to show immediately
// after a reseed instead of falling back to the static estimate on day one.
// These rows use synthetic encounter/patient ids — they only feed
// aggregate stats and never appear in a live queue (status is "completed").
func (s *SeedData) seedHistoricalQueueTraffic(ctx context.Context) {
	stationCodes := []string{
		"NPR", "EV", "VM", "MHT", "PC", "LABC", "LABA", "RC", "TD",
		"CHEMO_PRE", "CHEMO_INF", "PD_VERIFY", "PD_DISP",
	}

	cur, err := db.GetCollection("stations").Find(ctx, bson.M{"code": bson.M{"$in": stationCodes}})
	if err != nil {
		return
	}
	var stations []models.Station
	cur.All(ctx, &stations)
	stationByCode := map[string]models.Station{}
	for _, st := range stations {
		stationByCode[st.Code] = st
	}

	now := time.Now()
	var itemDocs []interface{}
	var eventDocs []interface{}

	for _, code := range stationCodes {
		st, ok := stationByCode[code]
		if !ok {
			continue
		}
		n := 15 + rand.Intn(11) // 15-25 completions
		for i := 0; i < n; i++ {
			createdAt := now.Add(-time.Duration(rand.Intn(180)) * time.Minute)
			calledAt := createdAt.Add(time.Duration(5+rand.Intn(16)) * time.Minute)
			startedAt := calledAt.Add(time.Duration(1+rand.Intn(3)) * time.Minute)

			baseService := st.AverageServiceMin
			if baseService <= 0 {
				baseService = 10
			}
			jitter := baseService/2 + 1
			serviceActual := baseService - jitter + rand.Intn(2*jitter+1)
			if serviceActual < 1 {
				serviceActual = 1
			}
			completedAt := startedAt.Add(time.Duration(serviceActual) * time.Minute)
			if completedAt.After(now) {
				completedAt = now.Add(-time.Duration(rand.Intn(5)) * time.Minute)
				if completedAt.Before(startedAt) {
					completedAt = startedAt.Add(time.Minute)
				}
			}

			encID := primitive.NewObjectID()
			patID := primitive.NewObjectID()
			queueNo := fmt.Sprintf("%s-H%02d", code, i+1)

			itemDocs = append(itemDocs, models.QueueItem{
				QueueNo:     queueNo,
				EncounterID: encID,
				PatientID:   patID,
				StationCode: code,
				Status:      "completed",
				Priority:    "normal",
				CallCount:   1,
				Rank:        createdAt,
				CalledAt:    &calledAt,
				StartedAt:   &startedAt,
				CompletedAt: &completedAt,
				CreatedAt:   createdAt,
				UpdatedAt:   completedAt,
			})

			eventDocs = append(eventDocs,
				models.QueueEvent{EncounterID: encID, PatientID: patID, StationCode: code, QueueNo: queueNo, FromStation: code, ToStation: code, Action: "call", CreatedAt: calledAt},
				models.QueueEvent{EncounterID: encID, PatientID: patID, StationCode: code, QueueNo: queueNo, FromStation: code, ToStation: code, Action: "start", CreatedAt: startedAt},
				models.QueueEvent{EncounterID: encID, PatientID: patID, StationCode: code, QueueNo: queueNo, FromStation: code, ToStation: code, Action: "complete_station", CreatedAt: completedAt},
			)
		}
	}

	if len(itemDocs) > 0 {
		db.GetCollection("queue_items").InsertMany(ctx, itemDocs)
	}
	if len(eventDocs) > 0 {
		db.GetCollection("queue_events").InsertMany(ctx, eventDocs)
	}
}

func hashPassword(password string) string {
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash)
}

func (s *SeedData) seedUsers(ctx context.Context) {
	now := time.Now()
	simpleUsers := []models.User{
		{Username: "nurse", PasswordHash: hashPassword("password123"), Role: "nurse", DisplayName: "พยาบาล CareLink", Department: "พยาบาล", IsActive: true, CreatedAt: now, UpdatedAt: now},
		{Username: "doctor", PasswordHash: hashPassword("password123"), Role: "doctor", DisplayName: "แพทย์ CareLink", Department: "แพทย์", StationCodes: []string{"PC", "PC2", "PC3", "PC4"}, IsActive: true, CreatedAt: now, UpdatedAt: now},
	}
	simpleDocs := make([]interface{}, len(simpleUsers))
	for i, u := range simpleUsers {
		simpleDocs[i] = u
	}
	db.GetCollection("users").InsertMany(ctx, simpleDocs)
}

func (s *SeedData) seedLegacyUsers(ctx context.Context) {
	users := []models.User{
		{Username: "admin", PasswordHash: hashPassword("password123"), Role: "admin", DisplayName: "ผู้ดูแลระบบ", Department: "IT", IsActive: true},
		{Username: "manager", PasswordHash: hashPassword("password123"), Role: "manager", DisplayName: "น.ท.หญิง สมศรี จ.", Department: "บริหาร", IsActive: true},
		{Username: "registration", PasswordHash: hashPassword("password123"), Role: "registration_staff", DisplayName: "นางสาวสมใจ ว.", Department: "ลงทะเบียน", StationCodes: []string{"NPR", "EV"}, IsActive: true},
		{Username: "vitals", PasswordHash: hashPassword("password123"), Role: "vitals_staff", DisplayName: "นางสาวมณี ส.", Department: "จุดตรวจ", StationCodes: []string{"VM"}, IsActive: true},
		{Username: "nurse", PasswordHash: hashPassword("password123"), Role: "nurse", DisplayName: "นางสาวอารี ร.", Department: "พยาบาล", StationCodes: []string{"MHT"}, IsActive: true},
		{Username: "doctor", PasswordHash: hashPassword("password123"), Role: "doctor", DisplayName: "นพ. วิรัช ส.", Department: "Oncology", StationCodes: []string{"PC"}, IsActive: true},
		{Username: "lab", PasswordHash: hashPassword("password123"), Role: "lab_staff", DisplayName: "นางสาวจินดา ล.", Department: "Lab", StationCodes: []string{"LABC", "LABA"}, IsActive: true},
		{Username: "chemo", PasswordHash: hashPassword("password123"), Role: "chemo_staff", DisplayName: "นางสาวประภา ค.", Department: "Chemo", StationCodes: []string{"CHEMO_PRE", "CHEMO_INF"}, IsActive: true},
		{Username: "rt", PasswordHash: hashPassword("password123"), Role: "rt_staff", DisplayName: "นางสาวนภา น.", Department: "Radiation", StationCodes: []string{"RT_L1", "RT_L2"}, IsActive: true},
		{Username: "pharmacy", PasswordHash: hashPassword("password123"), Role: "pharmacy_staff", DisplayName: "เภสัชกร สมบัติ พ.", Department: "Pharmacy", StationCodes: []string{"PD_VERIFY", "PD_DISP"}, IsActive: true},
		{Username: "patient", PasswordHash: hashPassword("password123"), Role: "patient", DisplayName: "สมชาย พ.", Department: "", IsActive: true},
	}

	docs := make([]interface{}, len(users))
	for i, u := range users {
		docs[i] = u
	}
	db.GetCollection("users").InsertMany(ctx, docs)
}

func (s *SeedData) seedStations(ctx context.Context) {
	definitions := []struct {
		Code string
		Name string
		Min  int
		Type string
	}{
		{"NPR", "ลงทะเบียนผู้ป่วย", 8, "admin"},
		{"EV", "ตรวจสอบสิทธิการรักษา", 9, "admin"},
		{"VM", "วัดสัญญาณชีพ", 16, "clinical"},
		{"MHT", "ซักประวัติทางการแพทย์", 21, "clinical"},
		{"PC", "ห้องตรวจแพทย์ 1", 3, "doctor"},
		{"PC2", "ห้องตรวจแพทย์ 2", 28, "doctor"},
		{"PC3", "ห้องตรวจแพทย์ 3", 12, "doctor"},
		{"PC4", "ห้องตรวจแพทย์ 4", 9, "doctor"},
		{"XR", "รังสีวินิจฉัย", 14, "service"},
		{"LAB", "ห้องปฏิบัติการ", 22, "service"},
		{"HEM", "คลินิกโลหิตวิทยา", 11, "service"},
		{"SUR", "คลินิกศัลยกรรมทั่วไป", 13, "service"},
		{"GYN", "คลินิกมะเร็งนรีเวช", 20, "service"},
		{"IR", "งานรังสีร่วมรักษา", 15, "service"},
		{"CHEMO", "คลินิกเคมีบำบัด", 23, "service"},
		{"ENT", "คลินิกหู คอ จมูก", 10, "service"},
		{"BRA", "รังสีรักษาระยะใกล้", 7, "service"},
		{"RT", "งานรังสีรักษา/ฉายแสง", 8, "service"},
		{"OST", "งานออสโตมีและดูแลแผล", 9, "service"},
		{"RC", "พบแพทย์หลังผลตรวจ", 19, "service"},
		{"TD", "วินิจฉัยและวางแผนการรักษา", 12, "service"},
		{"HA", "รับไว้รักษาในโรงพยาบาล", 8, "admit"},
		{"PD", "รับยา", 33, "service"},
		{"DH", "กลับบ้าน", 4, "exit"},
		{"IPW", "หอผู้ป่วยใน", 5, "admit"},
	}
	now := time.Now()
	simpleStations := make([]interface{}, 0, len(definitions))
	for i, d := range definitions {
		simpleStations = append(simpleStations, models.Station{
			Code: d.Code, Name: d.Name, Type: d.Type, Floor: "อาคารผู้ป่วยนอก",
			Capacity: 1, AverageServiceMin: d.Min, IsActive: true,
			CurrentOpenSlots: 1, SortOrder: i + 1, CreatedAt: now, UpdatedAt: now,
		})
	}
	db.GetCollection("stations").InsertMany(ctx, simpleStations)
}

func (s *SeedData) seedLegacyStations(ctx context.Context) {
	stations := []models.Station{
		{Code: "NPR", Name: "ลงทะเบียน", Type: "admin", Floor: "ชั้น 1", Capacity: 3, AverageServiceMin: 5, IsActive: true, CurrentOpenSlots: 3, SortOrder: 1},
		{Code: "EV", Name: "ตรวจสอบสิทธิ", Type: "admin", Floor: "ชั้น 1", Capacity: 2, AverageServiceMin: 5, IsActive: true, CurrentOpenSlots: 2, SortOrder: 2},
		{Code: "VM", Name: "จุดวัดสัญญาณชีพ", Type: "clinical", Floor: "ชั้น 1", Capacity: 4, AverageServiceMin: 8, IsActive: true, CurrentOpenSlots: 4, SortOrder: 3},
		{Code: "MHT", Name: "ซักประวัติ", Type: "clinical", Floor: "ชั้น 2", Capacity: 3, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 3, SortOrder: 4},
		{Code: "PC", Name: "ตรวจโดยแพทย์", Type: "clinical", Floor: "ชั้น 2", Capacity: 5, AverageServiceMin: 20, IsActive: true, CurrentOpenSlots: 5, SortOrder: 5},
		{Code: "LABC", Name: "เก็บตัวอย่าง Lab", Type: "lab", Floor: "ชั้น 1", Capacity: 3, AverageServiceMin: 5, IsActive: true, CurrentOpenSlots: 3, SortOrder: 6},
		{Code: "LABA", Name: "วิเคราะห์ Lab", Type: "lab", Floor: "ชั้น B1", Capacity: 4, AverageServiceMin: 45, IsActive: true, CurrentOpenSlots: 4, SortOrder: 7},
		{Code: "XR", Name: "X-ray", Type: "imaging", Floor: "ชั้น B1", Capacity: 2, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 2, SortOrder: 8},
		{Code: "CT", Name: "CT Scan", Type: "imaging", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 30, IsActive: true, CurrentOpenSlots: 1, SortOrder: 9},
		{Code: "MRI", Name: "MRI / Ultrasound", Type: "imaging", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 40, IsActive: true, CurrentOpenSlots: 1, SortOrder: 10},
		{Code: "IR", Name: "Interventional Radiology", Type: "imaging", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 60, IsActive: true, CurrentOpenSlots: 1, SortOrder: 11},
		{Code: "RC", Name: "ฟังผล / พบแพทย์หลังผลตรวจ", Type: "clinical", Floor: "ชั้น 2", Capacity: 3, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 3, SortOrder: 12},
		{Code: "TD", Name: "ตัดสินใจแผนการรักษา", Type: "clinical", Floor: "ชั้น 2", Capacity: 2, AverageServiceMin: 10, IsActive: true, CurrentOpenSlots: 2, SortOrder: 13},
		{Code: "CHEMO_PRE", Name: "ให้ยาก่อนเคมี", Type: "treatment", Floor: "ชั้น 3", Capacity: 4, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 4, SortOrder: 14},
		{Code: "CHEMO_INF", Name: "ให้เคมีบำบัด", Type: "treatment", Floor: "ชั้น 3", Capacity: 8, AverageServiceMin: 180, IsActive: true, CurrentOpenSlots: 8, SortOrder: 15},
		{Code: "RT_SIM", Name: "จำลองตำแหน่งฉายแสง", Type: "treatment", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 30, IsActive: true, CurrentOpenSlots: 1, SortOrder: 16},
		{Code: "RT_L1", Name: "LINAC เครื่อง 1", Type: "treatment", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 30, IsActive: true, CurrentOpenSlots: 1, SortOrder: 17},
		{Code: "RT_L2", Name: "LINAC เครื่อง 2", Type: "treatment", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 30, IsActive: true, CurrentOpenSlots: 1, SortOrder: 18},
		{Code: "BRA", Name: "ใส่แร่", Type: "treatment", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 45, IsActive: true, CurrentOpenSlots: 1, SortOrder: 19},
		{Code: "SUR", Name: "ปรึกษาศัลยกรรม", Type: "clinical", Floor: "ชั้น 2", Capacity: 2, AverageServiceMin: 20, IsActive: true, CurrentOpenSlots: 2, SortOrder: 20},
		{Code: "OST", Name: "ดูแลประคับประคอง", Type: "clinical", Floor: "ชั้น 2", Capacity: 2, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 2, SortOrder: 21},
		{Code: "PD_VERIFY", Name: "เภสัชตรวจสอบยา", Type: "pharmacy", Floor: "ชั้น 1", Capacity: 2, AverageServiceMin: 10, IsActive: true, CurrentOpenSlots: 2, SortOrder: 22},
		{Code: "PD_DISP", Name: "จ่ายยา", Type: "pharmacy", Floor: "ชั้น 1", Capacity: 3, AverageServiceMin: 8, IsActive: true, CurrentOpenSlots: 3, SortOrder: 23},
		{Code: "DH", Name: "กลับบ้าน", Type: "exit", Floor: "ชั้น 1", Capacity: 99, AverageServiceMin: 2, IsActive: true, CurrentOpenSlots: 99, SortOrder: 24},
	}

	docs := make([]interface{}, len(stations))
	for i, st := range stations {
		docs[i] = st
	}
	db.GetCollection("stations").InsertMany(ctx, docs)
}

func (s *SeedData) seedPatients(ctx context.Context) []primitive.ObjectID {
	now := time.Now()
	patients := []models.Patient{
		{HN: "NG-44821", NationalIDMasked: "********1234", FirstName: "สมชาย", LastName: "พ.", DisplayName: "สมชาย พ.", Gender: "male", Age: 61, BirthDate: now.AddDate(-61, 0, 0), Phone: "0812345678", Province: "อุบลราชธานี", IsOutProvince: false, InsuranceType: "UC", EligibilityStatus: "verified", Allergies: []string{"Penicillin"}, ChronicConditions: []string{"ความดันโลหิตสูง"}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งลำไส้ใหญ่", Stage: "II", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Surgery: "มี.ค. 2025", Chemo: "FOLFOX รอบที่ 3 จาก 6", Radiation: "ไม่มี", ECOG: 1}}},
		{HN: "NG-44822", NationalIDMasked: "********5678", FirstName: "สมหญิง", LastName: "ก.", DisplayName: "สมหญิง ก.", Gender: "female", Age: 55, BirthDate: now.AddDate(-55, 0, 0), Phone: "0823456789", Province: "อุบลราชธานี", IsOutProvince: false, InsuranceType: "UC", EligibilityStatus: "verified", Allergies: []string{}, ChronicConditions: []string{}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งเต้านม", Stage: "III", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Chemo: "AC-T รอบที่ 4 จาก 8", ECOG: 1}}},
		{HN: "NG-44823", NationalIDMasked: "********9012", FirstName: "วิชัย", LastName: "ม.", DisplayName: "วิชัย ม.", Gender: "male", Age: 48, BirthDate: now.AddDate(-48, 0, 0), Phone: "0834567890", Province: "ศรีสะเกษ", IsOutProvince: true, InsuranceType: "UC", EligibilityStatus: "pending", Allergies: []string{"Aspirin"}, ChronicConditions: []string{}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งปอด", Stage: "IV", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Chemo: "Carboplatin + Paclitaxel", ECOG: 2}}},
		{HN: "NG-44824", NationalIDMasked: "********3456", FirstName: "อรุณ", LastName: "บ.", DisplayName: "อรุณ บ.", Gender: "male", Age: 72, BirthDate: now.AddDate(-72, 0, 0), Phone: "0845678901", Province: "อุบลราชธานี", IsOutProvince: false, InsuranceType: "SSI", EligibilityStatus: "verified", Allergies: []string{"Sulfonamide"}, ChronicConditions: []string{"เบาหวาน"}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งต่อมลูกหมาก", Stage: "II", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Radiation: "30 ครั้ง", ECOG: 1}}},
		{HN: "NG-44825", NationalIDMasked: "********7890", FirstName: "พิมพ์ใจ", LastName: "ด.", DisplayName: "พิมพ์ใจ ด.", Gender: "female", Age: 44, BirthDate: now.AddDate(-44, 0, 0), Phone: "0856789012", Province: "อำนาจเจริญ", IsOutProvince: true, InsuranceType: "UC", EligibilityStatus: "verified", Allergies: []string{}, ChronicConditions: []string{}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งปากมดลูก", Stage: "IIA", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Chemo: "Cisplatin + RT", ECOG: 0}}},
		{HN: "NG-44826", NationalIDMasked: "********2345", FirstName: "ประเสริฐ", LastName: "ส.", DisplayName: "ประเสริฐ ส.", Gender: "male", Age: 68, BirthDate: now.AddDate(-68, 0, 0), Phone: "0867890123", Province: "อุบลราชธานี", IsOutProvince: false, InsuranceType: "UC", EligibilityStatus: "verified", Allergies: []string{"Codeine"}, ChronicConditions: []string{"ความดันโลหิตสูง", "ไขมันในเลือดสูง"}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งตับ", Stage: "III", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Chemo: "Sorafenib", ECOG: 2}}},
		{HN: "NG-44827", NationalIDMasked: "********6789", FirstName: "จินดา", LastName: "น.", DisplayName: "จินดา น.", Gender: "female", Age: 39, BirthDate: now.AddDate(-39, 0, 0), Phone: "0878901234", Province: "อุบลราชธานี", IsOutProvince: false, InsuranceType: "UC", EligibilityStatus: "verified", Allergies: []string{}, ChronicConditions: []string{}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งไทรอยด์", Stage: "I", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Surgery: "ต่อมไทรอยด์ทั้งสองข้าง", ECOG: 0}}},
		{HN: "NG-44828", NationalIDMasked: "********0123", FirstName: "บุญมี", LastName: "ช.", DisplayName: "บุญมี ช.", Gender: "male", Age: 57, BirthDate: now.AddDate(-57, 0, 0), Phone: "0889012345", Province: "ยโสธร", IsOutProvince: true, InsuranceType: "UC", EligibilityStatus: "verified", Allergies: []string{"Iodine"}, ChronicConditions: []string{"โรคหัวใจ"}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งหลอดอาหาร", Stage: "III", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Chemo: "FOLFOX", ECOG: 2}}},
		{HN: "NG-44829", NationalIDMasked: "********4567", FirstName: "สุภาพร", LastName: "ท.", DisplayName: "สุภาพร ท.", Gender: "female", Age: 63, BirthDate: now.AddDate(-63, 0, 0), Phone: "0890123456", Province: "อุบลราชธานี", IsOutProvince: false, InsuranceType: "UC", EligibilityStatus: "verified", Allergies: []string{"Morphine"}, ChronicConditions: []string{}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งรังไข่", Stage: "II", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Chemo: "Paclitaxel + Carboplatin", ECOG: 1}}},
		{HN: "NG-44830", NationalIDMasked: "********8901", FirstName: "มนัส", LastName: "ร.", DisplayName: "มนัส ร.", Gender: "male", Age: 51, BirthDate: now.AddDate(-51, 0, 0), Phone: "0801234567", Province: "อุบลราชธานี", IsOutProvince: false, InsuranceType: "UC", EligibilityStatus: "verified", Allergies: []string{}, ChronicConditions: []string{}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งกระเพาะอาหาร", Stage: "III", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Chemo: "XELOX", ECOG: 1}}},
		{HN: "NG-44831", NationalIDMasked: "********2340", FirstName: "นภา", LastName: "ง.", DisplayName: "นภา ง.", Gender: "female", Age: 46, BirthDate: now.AddDate(-46, 0, 0), Phone: "0813456789", Province: "สุรินทร์", IsOutProvince: true, InsuranceType: "UC", EligibilityStatus: "verified", Allergies: []string{}, ChronicConditions: []string{}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งปากมดลูก", Stage: "IB", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Surgery: "Radical Hysterectomy", ECOG: 0}}},
		{HN: "NG-44832", NationalIDMasked: "********6780", FirstName: "สุรชัย", LastName: "ล.", DisplayName: "สุรชัย ล.", Gender: "male", Age: 70, BirthDate: now.AddDate(-70, 0, 0), Phone: "0824567890", Province: "อุบลราชธานี", IsOutProvince: false, InsuranceType: "SSI", EligibilityStatus: "verified", Allergies: []string{"Cephalosporin"}, ChronicConditions: []string{"เบาหวาน"}, Cancer: &models.CancerInfo{Diagnosis: "มะเร็งลำไส้ใหญ่", Stage: "IV", DoctorName: "นพ. วิรัช ส.", TreatmentSummary: &models.TreatmentSummary{Chemo: "FOLFIRI", ECOG: 2}}},
	}

	docs := make([]interface{}, len(patients))
	ids := make([]primitive.ObjectID, len(patients))
	for i := range patients {
		id := primitive.NewObjectID()
		ids[i] = id
		patients[i].ID = id
		patients[i].CreatedAt = now
		patients[i].UpdatedAt = now
		docs[i] = patients[i]
	}
	db.GetCollection("patients").InsertMany(ctx, docs)
	return ids
}

// encounterScenario describes where each seeded patient is right now.
type encounterScenario struct {
	route          []string
	currentStation string // "" = encounter completed (DH)
	priority       string
	flags          []string
	queueStatus    string // status of the queue item at currentStation
	completed      bool
}

var baseRoute = []string{"NPR", "EV", "VM", "MHT", "PC"}

func extended(extra ...string) []string {
	return append(append([]string{}, baseRoute...), extra...)
}

func (s *SeedData) seedEncountersAndQueues(ctx context.Context, patientIDs []primitive.ObjectID) []primitive.ObjectID {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	scenarios := []encounterScenario{
		{route: baseRoute, currentStation: "NPR", priority: "normal", flags: []string{"allergy"}, queueStatus: "waiting"},                                                                  // 0 สมชาย — demo, waiting registration
		{route: baseRoute, currentStation: "VM", priority: "normal", queueStatus: "waiting"},                                                                                               // 1
		{route: baseRoute, currentStation: "MHT", priority: "normal", queueStatus: "waiting"},                                                                                              // 2
		{route: baseRoute, currentStation: "PC", priority: "urgent", flags: []string{"allergy"}, queueStatus: "waiting"},                                                                   // 3
		{route: extended("LABC", "LABA", "RC", "TD", "DH"), currentStation: "LABC", priority: "normal", queueStatus: "waiting"},                                                            // 4 — lab collect
		{route: extended("LABC", "LABA", "RC", "TD", "CHEMO_PRE", "CHEMO_INF", "PD_VERIFY", "PD_DISP", "DH"), currentStation: "CHEMO_INF", priority: "normal", queueStatus: "in_progress"}, // 5 — chemo chair
		{route: extended("RT_SIM", "RT_L1", "DH"), currentStation: "RT_L1", priority: "normal", queueStatus: "waiting"},                                                                    // 6 — radiation
		{route: extended("LABC", "LABA", "RC", "TD", "PD_VERIFY", "PD_DISP", "DH"), currentStation: "PD_VERIFY", priority: "normal", flags: []string{"allergy"}, queueStatus: "waiting"},   // 7 — pharmacy
		{route: extended("DH"), completed: true},                                                                                  // 8 — went home
		{route: baseRoute, currentStation: "NPR", priority: "normal", queueStatus: "waiting"},                                     // 9
		{route: baseRoute, currentStation: "PC", priority: "normal", queueStatus: "waiting"},                                      // 10
		{route: extended("LABC", "LABA", "RC", "TD", "DH"), currentStation: "LABA", priority: "stat", queueStatus: "in_progress"}, // 11 — lab analyzing
	}

	queueSeq := map[string]int{}
	encounterIDs := make([]primitive.ObjectID, 0, len(scenarios))

	for i, sc := range scenarios {
		if i >= len(patientIDs) {
			break
		}
		id := primitive.NewObjectID()
		encounterIDs = append(encounterIDs, id)

		currentIdx := len(sc.route) // completed → beyond the end
		if !sc.completed {
			for j, st := range sc.route {
				if st == sc.currentStation {
					currentIdx = j
					break
				}
			}
		}

		route := make([]models.RouteStep, len(sc.route))
		checkedIn := now.Add(-time.Duration(30+i*7) * time.Minute)
		for j, st := range sc.route {
			step := models.RouteStep{StationCode: st, Status: "pending", EstimatedWaitMin: 10 + j*5}
			if j < currentIdx {
				started := checkedIn.Add(time.Duration(j*12) * time.Minute)
				done := started.Add(10 * time.Minute)
				step.Status = "completed"
				step.StartedAt = &started
				step.CompletedAt = &done
				step.EstimatedWaitMin = 0
			} else if j == currentIdx {
				started := now.Add(-15 * time.Minute)
				step.Status = "in_progress"
				step.StartedAt = &started
				step.EstimatedWaitMin = 0
			}
			route[j] = step
		}

		status := "active"
		currentStation := sc.currentStation
		var completedAt *time.Time
		if sc.completed {
			status = "completed"
			currentStation = "DH"
			t := now.Add(-30 * time.Minute)
			completedAt = &t
		}

		priority := sc.priority
		if priority == "" {
			priority = "normal"
		}

		queueNo := ""
		if !sc.completed {
			queueSeq[currentStation]++
			queueNo = fmt.Sprintf("%s-%02d", currentStation, queueSeq[currentStation])
		}

		enc := models.Encounter{
			ID:             id,
			EncounterNo:    fmt.Sprintf("ENC-%d-%06d", now.Year(), i+1),
			PatientID:      patientIDs[i],
			VisitDate:      today,
			Status:         status,
			Priority:       priority,
			Flags:          sc.flags,
			CurrentStation: currentStation,
			CurrentQueueNo: queueNo,
			Route:          route,
			TotalWaitMin:   15 + i*5,
			TotalVisitMin:  40 + i*10,
			CheckedInAt:    &checkedIn,
			CompletedAt:    completedAt,
			CreatedAt:      checkedIn,
			UpdatedAt:      now,
		}
		db.GetCollection("encounters").InsertOne(ctx, enc)

		if !sc.completed {
			qi := models.QueueItem{
				QueueNo:          queueNo,
				EncounterID:      id,
				PatientID:        patientIDs[i],
				StationCode:      currentStation,
				Status:           sc.queueStatus,
				Priority:         priority,
				EstimatedWaitMin: 5 + i*3,
				CreatedAt:        now.Add(-time.Duration(10+i) * time.Minute),
				UpdatedAt:        now,
			}
			qi.Rank = qi.CreatedAt
			if sc.queueStatus == "in_progress" {
				started := now.Add(-20 * time.Minute)
				qi.StartedAt = &started
			}
			db.GetCollection("queue_items").InsertOne(ctx, qi)
		}
	}

	return encounterIDs
}

func (s *SeedData) seedPreScreenings(ctx context.Context, encounterIDs, patientIDs []primitive.ObjectID) {
	if len(encounterIDs) == 0 {
		return
	}
	ps := models.PreScreening{
		EncounterID:        encounterIDs[0],
		PatientID:          patientIDs[0],
		ChiefComplaint:     "อ่อนเพลีย เบื่ออาหาร 1 สัปดาห์",
		FoodIntake:         "ได้น้อยลง",
		Symptoms:           []string{"อ่อนเพลีย", "เบื่ออาหาร"},
		Allergies:          []string{"Penicillin"},
		CurrentMedications: []string{"Paracetamol", "Omeprazole", "ขมิ้นชัน"},
		HomeVitals:         &models.HomeVitals{SBP: 138, DBP: 86, Pulse: 82, Temperature: 36.8, SPO2: 98, Weight: 64},
		AIRiskLevel:        "medium",
		AISummary:          "มีอ่อนเพลีย เบื่ออาหาร ควรส่งต่อพยาบาลประเมิน",
		SubmittedAt:        time.Now(),
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}
	db.GetCollection("pre_screenings").InsertOne(ctx, ps)
}

func (s *SeedData) seedVitals(ctx context.Context, encounterIDs, patientIDs []primitive.ObjectID) {
	// vitals for patients who already passed the VM station (encounters 2, 3)
	for _, i := range []int{2, 3} {
		if i >= len(encounterIDs) {
			continue
		}
		v := models.Vitals{
			EncounterID:     encounterIDs[i],
			PatientID:       patientIDs[i],
			Source:          "station",
			SBP:             138,
			DBP:             86,
			Pulse:           82,
			Temperature:     36.8,
			SPO2:            98,
			RespiratoryRate: 18,
			Weight:          64,
			Height:          168,
			BMI:             22.7,
			Warnings:        []string{"ความดันสูงเล็กน้อย"},
			RecordedAt:      time.Now().Add(-40 * time.Minute),
			CreatedAt:       time.Now(),
		}
		db.GetCollection("vitals").InsertOne(ctx, v)
	}
}

func (s *SeedData) seedNursingAssessments(ctx context.Context, encounterIDs, patientIDs []primitive.ObjectID) {
	if len(encounterIDs) < 4 {
		return
	}
	na := models.NursingAssessment{
		EncounterID:         encounterIDs[3],
		PatientID:           patientIDs[3],
		ChiefComplaint:      "ปวดหลังส่วนล่าง ปัสสาวะลำบาก",
		PainScore:           4,
		SymptomsReview:      []string{"ปวดหลัง", "ปัสสาวะลำบาก"},
		HPI:                 "อาการเป็นมากขึ้นช่วง 2 สัปดาห์",
		CurrentChemoRegimen: "",
		RegularMedications:  []string{"Metformin 500mg"},
		SmokingStatus:       "former",
		AlcoholStatus:       "never",
		NurseNote:           "ผู้ป่วยสูงอายุ มีความเสี่ยงหกล้ม",
		IsUrgent:            true,
		CreatedAt:           time.Now().Add(-25 * time.Minute),
		UpdatedAt:           time.Now(),
	}
	db.GetCollection("nursing_assessments").InsertOne(ctx, na)
}

func (s *SeedData) seedDoctorNotes(ctx context.Context, encounterIDs, patientIDs []primitive.ObjectID) {
	if len(encounterIDs) < 6 {
		return
	}
	dn := models.DoctorNote{
		EncounterID:     encounterIDs[5],
		PatientID:       patientIDs[5],
		Assessment:      "มะเร็งตับ ระยะ III ตอบสนองต่อการรักษาดี",
		Plan:            "ให้เคมีบำบัดตามแผน ติดตามผลเลือด",
		PreTriage:       &models.PreTriage{Decision: "come_to_hospital", MessageToPatient: "มาตามนัดเพื่อรับเคมีบำบัด"},
		CalculatedRoute: []string{"PC", "LABC", "LABA", "RC", "TD", "CHEMO_PRE", "CHEMO_INF", "PD_VERIFY", "PD_DISP", "DH"},
		CreatedAt:       time.Now().Add(-2 * time.Hour),
	}
	db.GetCollection("doctor_notes").InsertOne(ctx, dn)
}

func (s *SeedData) seedOrdersAndLabResults(ctx context.Context, encounterIDs, patientIDs []primitive.ObjectID) {
	if len(encounterIDs) < 12 {
		return
	}
	now := time.Now()

	// order waiting for sample collection (encounter 4 at LABC)
	cbc := models.Order{
		ID: primitive.NewObjectID(), EncounterID: encounterIDs[4], PatientID: patientIDs[4],
		OrderType: "lab", OrderCode: "CBC", OrderName: "CBC · ความสมบูรณ์เม็ดเลือด",
		TargetStation: "LABC", Priority: "STAT", Status: "ordered",
		ClinicalReason: "ประเมินก่อนให้เคมีรอบถัดไป", CreatedAt: now.Add(-30 * time.Minute), UpdatedAt: now,
	}
	// order being analyzed (encounter 11 at LABA)
	chem := models.Order{
		ID: primitive.NewObjectID(), EncounterID: encounterIDs[11], PatientID: patientIDs[11],
		OrderType: "lab", OrderCode: "CHEM", OrderName: "Chemistry Panel",
		TargetStation: "LABC", Priority: "STAT", Status: "in_progress",
		ClinicalReason: "ติดตามการทำงานของตับและไต", CreatedAt: now.Add(-70 * time.Minute), UpdatedAt: now,
	}
	db.GetCollection("orders").InsertMany(ctx, []interface{}{cbc, chem})

	collected := now.Add(-50 * time.Minute)
	lr := models.LabResult{
		OrderID: chem.ID, EncounterID: encounterIDs[11], PatientID: patientIDs[11],
		SampleNo: "LAB-2451", TestName: "Chemistry Panel", Status: "analyzing",
		TATMin: 38, Results: []models.LabValue{}, CriticalAlert: false,
		ReportedAt: nil, CreatedAt: collected, UpdatedAt: now,
	}
	db.GetCollection("lab_results").InsertOne(ctx, lr)
}

func (s *SeedData) seedChemoSessions(ctx context.Context, encounterIDs, patientIDs []primitive.ObjectID) {
	if len(encounterIDs) < 6 {
		return
	}
	cs := models.ChemoSession{
		EncounterID:           encounterIDs[5],
		PatientID:             patientIDs[5],
		ChairNo:               1,
		Regimen:               "Sorafenib",
		CycleText:             "รอบ 2/4",
		Status:                "infusing",
		ProgressPercent:       62,
		EstimatedRemainingMin: 48,
		StartedAt:             timePtr(time.Now().Add(-80 * time.Minute)),
		CreatedAt:             time.Now(),
	}
	db.GetCollection("chemo_sessions").InsertOne(ctx, cs)
}

func (s *SeedData) seedRadiationSessions(ctx context.Context, encounterIDs, patientIDs []primitive.ObjectID) {
	if len(encounterIDs) < 7 {
		return
	}
	sessions := []interface{}{
		models.RadiationSession{
			EncounterID: encounterIDs[6], PatientID: patientIDs[6],
			MachineCode: "RT_L1", MachineName: "TrueBeam",
			FractionCurrent: 12, FractionTotal: 25,
			ScheduledTime: time.Now().Add(20 * time.Minute), Status: "waiting",
			CreatedAt: time.Now(),
		},
		models.RadiationSession{
			EncounterID: encounterIDs[3], PatientID: patientIDs[3],
			MachineCode: "RT_L2", MachineName: "Halcyon",
			FractionCurrent: 5, FractionTotal: 30,
			ScheduledTime: time.Now().Add(2 * time.Hour), Status: "scheduled",
			CreatedAt: time.Now(),
		},
	}
	db.GetCollection("radiation_sessions").InsertMany(ctx, sessions)
}

func (s *SeedData) seedPrescriptions(ctx context.Context, encounterIDs, patientIDs []primitive.ObjectID) {
	if len(encounterIDs) < 8 {
		return
	}
	now := time.Now()
	prescriptions := []interface{}{
		models.Prescription{
			RxNo: "RX-7841", EncounterID: encounterIDs[7], PatientID: patientIDs[7],
			Items: []models.PrescriptionItem{
				{DrugName: "Ondansetron", Strength: "8mg", Qty: 10, Instruction: "รับประทานครั้งละ 1 เม็ด เมื่อมีอาการคลื่นไส้"},
				{DrugName: "Omeprazole", Strength: "20mg", Qty: 14, Instruction: "รับประทานครั้งละ 1 แคปซูล ก่อนอาหารเช้า"},
			},
			Safety: &models.PrescriptionSafety{AllergyCheck: "pass", InteractionCheck: "pass", Warnings: []string{}},
			Status: "waiting", CreatedAt: now.Add(-20 * time.Minute), UpdatedAt: now,
		},
		models.Prescription{
			RxNo: "RX-7842", EncounterID: encounterIDs[5], PatientID: patientIDs[5],
			Items: []models.PrescriptionItem{
				{DrugName: "Paracetamol", Strength: "500mg", Qty: 20, Instruction: "รับประทานครั้งละ 1 เม็ด ทุก 6 ชั่วโมง"},
			},
			Safety: &models.PrescriptionSafety{AllergyCheck: "pass", InteractionCheck: "warning", Warnings: []string{"อาจมีปฏิกิริยากับ Sorafenib — เภสัชตรวจซ้ำ"}},
			Status: "preparing", CreatedAt: now.Add(-40 * time.Minute), UpdatedAt: now,
		},
	}
	db.GetCollection("prescriptions").InsertMany(ctx, prescriptions)
}

func (s *SeedData) seedFlowRecommendations(ctx context.Context, encounterIDs []primitive.ObjectID) {
	now := time.Now()
	recs := []interface{}{
		models.FlowRecommendation{
			Type:                 "capacity_scaling",
			Title:                "เปิดห้องตรวจแพทย์ (PC) เพิ่ม 1 ห้อง — 11 รายรอ, รอ 38 นาที และเพิ่มขึ้น",
			Description:          "AMIS (GAT-MAPPO) ปรับสด: คาดลดรอ 38 → 22 นาที · เคลียร์แถวเช้า",
			AffectedStationCodes: []string{"PC"},
			Impact:               "high",
			Status:               "pending",
			CreatedBy:            "system",
			ExpectedImpact:       &models.RecommendationImpact{WaitReductionMin: 16, BottleneckReductionPercent: 42},
			CreatedAt:            now,
		},
		models.FlowRecommendation{
			Type:                 "dynamic_station_switching",
			Title:                "ส่งผู้ป่วยเคมีบำบัดเจาะเลือด (LAB) ก่อนเริ่มยา — ผลแล็บกำหนดสูตรเคมี",
			Description:          "คู่เชื่อมแข็งสุดที่ระบบเรียนรู้: เคมี↔แล็บ (0.847) · กันคิวซ้อน",
			AffectedStationCodes: []string{"LABC", "CHEMO_INF"},
			Impact:               "medium",
			Status:               "pending",
			CreatedBy:            "system",
			ExpectedImpact:       &models.RecommendationImpact{WaitReductionMin: 12, BottleneckReductionPercent: 20},
			CreatedAt:            now.Add(-10 * time.Minute),
		},
		models.FlowRecommendation{
			Type:                 "slot_reservation",
			Title:                "จองสล็อตเครื่องฉายแสง (LINAC) ต่อเนื่องสำหรับคอร์สรายวัน — ห้ามขาดช่วง",
			Description:          "ฉายแสงโหลด 95% · คอร์ส median 1 วัน/ครั้ง · QI-MOGA baseline จัดสล็อตล่วงหน้า",
			AffectedStationCodes: []string{"RT_L1", "RT_L2"},
			Impact:               "low",
			Status:               "pending",
			CreatedBy:            "system",
			ExpectedImpact:       &models.RecommendationImpact{WaitReductionMin: 8, BottleneckReductionPercent: 10},
			CreatedAt:            now.Add(-20 * time.Minute),
		},
	}
	db.GetCollection("flow_recommendations").InsertMany(ctx, recs)
}

func timePtr(t time.Time) *time.Time {
	return &t
}

var bulkFirstNamesMale = []string{
	"สมพงษ์", "วีระ", "ชัยยุทธ", "อนันต์", "ไพโรจน์", "ธีรพงศ์", "สุริยา", "กิตติ",
	"ปิยะ", "ณรงค์", "สมบูรณ์", "ยุทธนา", "อดิศักดิ์", "ทวี", "สุชาติ", "เอกชัย",
	"วัชระ", "ประยูร", "สมศักดิ์", "อภิสิทธิ์",
}

var bulkFirstNamesFemale = []string{
	"สมหมาย", "รัตนา", "อรทัย", "ปราณี", "วิไล", "สุนีย์", "กาญจนา", "ธิดา",
	"มาลี", "ศิริพร", "พรทิพย์", "อุไร", "ลัดดา", "จุฑามาศ", "เพ็ญศรี", "สุกัญญา",
	"นงลักษณ์", "วรรณา", "ปิยะดา", "อัมพร",
}

var bulkLastInitials = []string{
	"จ.", "ว.", "อ.", "ป.", "ค.", "ญ.", "ฐ.", "ศ.", "ห.", "ฉ.",
	"ณ.", "ต.", "ย.", "ฟ.", "ผ.", "ธ.", "ฎ.", "ซ.", "ฮ.", "ฑ.",
}

var bulkProvinces = []string{"อุบลราชธานี", "ศรีสะเกษ", "ยโสธร", "อำนาจเจริญ", "สุรินทร์", "ร้อยเอ็ด", "มุกดาหาร", "นครพนม"}

var bulkInsuranceTypes = []string{"UC", "UC", "UC", "SSI", "CSMBS"}

type bulkDiagnosis struct {
	Name   string
	Stages []string
}

var bulkDiagnoses = []bulkDiagnosis{
	{"มะเร็งลำไส้ใหญ่", []string{"I", "II", "III", "IV"}},
	{"มะเร็งเต้านม", []string{"I", "II", "III"}},
	{"มะเร็งปอด", []string{"II", "III", "IV"}},
	{"มะเร็งต่อมลูกหมาก", []string{"I", "II", "III"}},
	{"มะเร็งปากมดลูก", []string{"IB", "IIA", "III"}},
	{"มะเร็งตับ", []string{"II", "III", "IV"}},
	{"มะเร็งไทรอยด์", []string{"I", "II"}},
	{"มะเร็งหลอดอาหาร", []string{"II", "III"}},
	{"มะเร็งรังไข่", []string{"I", "II", "III"}},
	{"มะเร็งกระเพาะอาหาร", []string{"II", "III", "IV"}},
	{"มะเร็งกระเพาะปัสสาวะ", []string{"I", "II", "III"}},
	{"มะเร็งผิวหนัง", []string{"I", "II"}},
}

// bulkRouteTemplate mirrors the hand-seeded scenarios in seedEncountersAndQueues,
// generalized so random patients can be dropped at any progress point along them.
var bulkRouteTemplates = [][]string{
	baseRoute,
	extended("LABC", "LABA", "RC", "TD", "DH"),
	extended("LABC", "LABA", "RC", "TD", "CHEMO_PRE", "CHEMO_INF", "PD_VERIFY", "PD_DISP", "DH"),
	extended("RT_SIM", "RT_L1", "DH"),
	extended("RT_SIM", "RT_L2", "DH"),
	extended("LABC", "LABA", "RC", "TD", "PD_VERIFY", "PD_DISP", "DH"),
	extended("DH"),
}

func pick[T any](items []T) T {
	return items[rand.Intn(len(items))]
}

// SeedBulkPatients adds `count` randomly generated patients + encounters + queue
// items on top of whatever is already in the database, for load/UI testing.
// It never touches existing data and is safe to call repeatedly.
func (s *SeedData) SeedBulkPatients(ctx context.Context, count int) (int, error) {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	hnStart, err := db.GetCollection("patients").CountDocuments(ctx, bson.M{"hn": bson.M{"$regex": "^NG-9"}})
	if err != nil {
		return 0, err
	}
	encStart, err := db.GetCollection("encounters").CountDocuments(ctx, bson.M{"encounter_no": bson.M{"$regex": "^ENC-BULK-"}})
	if err != nil {
		return 0, err
	}

	queueSeq := map[string]int{}

	patientDocs := make([]interface{}, 0, count)
	patientIDs := make([]primitive.ObjectID, 0, count)

	for i := 0; i < count; i++ {
		gender := "male"
		firstName := pick(bulkFirstNamesMale)
		if rand.Intn(2) == 0 {
			gender = "female"
			firstName = pick(bulkFirstNamesFemale)
		}
		lastName := pick(bulkLastInitials)
		age := 25 + rand.Intn(60)
		province := pick(bulkProvinces)
		diag := pick(bulkDiagnoses)
		stage := pick(diag.Stages)

		allergies := []string{}
		if rand.Intn(4) == 0 {
			allergies = []string{pick([]string{"Penicillin", "Aspirin", "Sulfonamide", "Iodine", "Codeine"})}
		}
		chronic := []string{}
		if rand.Intn(3) == 0 {
			chronic = []string{pick([]string{"ความดันโลหิตสูง", "เบาหวาน", "ไขมันในเลือดสูง", "โรคหัวใจ"})}
		}

		id := primitive.NewObjectID()
		patientIDs = append(patientIDs, id)

		hn := fmt.Sprintf("NG-9%04d", int(hnStart)+i+1)
		patientDocs = append(patientDocs, models.Patient{
			ID:                id,
			HN:                hn,
			NationalIDMasked:  fmt.Sprintf("********%04d", rand.Intn(10000)),
			FirstName:         firstName,
			LastName:          lastName,
			DisplayName:       firstName + " " + lastName,
			Gender:            gender,
			Age:               age,
			BirthDate:         now.AddDate(-age, 0, 0),
			Phone:             fmt.Sprintf("08%08d", rand.Intn(100000000)),
			Province:          province,
			IsOutProvince:     province != "อุบลราชธานี",
			InsuranceType:     pick(bulkInsuranceTypes),
			EligibilityStatus: "verified",
			Allergies:         allergies,
			ChronicConditions: chronic,
			Cancer: &models.CancerInfo{
				Diagnosis:  diag.Name,
				Stage:      stage,
				DoctorName: "นพ. วิรัช ส.",
				TreatmentSummary: &models.TreatmentSummary{
					ECOG: rand.Intn(3),
				},
			},
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	encounterDocs := make([]interface{}, 0, count)
	queueDocs := make([]interface{}, 0, count)

	for i, patientID := range patientIDs {
		route := pick(bulkRouteTemplates)
		completed := rand.Intn(5) == 0 // ~20% already discharged today

		currentIdx := len(route)
		if !completed {
			currentIdx = rand.Intn(len(route))
			if route[currentIdx] == "DH" {
				completed = true
			}
		}

		routeSteps := make([]models.RouteStep, len(route))
		checkedIn := now.Add(-time.Duration(20+rand.Intn(240)) * time.Minute)
		for j, st := range route {
			step := models.RouteStep{StationCode: st, Status: "pending", EstimatedWaitMin: 10 + j*5}
			if j < currentIdx || completed {
				started := checkedIn.Add(time.Duration(j*12) * time.Minute)
				done := started.Add(10 * time.Minute)
				step.Status = "completed"
				step.StartedAt = &started
				step.CompletedAt = &done
				step.EstimatedWaitMin = 0
			} else if j == currentIdx {
				started := now.Add(-time.Duration(5+rand.Intn(30)) * time.Minute)
				step.Status = "in_progress"
				step.StartedAt = &started
				step.EstimatedWaitMin = 0
			}
			routeSteps[j] = step
		}

		status := "active"
		currentStation := "DH"
		if !completed {
			currentStation = route[currentIdx]
		}
		var completedAt *time.Time
		if completed {
			status = "completed"
			t := now.Add(-time.Duration(rand.Intn(180)) * time.Minute)
			completedAt = &t
		}

		priority := "normal"
		if r := rand.Intn(20); r == 0 {
			priority = "stat"
		} else if r < 3 {
			priority = "urgent"
		}

		var flags []string
		if rand.Intn(6) == 0 {
			flags = []string{"allergy"}
		}

		queueNo := ""
		if !completed {
			queueSeq[currentStation]++
			queueNo = fmt.Sprintf("B-%s-%02d", currentStation, queueSeq[currentStation])
		}

		encID := primitive.NewObjectID()
		enc := models.Encounter{
			ID:             encID,
			EncounterNo:    fmt.Sprintf("ENC-BULK-%06d", int(encStart)+i+1),
			PatientID:      patientID,
			VisitDate:      today,
			Status:         status,
			Priority:       priority,
			Flags:          flags,
			CurrentStation: currentStation,
			CurrentQueueNo: queueNo,
			Route:          routeSteps,
			TotalWaitMin:   10 + rand.Intn(60),
			TotalVisitMin:  30 + rand.Intn(120),
			CheckedInAt:    &checkedIn,
			CompletedAt:    completedAt,
			CreatedAt:      checkedIn,
			UpdatedAt:      now,
		}
		encounterDocs = append(encounterDocs, enc)

		if !completed {
			qi := models.QueueItem{
				QueueNo:          queueNo,
				EncounterID:      encID,
				PatientID:        patientID,
				StationCode:      currentStation,
				Status:           pick([]string{"waiting", "waiting", "waiting", "in_progress"}),
				Priority:         priority,
				EstimatedWaitMin: 5 + rand.Intn(40),
				CreatedAt:        now.Add(-time.Duration(5+rand.Intn(60)) * time.Minute),
				UpdatedAt:        now,
			}
			qi.Rank = qi.CreatedAt
			queueDocs = append(queueDocs, qi)
		}
	}

	// All docs are built in memory before any writes, so a bug above never leaves
	// partially-written (orphaned) patients or encounters behind.
	if _, err := db.GetCollection("patients").InsertMany(ctx, patientDocs); err != nil {
		return 0, err
	}
	if len(encounterDocs) > 0 {
		if _, err := db.GetCollection("encounters").InsertMany(ctx, encounterDocs); err != nil {
			return 0, err
		}
	}
	if len(queueDocs) > 0 {
		if _, err := db.GetCollection("queue_items").InsertMany(ctx, queueDocs); err != nil {
			return 0, err
		}
	}

	return len(patientDocs), nil
}
