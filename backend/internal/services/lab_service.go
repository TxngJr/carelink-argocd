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

type LabService struct{}

func NewLabService() *LabService {
	return &LabService{}
}

func (s *LabService) GetQueue(ctx context.Context) ([]models.LabResult, error) {
	cursor, err := db.GetCollection("lab_results").Find(ctx, bson.M{
		"status": bson.M{"$in": []string{"pending", "collecting", "analyzing"}},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var results []models.LabResult
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	for i := range results {
		var patient models.Patient
		if err := db.GetCollection("patients").FindOne(ctx, bson.M{"_id": results[i].PatientID}).Decode(&patient); err == nil {
			results[i].Patient = &patient
		}
	}
	return results, nil
}

func (s *LabService) CreateLabResult(ctx context.Context, lr *models.LabResult) error {
	lr.Status = "pending"
	lr.CreatedAt = time.Now()
	lr.UpdatedAt = time.Now()

	count, _ := db.GetCollection("lab_results").CountDocuments(ctx, bson.M{})
	lr.SampleNo = fmt.Sprintf("LAB-%04d", count+1)

	res, err := db.GetCollection("lab_results").InsertOne(ctx, lr)
	if err != nil {
		return err
	}
	lr.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *LabService) Collect(ctx context.Context, orderID primitive.ObjectID, staffID primitive.ObjectID) error {
	_, err := db.GetCollection("lab_results").UpdateOne(ctx,
		bson.M{"order_id": orderID},
		bson.M{"$set": bson.M{"status": "collecting", "recorded_by": staffID, "updated_at": time.Now()}},
	)
	return err
}

func (s *LabService) StartAnalyze(ctx context.Context, orderID primitive.ObjectID) error {
	_, err := db.GetCollection("lab_results").UpdateOne(ctx,
		bson.M{"order_id": orderID},
		bson.M{"$set": bson.M{"status": "analyzing", "updated_at": time.Now()}},
	)
	return err
}

func (s *LabService) SaveResults(ctx context.Context, orderID primitive.ObjectID, results []models.LabValue) error {
	critical := false
	for _, r := range results {
		if r.Critical {
			critical = true
			break
		}
	}
	now := time.Now()
	_, err := db.GetCollection("lab_results").UpdateOne(ctx,
		bson.M{"order_id": orderID},
		bson.M{"$set": bson.M{
			"results":        results,
			"status":         "completed",
			"critical_alert": critical,
			"reported_at":    now,
			"updated_at":     now,
		}},
	)
	return err
}

func (s *LabService) SendBack(ctx context.Context, orderID primitive.ObjectID) error {
	_, err := db.GetCollection("lab_results").UpdateOne(ctx,
		bson.M{"order_id": orderID},
		bson.M{"$set": bson.M{"status": "reported", "updated_at": time.Now()}},
	)
	return err
}
