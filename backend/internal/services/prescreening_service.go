package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type PreScreeningService struct {
	AI *AIService
}

func NewPreScreeningService(ai *AIService) *PreScreeningService {
	return &PreScreeningService{AI: ai}
}

func (s *PreScreeningService) Create(ctx context.Context, ps *models.PreScreening) error {
	riskLevel, summary := s.AI.ScreenSymptoms(ps.Symptoms, ps.ChiefComplaint)
	ps.AIRiskLevel = riskLevel
	ps.AISummary = summary
	ps.SubmittedAt = time.Now()
	ps.CreatedAt = time.Now()
	ps.UpdatedAt = time.Now()

	res, err := db.GetCollection("pre_screenings").InsertOne(ctx, ps)
	if err != nil {
		return err
	}
	ps.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *PreScreeningService) GetByEncounter(ctx context.Context, encounterID primitive.ObjectID) (*models.PreScreening, error) {
	var ps models.PreScreening
	err := db.GetCollection("pre_screenings").FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&ps)
	if err != nil {
		return nil, err
	}
	return &ps, nil
}

func (s *PreScreeningService) GetByPatient(ctx context.Context, patientID primitive.ObjectID) (*models.PreScreening, error) {
	var ps models.PreScreening
	err := db.GetCollection("pre_screenings").FindOne(ctx, bson.M{"patient_id": patientID}).Decode(&ps)
	if err != nil {
		return nil, err
	}
	return &ps, nil
}
