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

type PharmacyService struct{}

func NewPharmacyService() *PharmacyService {
	return &PharmacyService{}
}

func (s *PharmacyService) GetQueue(ctx context.Context) ([]models.Prescription, error) {
	cursor, err := db.GetCollection("prescriptions").Find(ctx, bson.M{
		"status": bson.M{"$in": []string{"waiting", "preparing", "pharmacist_review", "ready_to_dispense"}},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var prescriptions []models.Prescription
	if err := cursor.All(ctx, &prescriptions); err != nil {
		return nil, err
	}

	for i := range prescriptions {
		var patient models.Patient
		if err := db.GetCollection("patients").FindOne(ctx, bson.M{"_id": prescriptions[i].PatientID}).Decode(&patient); err == nil {
			prescriptions[i].Patient = &patient
		}
	}
	return prescriptions, nil
}

func (s *PharmacyService) CreatePrescription(ctx context.Context, rx *models.Prescription) error {
	rx.Status = "waiting"
	rx.CreatedAt = time.Now()
	rx.UpdatedAt = time.Now()

	count, _ := db.GetCollection("prescriptions").CountDocuments(ctx, bson.M{})
	rx.RxNo = fmt.Sprintf("RX-%04d", count+1)

	safety := s.CheckSafety(ctx, rx)
	rx.Safety = safety

	res, err := db.GetCollection("prescriptions").InsertOne(ctx, rx)
	if err != nil {
		return err
	}
	rx.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *PharmacyService) CheckSafety(ctx context.Context, rx *models.Prescription) *models.PrescriptionSafety {
	safety := &models.PrescriptionSafety{
		AllergyCheck:     "pass",
		InteractionCheck: "pass",
		Warnings:         []string{},
	}

	var patient models.Patient
	err := db.GetCollection("patients").FindOne(ctx, bson.M{"_id": rx.PatientID}).Decode(&patient)
	if err != nil {
		return safety
	}

	for _, item := range rx.Items {
		for _, allergy := range patient.Allergies {
			if containsDrugAllergy(item.DrugName, allergy) {
				safety.AllergyCheck = "warning"
				safety.Warnings = append(safety.Warnings, fmt.Sprintf("ระวัง: ผู้ป่วยแพ้ %s ยา %s อาจมีปัญหา", allergy, item.DrugName))
			}
		}
	}

	if len(safety.Warnings) == 0 {
		safety.Warnings = []string{}
	}

	return safety
}

func containsDrugAllergy(drugName, allergy string) bool {
	drug := toLowerCase(drugName)
	allergyLower := toLowerCase(allergy)
	return contains(drug, allergyLower) || contains(allergyLower, drug)
}

func toLowerCase(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 32
		}
		result[i] = c
	}
	return string(result)
}

func contains(s, substr string) bool {
	return len(substr) <= len(s) && (s == substr || len(substr) == 0 || (len(s) > 0 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func (s *PharmacyService) StartPrepare(ctx context.Context, rxID primitive.ObjectID) error {
	_, err := db.GetCollection("prescriptions").UpdateOne(ctx,
		bson.M{"_id": rxID},
		bson.M{"$set": bson.M{"status": "preparing", "updated_at": time.Now()}},
	)
	return err
}

func (s *PharmacyService) Review(ctx context.Context, rxID primitive.ObjectID) error {
	_, err := db.GetCollection("prescriptions").UpdateOne(ctx,
		bson.M{"_id": rxID},
		bson.M{"$set": bson.M{"status": "pharmacist_review", "updated_at": time.Now()}},
	)
	return err
}

func (s *PharmacyService) Ready(ctx context.Context, rxID primitive.ObjectID) error {
	_, err := db.GetCollection("prescriptions").UpdateOne(ctx,
		bson.M{"_id": rxID},
		bson.M{"$set": bson.M{"status": "ready_to_dispense", "updated_at": time.Now()}},
	)
	return err
}

func (s *PharmacyService) Dispense(ctx context.Context, rxID primitive.ObjectID) error {
	_, err := db.GetCollection("prescriptions").UpdateOne(ctx,
		bson.M{"_id": rxID},
		bson.M{"$set": bson.M{"status": "dispensed", "updated_at": time.Now()}},
	)
	return err
}

func (s *PharmacyService) GetByEncounter(ctx context.Context, encounterID primitive.ObjectID) (*models.Prescription, error) {
	var rx models.Prescription
	err := db.GetCollection("prescriptions").FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&rx)
	if err != nil {
		return nil, err
	}
	return &rx, nil
}
