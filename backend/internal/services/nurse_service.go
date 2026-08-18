package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type NurseService struct{}

func NewNurseService() *NurseService {
	return &NurseService{}
}

func (s *NurseService) GetAssessment(ctx context.Context, encounterID primitive.ObjectID) (*models.NursingAssessment, error) {
	var na models.NursingAssessment
	err := db.GetCollection("nursing_assessments").FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&na)
	if err != nil {
		return nil, err
	}
	return &na, nil
}

func (s *NurseService) CreateAssessment(ctx context.Context, na *models.NursingAssessment) error {
	na.CreatedAt = time.Now()
	na.UpdatedAt = time.Now()
	res, err := db.GetCollection("nursing_assessments").InsertOne(ctx, na)
	if err != nil {
		return err
	}
	na.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *NurseService) GetWorkup(ctx context.Context, encounterID primitive.ObjectID) (map[string]interface{}, error) {
	result := make(map[string]interface{})

	var patient models.Patient
	var enc models.Encounter
	var v models.Vitals
	var ps models.PreScreening

	encCol := db.GetCollection("encounters")
	patCol := db.GetCollection("patients")
	vitCol := db.GetCollection("vitals")
	psCol := db.GetCollection("pre_screenings")

	encCol.FindOne(ctx, bson.M{"_id": encounterID}).Decode(&enc)
	patCol.FindOne(ctx, bson.M{"_id": enc.PatientID}).Decode(&patient)
	vitCol.FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&v)
	psCol.FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&ps)

	result["patient"] = patient
	result["encounter"] = enc
	result["vitals"] = v
	result["pre_screening"] = ps

	return result, nil
}
