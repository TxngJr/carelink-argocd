package services

import (
	"context"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
)

type DashboardService struct {
	FlowEngine *FlowEngineService
	Stats      *StatsService
}

func NewDashboardService(fe *FlowEngineService, stats *StatsService) *DashboardService {
	return &DashboardService{FlowEngine: fe, Stats: stats}
}

type KPIData struct {
	TotalPatientsInSystem  int     `json:"total_patients_in_system"`
	AverageWaitMin         float64 `json:"average_wait_min"`
	AverageTotalVisitMin   float64 `json:"average_total_visit_min"`
	BottleneckCount        int     `json:"bottleneck_count"`
	StationUtilization     float64 `json:"station_utilization"`
	PatientsCompletedToday int     `json:"patients_completed_today"`
	PatientsActiveToday    int     `json:"patients_active_today"`
	Source                 string  `json:"kpi_source"`
}

func (s *DashboardService) GetKPIs(ctx context.Context) (*KPIData, error) {
	totalActive, _ := db.GetCollection("encounters").CountDocuments(ctx, bson.M{"status": "active"})
	totalCompleted, _ := db.GetCollection("encounters").CountDocuments(ctx, bson.M{"status": "completed"})

	bottlenecks, _ := s.FlowEngine.DetectBottlenecks()
	bottleneckCount := 0
	for _, b := range bottlenecks {
		if b.Severity == "warning" || b.Severity == "critical" {
			bottleneckCount++
		}
	}

	cur, err := db.GetCollection("stations").Find(ctx, bson.M{"is_active": true})
	if err != nil {
		return nil, err
	}
	var stationList []models.Station
	if err := cur.All(ctx, &stationList); err != nil {
		return nil, err
	}

	totalCapacity := 0
	totalUsed := 0
	for _, st := range stationList {
		totalCapacity += st.Capacity
		waiting, _ := db.GetCollection("queue_items").CountDocuments(ctx, bson.M{
			"station_code": st.Code,
			"status":       bson.M{"$in": []string{"waiting", "called", "in_progress"}},
		})
		totalUsed += int(waiting)
	}

	utilization := 0.0
	if totalCapacity > 0 {
		utilization = float64(totalUsed) / float64(totalCapacity) * 100
	}

	avgWait := 0.0
	if stats, _, err := s.Stats.GetAll(ctx); err == nil {
		sum, n := 0.0, 0
		for _, stat := range stats {
			if stat.SampleCount > 0 {
				sum += stat.AvgWaitMin
				n++
			}
		}
		if n > 0 {
			avgWait = sum / float64(n)
		}
	}

	now := time.Now()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	avgTotalVisit := 0.0
	if ecur, err := db.GetCollection("encounters").Find(ctx, bson.M{"visit_date": bson.M{"$gte": dayStart}}); err == nil {
		var encs []models.Encounter
		ecur.All(ctx, &encs)
		sum, n := 0, 0
		for _, e := range encs {
			if e.TotalVisitMin > 0 {
				sum += e.TotalVisitMin
				n++
			}
		}
		if n > 0 {
			avgTotalVisit = float64(sum) / float64(n)
		}
	}

	return &KPIData{
		TotalPatientsInSystem:  int(totalActive),
		AverageWaitMin:         avgWait,
		AverageTotalVisitMin:   avgTotalVisit,
		BottleneckCount:        bottleneckCount,
		StationUtilization:     utilization,
		PatientsCompletedToday: int(totalCompleted),
		PatientsActiveToday:    int(totalActive),
		Source:                 "measured",
	}, nil
}

func (s *DashboardService) GetStationLoads(ctx context.Context) ([]StationLoad, error) {
	cur, err := db.GetCollection("stations").Find(ctx, bson.M{"is_active": true})
	if err != nil {
		return nil, err
	}
	var stationList []models.Station
	if err := cur.All(ctx, &stationList); err != nil {
		return nil, err
	}

	var loads []StationLoad
	for _, st := range stationList {
		waiting, _ := db.GetCollection("queue_items").CountDocuments(ctx, bson.M{
			"station_code": st.Code,
			"status":       bson.M{"$in": []string{"waiting", "called", "in_progress"}},
		})

		utilPct := 0
		if st.Capacity > 0 {
			utilPct = int(waiting) * 100 / st.Capacity
		}

		loads = append(loads, StationLoad{
			Code:           st.Code,
			Name:           st.Name,
			Type:           st.Type,
			WaitingCount:   int(waiting),
			Capacity:       st.Capacity,
			UtilizationPct: utilPct,
			AvgServiceMin:  st.AverageServiceMin,
		})
	}

	return loads, nil
}

type StationLoad struct {
	Code           string `json:"code"`
	Name           string `json:"name"`
	Type           string `json:"type"`
	WaitingCount   int    `json:"waiting_count"`
	Capacity       int    `json:"capacity"`
	UtilizationPct int    `json:"utilization_pct"`
	AvgServiceMin  int    `json:"avg_service_min"`
}

func (s *DashboardService) GetActivePatients(ctx context.Context) ([]map[string]interface{}, error) {
	cursor, err := db.GetCollection("encounters").Find(ctx, bson.M{"status": "active"})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var encs []models.Encounter
	cursor.All(ctx, &encs)

	var result []map[string]interface{}
	for _, enc := range encs {
		var patient models.Patient
		db.GetCollection("patients").FindOne(ctx, bson.M{"_id": enc.PatientID}).Decode(&patient)

		result = append(result, map[string]interface{}{
			"encounter":       enc,
			"patient":         patient,
			"current_station": enc.CurrentStation,
		})
	}

	return result, nil
}
