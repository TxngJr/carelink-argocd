package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ChemoService struct{}

func NewChemoService() *ChemoService {
	return &ChemoService{}
}

func (s *ChemoService) GetChairs(ctx context.Context) ([]models.ChemoSession, error) {
	cursor, err := db.GetCollection("chemo_sessions").Find(ctx, bson.M{
		"status": bson.M{"$in": []string{"preparing", "pre_medication", "infusing", "completed"}},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var sessions []models.ChemoSession
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

func (s *ChemoService) AssignChair(ctx context.Context, cs *models.ChemoSession) error {
	cs.Status = "preparing"
	cs.ProgressPercent = 0
	cs.CreatedAt = time.Now()
	res, err := db.GetCollection("chemo_sessions").InsertOne(ctx, cs)
	if err != nil {
		return err
	}
	cs.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *ChemoService) Start(ctx context.Context, sessionID primitive.ObjectID) error {
	now := time.Now()
	_, err := db.GetCollection("chemo_sessions").UpdateOne(ctx,
		bson.M{"_id": sessionID},
		bson.M{"$set": bson.M{"status": "infusing", "started_at": now, "progress_percent": 0, "updated_at": now}},
	)
	return err
}

func (s *ChemoService) UpdateProgress(ctx context.Context, sessionID primitive.ObjectID, progress int) error {
	remaining := (100 - progress) * 2
	_, err := db.GetCollection("chemo_sessions").UpdateOne(ctx,
		bson.M{"_id": sessionID},
		bson.M{"$set": bson.M{"progress_percent": progress, "estimated_remaining_min": remaining, "updated_at": time.Now()}},
	)
	return err
}

func (s *ChemoService) Complete(ctx context.Context, sessionID primitive.ObjectID) error {
	now := time.Now()
	_, err := db.GetCollection("chemo_sessions").UpdateOne(ctx,
		bson.M{"_id": sessionID},
		bson.M{"$set": bson.M{"status": "completed", "progress_percent": 100, "completed_at": now, "updated_at": now}},
	)
	return err
}

func (s *ChemoService) GetByEncounter(ctx context.Context, encounterID primitive.ObjectID) (*models.ChemoSession, error) {
	var cs models.ChemoSession
	err := db.GetCollection("chemo_sessions").FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&cs)
	if err != nil {
		return nil, err
	}
	return &cs, nil
}
