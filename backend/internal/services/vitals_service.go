package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type VitalsService struct{}

func NewVitalsService() *VitalsService {
	return &VitalsService{}
}

func (s *VitalsService) Create(ctx context.Context, v *models.Vitals) error {
	v.Warnings = s.CheckAbnormalities(v)
	v.RecordedAt = time.Now()
	v.CreatedAt = time.Now()
	res, err := db.GetCollection("vitals").InsertOne(ctx, v)
	if err != nil {
		return err
	}
	v.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *VitalsService) GetByEncounter(ctx context.Context, encounterID primitive.ObjectID) (*models.Vitals, error) {
	var v models.Vitals
	err := db.GetCollection("vitals").FindOne(ctx, bson.M{"encounter_id": encounterID}).Decode(&v)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func (s *VitalsService) CheckAbnormalities(v *models.Vitals) []string {
	var warnings []string
	if v.SBP > 140 || v.SBP < 90 {
		warnings = append(warnings, "ความดัน systolic ผิดปกติ")
	}
	if v.DBP > 90 || v.DBP < 60 {
		warnings = append(warnings, "ความดัน diastolic ผิดปกติ")
	}
	if v.Pulse > 100 || v.Pulse < 60 {
		warnings = append(warnings, "ชีพจรผิดปกติ")
	}
	if v.Temperature > 37.5 {
		warnings = append(warnings, "อุณหภูมิสูง")
	}
	if v.SPO2 < 94 {
		warnings = append(warnings, "ออกซิเจนในเลือดต่ำ")
	}
	if v.RespiratoryRate > 20 || v.RespiratoryRate < 12 {
		warnings = append(warnings, "อัตราการหายใจผิดปกติ")
	}
	if v.BMI > 30 {
		warnings = append(warnings, "น้ำหนักเกิน")
	}
	if v.BMI < 18.5 {
		warnings = append(warnings, "น้ำหนักต่ำ")
	}
	return warnings
}
