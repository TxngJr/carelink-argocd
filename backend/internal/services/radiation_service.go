package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type RadiationService struct{}

func NewRadiationService() *RadiationService {
	return &RadiationService{}
}

func (s *RadiationService) GetSchedule(ctx context.Context) ([]models.RadiationSession, error) {
	cursor, err := db.GetCollection("radiation_sessions").Find(ctx, bson.M{
		"scheduled_time": bson.M{"$gte": time.Now().Truncate(24 * time.Hour)},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var sessions []models.RadiationSession
	if err := cursor.All(ctx, &sessions); err != nil {
		return nil, err
	}

	for i := range sessions {
		var patient models.Patient
		if err := db.GetCollection("patients").FindOne(ctx, bson.M{"_id": sessions[i].PatientID}).Decode(&patient); err == nil {
			sessions[i].Patient = &patient
		}
	}
	return sessions, nil
}

func (s *RadiationService) Start(ctx context.Context, sessionID primitive.ObjectID) error {
	now := time.Now()
	_, err := db.GetCollection("radiation_sessions").UpdateOne(ctx,
		bson.M{"_id": sessionID},
		bson.M{"$set": bson.M{"status": "in_progress", "started_at": now, "updated_at": now}},
	)
	return err
}

func (s *RadiationService) Complete(ctx context.Context, sessionID primitive.ObjectID) error {
	now := time.Now()
	_, err := db.GetCollection("radiation_sessions").UpdateOne(ctx,
		bson.M{"_id": sessionID},
		bson.M{"$set": bson.M{"status": "completed", "completed_at": now}},
	)
	return err
}

func (s *RadiationService) NoShow(ctx context.Context, sessionID primitive.ObjectID) error {
	_, err := db.GetCollection("radiation_sessions").UpdateOne(ctx,
		bson.M{"_id": sessionID},
		bson.M{"$set": bson.M{"status": "no_show"}},
	)
	return err
}

func (s *RadiationService) GetByEncounter(ctx context.Context, encounterID primitive.ObjectID) (*models.RadiationSession, error) {
	var rs models.RadiationSession
	err := db.GetCollection("radiation_sessions").FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&rs)
	if err != nil {
		return nil, err
	}
	return &rs, nil
}

func (s *RadiationService) SeedSchedule(ctx context.Context, encounterID, patientID primitive.ObjectID) error {
	now := time.Now()
	session := models.RadiationSession{
		EncounterID:     encounterID,
		PatientID:       patientID,
		MachineCode:     "RT_L1",
		MachineName:     "TrueBeam",
		FractionCurrent: 12,
		FractionTotal:   25,
		ScheduledTime:   now.Add(2 * time.Hour),
		Status:          "scheduled",
		CreatedAt:       now,
	}
	_, err := db.GetCollection("radiation_sessions").InsertOne(ctx, session)
	return err
}
