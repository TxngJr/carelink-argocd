package services

import (
	"context"
	"fmt"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DoctorService struct {
	FlowEngine *FlowEngineService
}

func NewDoctorService(fe *FlowEngineService) *DoctorService {
	return &DoctorService{FlowEngine: fe}
}

func (s *DoctorService) GetSummary(ctx context.Context, encounterID primitive.ObjectID) (map[string]interface{}, error) {
	result := make(map[string]interface{})

	var enc models.Encounter
	db.GetCollection("encounters").FindOne(ctx, bson.M{"_id": encounterID}).Decode(&enc)
	result["encounter"] = enc

	var patient models.Patient
	db.GetCollection("patients").FindOne(ctx, bson.M{"_id": enc.PatientID}).Decode(&patient)
	result["patient"] = patient

	var ps models.PreScreening
	db.GetCollection("pre_screenings").FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&ps)
	result["pre_screening"] = ps

	var v models.Vitals
	db.GetCollection("vitals").FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&v)
	result["vitals"] = v

	var na models.NursingAssessment
	db.GetCollection("nursing_assessments").FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&na)
	result["nursing_assessment"] = na

	var orders []models.Order
	if cursor, err := db.GetCollection("orders").Find(ctx, bson.M{"encounter_id": encounterID}); err == nil {
		cursor.All(ctx, &orders)
	}
	result["previous_orders"] = orders

	return result, nil
}

func (s *DoctorService) SaveDoctorNote(ctx context.Context, note *models.DoctorNote) error {
	note.CreatedAt = time.Now()
	res, err := db.GetCollection("doctor_notes").InsertOne(ctx, note)
	if err != nil {
		return err
	}
	note.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *DoctorService) CreateOrders(ctx context.Context, orders []models.Order) error {
	for i := range orders {
		orders[i].ID = primitive.NewObjectID()
		orders[i].Status = "ordered"
		orders[i].CreatedAt = time.Now()
		orders[i].UpdatedAt = time.Now()
	}
	docs := make([]interface{}, len(orders))
	for i, o := range orders {
		docs[i] = o
	}
	_, err := db.GetCollection("orders").InsertMany(ctx, docs)
	if err != nil {
		return err
	}

	for _, o := range orders {
		if o.OrderType == "lab" {
			count, _ := db.GetCollection("lab_results").CountDocuments(ctx, bson.M{})
			lr := models.LabResult{
				ID:          primitive.NewObjectID(),
				EncounterID: o.EncounterID,
				PatientID:   o.PatientID,
				OrderID:     o.ID,
				SampleNo:    fmt.Sprintf("LAB-%04d", count+1),
				TestName:    o.OrderName,
				Status:      "pending",
				TATMin:      15,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}
			_, _ = db.GetCollection("lab_results").InsertOne(ctx, lr)
		}
	}
	return nil
}

func (s *DoctorService) ConfirmRoute(ctx context.Context, encounterID primitive.ObjectID, route []string) error {
	var enc models.Encounter
	err := db.GetCollection("encounters").FindOne(ctx, bson.M{"_id": encounterID}).Decode(&enc)
	if err != nil {
		return err
	}

	var routeSteps []models.RouteStep

	// 1. Keep completed steps to preserve history
	for _, step := range enc.Route {
		if step.Status == "completed" {
			routeSteps = append(routeSteps, step)
		}
	}

	// 2. Add the doctor's confirmed route steps (excluding duplicates that were already marked completed)
	for _, code := range route {
		alreadyAdded := false
		for _, step := range routeSteps {
			if step.StationCode == code {
				alreadyAdded = true
				break
			}
		}
		if alreadyAdded {
			continue
		}

		status := "pending"
		var startedAt *time.Time
		if code == enc.CurrentStation {
			status = "in_progress"
			now := time.Now()
			startedAt = &now
		}

		routeSteps = append(routeSteps, models.RouteStep{
			StationCode: code,
			Status:      status,
			StartedAt:   startedAt,
		})
	}

	_, err = db.GetCollection("encounters").UpdateOne(ctx,
		bson.M{"_id": encounterID},
		bson.M{"$set": bson.M{"route": routeSteps, "updated_at": time.Now()}},
	)
	return err
}
