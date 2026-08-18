package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type AuditService struct{}

func NewAuditService() *AuditService {
	return &AuditService{}
}

func (s *AuditService) Log(ctx context.Context, log *models.AuditLog) error {
	log.CreatedAt = time.Now()
	_, err := db.GetCollection("audit_logs").InsertOne(ctx, log)
	return err
}

func (s *AuditService) GetByEncounter(ctx context.Context, encounterID primitive.ObjectID) ([]models.AuditLog, error) {
	cursor, err := db.GetCollection("audit_logs").Find(ctx, bson.M{"encounter_id": encounterID})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var logs []models.AuditLog
	if err := cursor.All(ctx, &logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func (s *AuditService) GetRecent(ctx context.Context, limit int64) ([]models.AuditLog, error) {
	cursor, err := db.GetCollection("audit_logs").Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var logs []models.AuditLog
	if err := cursor.All(ctx, &logs); err != nil {
		return nil, err
	}
	return logs, nil
}
