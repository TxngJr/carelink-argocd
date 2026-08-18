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

type OrderService struct{}

func NewOrderService() *OrderService {
	return &OrderService{}
}

func (s *OrderService) GetByEncounter(ctx context.Context, encounterID primitive.ObjectID) ([]models.Order, error) {
	cursor, err := db.GetCollection("orders").Find(ctx, bson.M{"encounter_id": encounterID})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var orders []models.Order
	if err := cursor.All(ctx, &orders); err != nil {
		return nil, err
	}
	return orders, nil
}

func (s *OrderService) UpdateStatus(ctx context.Context, orderID primitive.ObjectID, status string) error {
	_, err := db.GetCollection("orders").UpdateOne(ctx,
		bson.M{"_id": orderID},
		bson.M{"$set": bson.M{"status": status, "updated_at": time.Now()}},
	)
	return err
}

func (s *OrderService) SeedOrders(ctx context.Context, encounterID, patientID, doctorID primitive.ObjectID) error {
	orders := []models.Order{
		{
			EncounterID:    encounterID,
			PatientID:      patientID,
			OrderedBy:      doctorID,
			OrderType:      "lab",
			OrderCode:      "CBC",
			OrderName:      "CBC · ความสมบูรณ์เม็ดเลือด",
			TargetStation:  "LABC",
			Priority:       "STAT",
			Status:         "ordered",
			ClinicalReason: "ประเมินก่อนให้เคมีรอบถัดไป",
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		},
		{
			EncounterID:    encounterID,
			PatientID:      patientID,
			OrderedBy:      doctorID,
			OrderType:      "lab",
			OrderCode:      "CHEM",
			OrderName:      "Chemistry",
			TargetStation:  "LABC",
			Priority:       "routine",
			Status:         "ordered",
			ClinicalReason: "ประเมินก่อนให้เคมีรอบถัดไป",
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		},
	}

	for i := range orders {
		count, _ := db.GetCollection("orders").CountDocuments(ctx, bson.M{"order_type": orders[i].OrderType})
		orders[i].OrderCode = fmt.Sprintf("%s-%04d", orders[i].OrderCode, count+1)
	}

	docs := make([]interface{}, len(orders))
	for i, o := range orders {
		docs[i] = o
	}
	_, err := db.GetCollection("orders").InsertMany(ctx, docs)
	return err
}
