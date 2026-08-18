package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
)

type StationService struct{}

func NewStationService() *StationService {
	return &StationService{}
}

func (s *StationService) List(ctx context.Context) ([]models.Station, error) {
	cursor, err := db.GetCollection("stations").Find(ctx, bson.M{"is_active": true})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var stations []models.Station
	if err := cursor.All(ctx, &stations); err != nil {
		return nil, err
	}
	return stations, nil
}

func (s *StationService) GetByCode(ctx context.Context, code string) (*models.Station, error) {
	var station models.Station
	err := db.GetCollection("stations").FindOne(ctx, bson.M{"code": code}).Decode(&station)
	if err != nil {
		return nil, err
	}
	return &station, nil
}

func (s *StationService) GetStationLoad(ctx context.Context, code string) (int, int, error) {
	waiting, err := db.GetCollection("queue_items").CountDocuments(ctx, bson.M{
		"station_code": code,
		"status":       bson.M{"$in": []string{"waiting", "called", "in_progress"}},
	})
	if err != nil {
		return 0, 0, err
	}

	station, err := s.GetByCode(ctx, code)
	if err != nil {
		return int(waiting), 0, err
	}

	return int(waiting), station.Capacity, nil
}

func (s *StationService) UpdateOpenSlots(ctx context.Context, code string, slots int) error {
	_, err := db.GetCollection("stations").UpdateOne(ctx,
		bson.M{"code": code},
		bson.M{"$set": bson.M{"current_open_slots": slots}},
	)
	return err
}

func (s *StationService) SeedStations(ctx context.Context) error {
	stations := []models.Station{
		{Code: "NPR", Name: "ลงทะเบียน", Type: "admin", Floor: "ชั้น 1", Capacity: 3, AverageServiceMin: 5, IsActive: true, CurrentOpenSlots: 3, SortOrder: 1},
		{Code: "EV", Name: "ตรวจสอบสิทธิ", Type: "admin", Floor: "ชั้น 1", Capacity: 2, AverageServiceMin: 5, IsActive: true, CurrentOpenSlots: 2, SortOrder: 2},
		{Code: "VM", Name: "จุดวัดสัญญาณชีพ", Type: "clinical", Floor: "ชั้น 1", Capacity: 4, AverageServiceMin: 8, IsActive: true, CurrentOpenSlots: 4, SortOrder: 3},
		{Code: "MHT", Name: "ซักประวัติ", Type: "clinical", Floor: "ชั้น 2", Capacity: 3, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 3, SortOrder: 4},
		{Code: "PC", Name: "ตรวจโดยแพทย์", Type: "clinical", Floor: "ชั้น 2", Capacity: 5, AverageServiceMin: 20, IsActive: true, CurrentOpenSlots: 5, SortOrder: 5},
		{Code: "LABC", Name: "เก็บตัวอย่าง Lab", Type: "lab", Floor: "ชั้น 1", Capacity: 3, AverageServiceMin: 5, IsActive: true, CurrentOpenSlots: 3, SortOrder: 6},
		{Code: "LABA", Name: "วิเคราะห์ Lab", Type: "lab", Floor: "ชั้น B1", Capacity: 4, AverageServiceMin: 45, IsActive: true, CurrentOpenSlots: 4, SortOrder: 7},
		{Code: "XR", Name: "X-ray", Type: "imaging", Floor: "ชั้น B1", Capacity: 2, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 2, SortOrder: 8},
		{Code: "CT", Name: "CT Scan", Type: "imaging", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 30, IsActive: true, CurrentOpenSlots: 1, SortOrder: 9},
		{Code: "MRI", Name: "MRI / Ultrasound", Type: "imaging", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 40, IsActive: true, CurrentOpenSlots: 1, SortOrder: 10},
		{Code: "IR", Name: "Interventional Radiology", Type: "imaging", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 60, IsActive: true, CurrentOpenSlots: 1, SortOrder: 11},
		{Code: "RC", Name: "ฟังผล / พบแพทย์หลังผลตรวจ", Type: "clinical", Floor: "ชั้น 2", Capacity: 3, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 3, SortOrder: 12},
		{Code: "TD", Name: "ตัดสินใจแผนการรักษา", Type: "clinical", Floor: "ชั้น 2", Capacity: 2, AverageServiceMin: 10, IsActive: true, CurrentOpenSlots: 2, SortOrder: 13},
		{Code: "CHEMO_PRE", Name: "ให้ยาก่อนเคมี", Type: "treatment", Floor: "ชั้น 3", Capacity: 4, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 4, SortOrder: 14},
		{Code: "CHEMO_INF", Name: "ให้เคมีบำบัด", Type: "treatment", Floor: "ชั้น 3", Capacity: 8, AverageServiceMin: 180, IsActive: true, CurrentOpenSlots: 8, SortOrder: 15},
		{Code: "RT_SIM", Name: "จำลองตำแหน่งฉายแสง", Type: "treatment", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 30, IsActive: true, CurrentOpenSlots: 1, SortOrder: 16},
		{Code: "RT_L1", Name: "LINAC เครื่อง 1", Type: "treatment", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 30, IsActive: true, CurrentOpenSlots: 1, SortOrder: 17},
		{Code: "RT_L2", Name: "LINAC เครื่อง 2", Type: "treatment", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 30, IsActive: true, CurrentOpenSlots: 1, SortOrder: 18},
		{Code: "BRA", Name: "ใส่แร่", Type: "treatment", Floor: "ชั้น B1", Capacity: 1, AverageServiceMin: 45, IsActive: true, CurrentOpenSlots: 1, SortOrder: 19},
		{Code: "SUR", Name: "ปรึกษาศัลยกรรม", Type: "clinical", Floor: "ชั้น 2", Capacity: 2, AverageServiceMin: 20, IsActive: true, CurrentOpenSlots: 2, SortOrder: 20},
		{Code: "OST", Name: "ดูแลประคับประคอง", Type: "clinical", Floor: "ชั้น 2", Capacity: 2, AverageServiceMin: 15, IsActive: true, CurrentOpenSlots: 2, SortOrder: 21},
		{Code: "PD_VERIFY", Name: "เภสัชตรวจสอบยา", Type: "pharmacy", Floor: "ชั้น 1", Capacity: 2, AverageServiceMin: 10, IsActive: true, CurrentOpenSlots: 2, SortOrder: 22},
		{Code: "PD_DISP", Name: "จ่ายยา", Type: "pharmacy", Floor: "ชั้น 1", Capacity: 3, AverageServiceMin: 8, IsActive: true, CurrentOpenSlots: 3, SortOrder: 23},
		{Code: "DH", Name: "กลับบ้าน", Type: "exit", Floor: "ชั้น 1", Capacity: 99, AverageServiceMin: 2, IsActive: true, CurrentOpenSlots: 99, SortOrder: 24},
	}

	for i := range stations {
		stations[i].CreatedAt = time.Now()
		stations[i].UpdatedAt = time.Now()
	}
	_, err := db.GetCollection("stations").InsertMany(ctx, toInterfaceSlice(stations))
	return err
}

func toInterfaceSlice(stations []models.Station) []interface{} {
	result := make([]interface{}, len(stations))
	for i, s := range stations {
		result[i] = s
	}
	return result
}
