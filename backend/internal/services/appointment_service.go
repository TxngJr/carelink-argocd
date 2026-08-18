package services

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	ErrAppointmentConflict   = errors.New("สถานะคำขอไม่ถูกต้อง")
	ErrAppointmentValidation = errors.New("ข้อมูลคำขอไม่ถูกต้อง")
)

var activeAppointmentStatuses = []string{
	"submitted", "nurse_proposed", "confirmed", "arrival_reported",
	"checked_in", "in_service",
}

type AppointmentService struct {
	Queue         *QueueService
	Notifications *NotificationService
}

func NewAppointmentService(queue *QueueService, notifications *NotificationService) *AppointmentService {
	return &AppointmentService{Queue: queue, Notifications: notifications}
}

func (s *AppointmentService) PatientIDForUser(ctx context.Context, userID primitive.ObjectID) (primitive.ObjectID, error) {
	var user models.User
	if err := db.GetCollection("users").FindOne(ctx, bson.M{"_id": userID, "role": "patient"}).Decode(&user); err != nil || user.PatientID == nil {
		return primitive.NilObjectID, mongo.ErrNoDocuments
	}
	return *user.PatientID, nil
}

func validateMeasurements(m models.PatientMeasurements) error {
	if (m.SBP == nil) != (m.DBP == nil) {
		return errors.New("กรุณากรอกความดันตัวบนและตัวล่างให้ครบทั้งคู่")
	}
	if m.HeightCM != nil && (*m.HeightCM < 50 || *m.HeightCM > 250) {
		return errors.New("ส่วนสูงต้องอยู่ระหว่าง 50–250 ซม.")
	}
	if m.WeightKG != nil && (*m.WeightKG < 2 || *m.WeightKG > 500) {
		return errors.New("น้ำหนักต้องอยู่ระหว่าง 2–500 กก.")
	}
	if m.SBP != nil && (*m.SBP < 40 || *m.SBP > 300 || *m.DBP < 20 || *m.DBP > 200) {
		return errors.New("ค่าความดันอยู่นอกช่วงที่ระบบรับได้")
	}
	if m.SPO2 != nil && (*m.SPO2 < 50 || *m.SPO2 > 100) {
		return errors.New("SpO2 ต้องอยู่ระหว่าง 50–100")
	}
	return nil
}

func (s *AppointmentService) Create(ctx context.Context, patientID primitive.ObjectID, complaint string, measurements models.PatientMeasurements) (*models.AppointmentRequest, error) {
	complaint = strings.TrimSpace(complaint)
	if complaint == "" {
		return nil, errors.New("กรุณาระบุอาการสำคัญ")
	}
	if err := validateMeasurements(measurements); err != nil {
		return nil, err
	}
	n, err := db.GetCollection("appointment_requests").CountDocuments(ctx, bson.M{
		"patient_id": patientID,
		"status":     bson.M{"$in": activeAppointmentStatuses},
	})
	if err != nil {
		return nil, err
	}
	if n > 0 {
		return nil, ErrAppointmentConflict
	}
	now := time.Now()
	req := &models.AppointmentRequest{
		ID:             primitive.NewObjectID(),
		PatientID:      patientID,
		ChiefComplaint: complaint,
		Measurements:   measurements,
		Status:         "submitted",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	_, err = db.GetCollection("appointment_requests").InsertOne(ctx, req)
	if mongo.IsDuplicateKeyError(err) {
		return nil, ErrAppointmentConflict
	}
	return req, err
}

func (s *AppointmentService) GetCurrent(ctx context.Context, patientID primitive.ObjectID) (*models.AppointmentRequest, error) {
	var req models.AppointmentRequest
	err := db.GetCollection("appointment_requests").FindOne(ctx,
		bson.M{"patient_id": patientID},
		options.FindOne().SetSort(bson.D{{Key: "created_at", Value: -1}}),
	).Decode(&req)
	return &req, err
}

func (s *AppointmentService) UpdateSubmission(ctx context.Context, id, patientID primitive.ObjectID, complaint string, measurements models.PatientMeasurements) (*models.AppointmentRequest, error) {
	complaint = strings.TrimSpace(complaint)
	if complaint == "" {
		return nil, errors.New("กรุณาระบุอาการสำคัญ")
	}
	if err := validateMeasurements(measurements); err != nil {
		return nil, err
	}
	var out models.AppointmentRequest
	err := db.GetCollection("appointment_requests").FindOneAndUpdate(ctx,
		bson.M{"_id": id, "patient_id": patientID, "status": "submitted"},
		bson.M{"$set": bson.M{"chief_complaint": complaint, "measurements": measurements, "updated_at": time.Now()}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrAppointmentConflict
	}
	return &out, err
}

func (s *AppointmentService) Cancel(ctx context.Context, id, patientID primitive.ObjectID, reason string) error {
	res, err := db.GetCollection("appointment_requests").UpdateOne(ctx,
		bson.M{"_id": id, "patient_id": patientID, "status": bson.M{"$in": []string{"submitted", "nurse_proposed", "confirmed"}}},
		bson.M{"$set": bson.M{"status": "cancelled", "cancel_reason": strings.TrimSpace(reason), "updated_at": time.Now()}},
	)
	if err == nil && res.MatchedCount == 0 {
		return ErrAppointmentConflict
	}
	return err
}

func (s *AppointmentService) CancelByStaff(ctx context.Context, id primitive.ObjectID, reason string) error {
	res, err := db.GetCollection("appointment_requests").UpdateOne(ctx,
		bson.M{"_id": id, "status": bson.M{"$in": []string{"submitted", "nurse_proposed", "confirmed"}}},
		bson.M{"$set": bson.M{"status": "cancelled", "cancel_reason": strings.TrimSpace(reason), "updated_at": time.Now()}},
	)
	if err == nil && res.MatchedCount == 0 {
		return ErrAppointmentConflict
	}
	return err
}

func sameBangkokDay(a, b time.Time) bool {
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		loc = time.Local
	}
	ay, am, ad := a.In(loc).Date()
	by, bm, bd := b.In(loc).Date()
	return ay == by && am == bm && ad == bd
}

func (s *AppointmentService) ReportArrival(ctx context.Context, id, patientID primitive.ObjectID) (*models.AppointmentRequest, error) {
	var current models.AppointmentRequest
	if err := db.GetCollection("appointment_requests").FindOne(ctx, bson.M{"_id": id, "patient_id": patientID}).Decode(&current); err != nil {
		return nil, err
	}
	if current.Status == "arrival_reported" || current.Status == "checked_in" || current.Status == "in_service" || current.Status == "completed" {
		return &current, nil
	}
	if current.Status != "confirmed" || current.AppointmentAt == nil || !sameBangkokDay(*current.AppointmentAt, time.Now()) {
		return nil, ErrAppointmentConflict
	}
	now := time.Now()
	current.Status = "arrival_reported"
	current.ArrivalReportedAt = &now
	current.UpdatedAt = now
	_, err := db.GetCollection("appointment_requests").UpdateOne(ctx,
		bson.M{"_id": id, "status": "confirmed"},
		bson.M{"$set": bson.M{"status": current.Status, "arrival_reported_at": now, "updated_at": now}},
	)
	return &current, err
}

func (s *AppointmentService) List(ctx context.Context, status string) ([]models.AppointmentRequest, error) {
	filter := bson.M{}
	if status != "" {
		filter["status"] = status
	}
	cur, err := db.GetCollection("appointment_requests").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var rows []models.AppointmentRequest
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	for i := range rows {
		var patient models.Patient
		if db.GetCollection("patients").FindOne(ctx, bson.M{"_id": rows[i].PatientID}).Decode(&patient) == nil {
			rows[i].Patient = &patient
		}
	}
	return rows, nil
}

func (s *AppointmentService) Get(ctx context.Context, id primitive.ObjectID) (*models.AppointmentRequest, error) {
	var req models.AppointmentRequest
	if err := db.GetCollection("appointment_requests").FindOne(ctx, bson.M{"_id": id}).Decode(&req); err != nil {
		return nil, err
	}
	var patient models.Patient
	if db.GetCollection("patients").FindOne(ctx, bson.M{"_id": req.PatientID}).Decode(&patient) == nil {
		req.Patient = &patient
	}
	return &req, nil
}

func (s *AppointmentService) Propose(ctx context.Context, id primitive.ObjectID, appointmentAt time.Time, note string) (*models.AppointmentRequest, error) {
	if appointmentAt.Before(time.Now()) {
		return nil, errors.New("วันนัดต้องไม่เป็นอดีต")
	}
	now := time.Now()
	var out models.AppointmentRequest
	err := db.GetCollection("appointment_requests").FindOneAndUpdate(ctx,
		bson.M{"_id": id, "status": "submitted"},
		bson.M{"$set": bson.M{"status": "nurse_proposed", "appointment_at": appointmentAt, "nurse_note": strings.TrimSpace(note), "proposed_at": now, "updated_at": now}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrAppointmentConflict
	}
	if err == nil {
		_ = s.notify(ctx, out, "พยาบาลเสนอวันนัด", "กรุณารอแพทย์ยืนยันวันนัด", "appointment_proposed")
	}
	return &out, err
}

func validPC(code string) bool {
	return code == "PC" || code == "PC2" || code == "PC3" || code == "PC4"
}

func (s *AppointmentService) Confirm(ctx context.Context, id primitive.ObjectID, appointmentAt time.Time, pc, note string) (*models.AppointmentRequest, error) {
	if appointmentAt.Before(time.Now()) {
		return nil, errors.New("วันนัดต้องไม่เป็นอดีต")
	}
	if !validPC(pc) {
		return nil, errors.New("กรุณาเลือกห้องตรวจ PC–PC4")
	}
	now := time.Now()
	var out models.AppointmentRequest
	err := db.GetCollection("appointment_requests").FindOneAndUpdate(ctx,
		bson.M{"_id": id, "status": "nurse_proposed"},
		bson.M{"$set": bson.M{"status": "confirmed", "appointment_at": appointmentAt, "assigned_pc": pc, "doctor_note": strings.TrimSpace(note), "confirmed_at": now, "updated_at": now}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrAppointmentConflict
	}
	if err == nil {
		_ = s.notify(ctx, out, "ยืนยันวันนัดแล้ว", "แพทย์ยืนยันวันและเวลานัดของคุณแล้ว", "appointment_confirmed")
	}
	return &out, err
}

func routeSteps(codes []string) []models.RouteStep {
	steps := make([]models.RouteStep, len(codes))
	for i, code := range codes {
		steps[i] = models.RouteStep{ID: primitive.NewObjectID(), StationCode: code, Status: "pending"}
	}
	return steps
}

func (s *AppointmentService) ConfirmCheckIn(ctx context.Context, id primitive.ObjectID) (*models.AppointmentRequest, error) {
	session, err := db.Client.StartSession()
	if err != nil {
		return nil, err
	}
	defer session.EndSession(ctx)
	var result *models.AppointmentRequest
	_, err = session.WithTransaction(ctx, func(sessionContext mongo.SessionContext) (interface{}, error) {
		var transactionErr error
		result, transactionErr = s.confirmCheckIn(sessionContext, id)
		return nil, transactionErr
	})
	return result, err
}

func (s *AppointmentService) confirmCheckIn(ctx context.Context, id primitive.ObjectID) (*models.AppointmentRequest, error) {
	req, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if req.EncounterID != nil {
		return req, nil
	}
	if req.Status != "arrival_reported" || !validPC(req.AssignedPC) {
		return nil, ErrAppointmentConflict
	}
	now := time.Now()
	encID := primitive.NewObjectID()
	codes := []string{"NPR", "EV", "VM", "MHT", req.AssignedPC}
	steps := routeSteps(codes)
	steps[0].Status = "in_progress"
	steps[0].StartedAt = &now
	queueNo, err := s.Queue.GenerateQueueNo(ctx, "NPR")
	if err != nil {
		return nil, err
	}
	enc := &models.Encounter{
		ID:                   encID,
		EncounterNo:          "VIS-" + now.Format("20060102-150405"),
		PatientID:            req.PatientID,
		AppointmentRequestID: &req.ID,
		VisitDate:            now,
		Status:               "active",
		Priority:             "normal",
		CurrentStation:       "NPR",
		CurrentQueueNo:       queueNo,
		Route:                steps,
		CheckedInAt:          &now,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	if _, err := db.GetCollection("encounters").InsertOne(ctx, enc); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return s.Get(ctx, id)
		}
		return nil, err
	}
	item := &models.QueueItem{
		QueueNo: queueNo, EncounterID: encID, PatientID: req.PatientID,
		StationCode: "NPR", Status: "waiting", Priority: "normal",
		Rank: now, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.Queue.Enqueue(ctx, item); err != nil {
		_, _ = db.GetCollection("encounters").DeleteOne(ctx, bson.M{"_id": encID})
		return nil, err
	}
	res, err := db.GetCollection("appointment_requests").UpdateOne(ctx,
		bson.M{"_id": id, "status": "arrival_reported", "encounter_id": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"status": "checked_in", "encounter_id": encID, "checked_in_at": now, "updated_at": now}},
	)
	if err != nil || res.ModifiedCount == 0 {
		_, _ = db.GetCollection("queue_items").DeleteOne(ctx, bson.M{"encounter_id": encID})
		_, _ = db.GetCollection("encounters").DeleteOne(ctx, bson.M{"_id": encID})
		if err != nil {
			return nil, err
		}
		return s.Get(ctx, id)
	}
	req.Status = "checked_in"
	req.EncounterID = &encID
	req.CheckedInAt = &now
	_ = s.notify(ctx, *req, "เช็กอินสำเร็จ", "คุณได้รับคิว "+queueNo+" ที่จุดลงทะเบียน", "checked_in")
	if item.EstimatedWaitMin <= 16 {
		_ = s.notify(ctx, *req, "ใกล้ถึงคิวแล้ว", "ขณะนี้มีผู้ป่วยข้างหน้าคุณไม่เกิน 2 คิวที่จุดลงทะเบียน", "queue_near")
	}
	return req, nil
}

func (s *AppointmentService) notify(ctx context.Context, req models.AppointmentRequest, title, message, kind string) error {
	return s.Notifications.Create(ctx, &models.Notification{
		PatientID: req.PatientID, Channel: "in_app", Title: title,
		Message: message, Type: kind, IsRead: false,
	})
}

var optionalRouteCodes = map[string]bool{
	"XR": true, "LAB": true, "HEM": true, "SUR": true, "GYN": true,
	"IR": true, "CHEMO": true, "ENT": true, "BRA": true, "RT": true,
	"OST": true, "RC": true, "TD": true, "PD": true,
}

func validateDoctorRoute(codes []string) error {
	if len(codes) == 0 {
		return errors.New("กรุณาเลือกปลายทางของ visit")
	}
	seen := map[string]bool{}
	for i, code := range codes {
		if seen[code] {
			return errors.New("ห้ามเลือก Station ซ้ำ")
		}
		seen[code] = true
		isLast := i == len(codes)-1
		if code == "DH" {
			if !isLast {
				return errors.New("DH ต้องเป็น Station สุดท้าย")
			}
			continue
		}
		if code == "HA" {
			if i != len(codes)-2 || codes[i+1] != "IPW" {
				return errors.New("HA ต้องตามด้วย IPW เพื่อจบ visit")
			}
			continue
		}
		if code == "IPW" {
			if !isLast || i == 0 || codes[i-1] != "HA" {
				return errors.New("IPW ต้องอยู่หลัง HA และเป็น Station สุดท้าย")
			}
			continue
		}
		if !optionalRouteCodes[code] {
			return errors.New("Station ในเส้นทางไม่ถูกต้อง")
		}
	}
	last := codes[len(codes)-1]
	if last != "DH" && last != "IPW" {
		return errors.New("Route ต้องจบที่ DH หรือ HA → IPW")
	}
	return nil
}

func (s *AppointmentService) SetDoctorRoute(ctx context.Context, encounterID primitive.ObjectID, codes []string) (*models.Encounter, error) {
	if err := validateDoctorRoute(codes); err != nil {
		return nil, err
	}
	var enc models.Encounter
	if err := db.GetCollection("encounters").FindOne(ctx, bson.M{"_id": encounterID, "status": "active"}).Decode(&enc); err != nil {
		return nil, err
	}
	if !validPC(enc.CurrentStation) {
		return nil, ErrAppointmentConflict
	}
	// A route may be edited while the patient is still at PC, but previously
	// completed prefix steps are preserved.
	prefix := make([]models.RouteStep, 0, len(enc.Route)+len(codes))
	for _, step := range enc.Route {
		prefix = append(prefix, step)
		if step.StationCode == enc.CurrentStation {
			break
		}
	}
	prefix = append(prefix, routeSteps(codes)...)
	_, err := db.GetCollection("encounters").UpdateOne(ctx,
		bson.M{"_id": encounterID, "current_station": enc.CurrentStation},
		bson.M{"$set": bson.M{"route": prefix, "updated_at": time.Now()}},
	)
	enc.Route = prefix
	return &enc, err
}
