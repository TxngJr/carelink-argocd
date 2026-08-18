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

type EncounterService struct {
	QueueService *QueueService
}

func NewEncounterService(qs *QueueService) *EncounterService {
	return &EncounterService{QueueService: qs}
}

func (s *EncounterService) GetByID(ctx context.Context, id primitive.ObjectID) (*models.Encounter, error) {
	var enc models.Encounter
	err := db.GetCollection("encounters").FindOne(ctx, bson.M{"_id": id}).Decode(&enc)
	if err != nil {
		return nil, err
	}
	return &enc, nil
}

func (s *EncounterService) List(ctx context.Context, filter bson.M) ([]models.Encounter, error) {
	cursor, err := db.GetCollection("encounters").Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var encs []models.Encounter
	if err := cursor.All(ctx, &encs); err != nil {
		return nil, err
	}
	return encs, nil
}

func (s *EncounterService) Create(ctx context.Context, encounter *models.Encounter) error {
	count, _ := db.GetCollection("encounters").CountDocuments(ctx, bson.M{
		"visit_date": bson.M{"$gte": time.Now().Truncate(24 * time.Hour)},
	})
	encounter.EncounterNo = fmt.Sprintf("ENC-%d-%06d", time.Now().Year(), count+1)
	encounter.CreatedAt = time.Now()
	encounter.UpdatedAt = time.Now()
	encounter.Status = "active"
	if encounter.Priority == "" {
		encounter.Priority = "normal"
	}
	res, err := db.GetCollection("encounters").InsertOne(ctx, encounter)
	if err != nil {
		return err
	}
	encounter.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *EncounterService) MoveToStation(ctx context.Context, encounterID primitive.ObjectID, toStation string, userID primitive.ObjectID) error {
	enc, err := s.GetByID(ctx, encounterID)
	if err != nil {
		return err
	}
	fromStation := enc.CurrentStation

	now := time.Now()
	for i, step := range enc.Route {
		if step.StationCode == toStation {
			enc.Route[i].Status = "in_progress"
			enc.Route[i].StartedAt = &now
			enc.Route[i].EstimatedWaitMin = 0
		}
	}

	queueNo, _ := s.QueueService.GenerateQueueNo(ctx, toStation)

	enc.CurrentStation = toStation
	enc.CurrentQueueNo = queueNo
	if toStation == "DH" {
		enc.Status = "completed"
		completedAt := now
		enc.CompletedAt = &completedAt
	}
	enc.UpdatedAt = now

	_, err = db.GetCollection("encounters").UpdateOne(ctx, bson.M{"_id": encounterID}, bson.M{"$set": enc})
	if err != nil {
		return err
	}
	err = s.QueueService.Enqueue(ctx, &models.QueueItem{
		EncounterID: encounterID,
		PatientID:   enc.PatientID,
		StationCode: toStation,
		Status:      "waiting",
		Priority:    enc.Priority,
		QueueNo:     queueNo,
		CreatedAt:   now,
		UpdatedAt:   now,
	})
	if err != nil {
		return err
	}

	db.GetCollection("queue_events").InsertOne(ctx, models.QueueEvent{
		EncounterID: encounterID,
		PatientID:   enc.PatientID,
		StationCode: toStation,
		QueueNo:     queueNo,
		FromStation: fromStation,
		ToStation:   toStation,
		Action:      "move_to_station",
		PerformedBy: userID,
		CreatedAt:   now,
	})

	return nil
}

func (s *EncounterService) CompleteStation(ctx context.Context, encounterID primitive.ObjectID, stationCode string, userID primitive.ObjectID) error {
	enc, err := s.GetByID(ctx, encounterID)
	if err != nil {
		return err
	}

	now := time.Now()
	for i, step := range enc.Route {
		if step.StationCode == stationCode && step.Status == "in_progress" {
			enc.Route[i].Status = "completed"
			enc.Route[i].CompletedAt = &now
		}
	}

	enc.UpdatedAt = now
	_, err = db.GetCollection("encounters").UpdateOne(ctx, bson.M{"_id": encounterID}, bson.M{"$set": enc})
	if err != nil {
		return err
	}

	s.QueueService.CompleteQueueItem(ctx, encounterID, stationCode)

	db.GetCollection("queue_events").InsertOne(ctx, models.QueueEvent{
		EncounterID: encounterID,
		PatientID:   enc.PatientID,
		StationCode: stationCode,
		QueueNo:     enc.CurrentQueueNo,
		FromStation: stationCode,
		ToStation:   stationCode,
		Action:      "complete_station",
		PerformedBy: userID,
		CreatedAt:   now,
	})

	return nil
}

func (s *EncounterService) GetJourney(ctx context.Context, encounterID primitive.ObjectID) (*models.Encounter, error) {
	return s.GetByID(ctx, encounterID)
}

func (s *EncounterService) UpdatePriority(ctx context.Context, encounterID primitive.ObjectID, priority string) error {
	_, err := db.GetCollection("encounters").UpdateOne(ctx,
		bson.M{"_id": encounterID},
		bson.M{"$set": bson.M{"priority": priority, "updated_at": time.Now()}},
	)
	return err
}
