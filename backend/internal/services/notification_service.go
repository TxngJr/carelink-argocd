package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type NotificationService struct{}

func NewNotificationService() *NotificationService {
	return &NotificationService{}
}

func (s *NotificationService) Create(ctx context.Context, n *models.Notification) error {
	n.CreatedAt = time.Now()
	res, err := db.GetCollection("notifications").InsertOne(ctx, n)
	if err != nil {
		return err
	}
	n.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *NotificationService) GetByPatient(ctx context.Context, patientID primitive.ObjectID) ([]models.Notification, error) {
	cursor, err := db.GetCollection("notifications").Find(ctx, bson.M{"patient_id": patientID})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var notifs []models.Notification
	if err := cursor.All(ctx, &notifs); err != nil {
		return nil, err
	}
	return notifs, nil
}

func (s *NotificationService) MarkReadForPatient(ctx context.Context, notifID, patientID primitive.ObjectID) error {
	now := time.Now()
	res, err := db.GetCollection("notifications").UpdateOne(ctx,
		bson.M{"_id": notifID, "patient_id": patientID},
		bson.M{"$set": bson.M{"is_read": true, "read_at": now}},
	)
	if err == nil && res.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return err
}

func (s *NotificationService) CreateRouteChangeNotification(ctx context.Context, patientID, encounterID primitive.ObjectID, message string) error {
	n := &models.Notification{
		PatientID:   patientID,
		EncounterID: encounterID,
		Channel:     "in_app",
		Title:       "เปลี่ยนเส้นทางตรวจ",
		Message:     message,
		Type:        "route_changed",
		IsRead:      false,
	}
	return s.Create(ctx, n)
}
