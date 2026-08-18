package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type PatientService struct{}

func NewPatientService() *PatientService {
	return &PatientService{}
}

func (s *PatientService) GetByID(ctx context.Context, id primitive.ObjectID) (*models.Patient, error) {
	var patient models.Patient
	err := db.GetCollection("patients").FindOne(ctx, bson.M{"_id": id}).Decode(&patient)
	if err != nil {
		return nil, err
	}
	return &patient, nil
}

func (s *PatientService) GetByHN(ctx context.Context, hn string) (*models.Patient, error) {
	var patient models.Patient
	err := db.GetCollection("patients").FindOne(ctx, bson.M{"hn": hn}).Decode(&patient)
	if err != nil {
		return nil, err
	}
	return &patient, nil
}

func (s *PatientService) List(ctx context.Context, filter bson.M) ([]models.Patient, error) {
	cursor, err := db.GetCollection("patients").Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var patients []models.Patient
	if err := cursor.All(ctx, &patients); err != nil {
		return nil, err
	}
	return patients, nil
}

func (s *PatientService) Create(ctx context.Context, patient *models.Patient) error {
	patient.CreatedAt = time.Now()
	patient.UpdatedAt = time.Now()
	res, err := db.GetCollection("patients").InsertOne(ctx, patient)
	if err != nil {
		return err
	}
	patient.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *PatientService) Update(ctx context.Context, patient *models.Patient) error {
	patient.UpdatedAt = time.Now()
	_, err := db.GetCollection("patients").UpdateOne(ctx,
		bson.M{"_id": patient.ID},
		bson.M{"$set": patient},
	)
	return err
}
