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

type FlowEngineService struct{}

func NewFlowEngineService() *FlowEngineService {
	return &FlowEngineService{}
}

func (s *FlowEngineService) CalculateRoute(encounterID primitive.ObjectID) ([]string, error) {
	var enc models.Encounter
	err := db.GetCollection("encounters").FindOne(context.Background(), bson.M{"_id": encounterID}).Decode(&enc)
	if err != nil {
		return nil, err
	}

	orders, _ := db.GetCollection("orders").Find(context.Background(), bson.M{"encounter_id": encounterID})
	var orderList []models.Order
	orders.All(context.Background(), &orderList)

	route := []string{"NPR", "EV", "VM", "MHT", "PC"}

	hasLab := false
	hasXR := false
	hasChemo := false
	hasRT := false
	hasPharmacy := false

	for _, o := range orderList {
		switch o.OrderType {
		case "lab":
			hasLab = true
		case "imaging":
			if o.TargetStation == "XR" || o.TargetStation == "CT" || o.TargetStation == "MRI" {
				hasXR = true
			}
		case "treatment":
			if o.TargetStation == "CHEMO_PRE" || o.TargetStation == "CHEMO_INF" {
				hasChemo = true
			}
			if o.TargetStation == "RT_L1" || o.TargetStation == "RT_L2" || o.TargetStation == "RT_SIM" {
				hasRT = true
			}
		case "medication":
			hasPharmacy = true
		}
	}

	if hasLab {
		route = append(route, "LABC", "LABA")
	}
	if hasXR {
		route = append(route, "XR")
	}
	route = append(route, "RC", "TD")

	if hasChemo {
		route = append(route, "CHEMO_PRE", "CHEMO_INF")
	}
	if hasRT {
		route = append(route, "RT_SIM", "RT_L1")
	}
	if hasPharmacy || hasChemo {
		route = append(route, "PD_VERIFY", "PD_DISP")
	}

	route = append(route, "DH")

	return route, nil
}

func (s *FlowEngineService) GetNextStation(encounterID primitive.ObjectID) (string, error) {
	var enc models.Encounter
	err := db.GetCollection("encounters").FindOne(context.Background(), bson.M{"_id": encounterID}).Decode(&enc)
	if err != nil {
		return "", err
	}

	for _, step := range enc.Route {
		if step.Status == "pending" {
			return step.StationCode, nil
		}
	}
	return "DH", nil
}

func (s *FlowEngineService) EstimateWaitTime(stationCode string) (int, error) {
	count, err := db.GetCollection("queue_items").CountDocuments(context.Background(), bson.M{
		"station_code": stationCode,
		"status":       bson.M{"$in": []string{"waiting", "called", "in_progress"}},
	})
	if err != nil {
		return 0, err
	}

	var station models.Station
	err = db.GetCollection("stations").FindOne(context.Background(), bson.M{"code": stationCode}).Decode(&station)
	if err != nil {
		return int(count) * 10, nil
	}

	return int(count) * station.AverageServiceMin, nil
}

type Bottleneck struct {
	StationCode     string `json:"station_code"`
	StationName     string `json:"station_name"`
	WaitingCount    int    `json:"waiting_count"`
	AvgWaitMin      int    `json:"avg_wait_min"`
	CapacityUtilPct int    `json:"capacity_util_pct"`
	Severity        string `json:"severity"`
}

func (s *FlowEngineService) DetectBottlenecks() ([]Bottleneck, error) {
	cur, err := db.GetCollection("stations").Find(context.Background(), bson.M{"is_active": true})
	if err != nil {
		return nil, err
	}
	var stationList []models.Station
	if err := cur.All(context.Background(), &stationList); err != nil {
		return nil, err
	}

	var bottlenecks []Bottleneck

	for _, st := range stationList {
		if st.Type == "exit" || st.Type == "admin" {
			continue
		}

		waiting, _ := db.GetCollection("queue_items").CountDocuments(context.Background(), bson.M{
			"station_code": st.Code,
			"status":       bson.M{"$in": []string{"waiting", "called", "in_progress"}},
		})

		if waiting == 0 {
			continue
		}

		utilPct := int(waiting) * 100 / st.Capacity
		if utilPct > 100 {
			utilPct = 100
		}

		severity := "normal"
		if utilPct > 150 {
			severity = "critical"
		} else if utilPct > 100 {
			severity = "warning"
		}

		bottlenecks = append(bottlenecks, Bottleneck{
			StationCode:     st.Code,
			StationName:     st.Name,
			WaitingCount:    int(waiting),
			AvgWaitMin:      int(waiting) * st.AverageServiceMin,
			CapacityUtilPct: utilPct,
			Severity:        severity,
		})
	}

	return bottlenecks, nil
}

func (s *FlowEngineService) GenerateRecommendations() ([]models.FlowRecommendation, error) {
	bottlenecks, err := s.DetectBottlenecks()
	if err != nil {
		return nil, err
	}

	var recs []models.FlowRecommendation

	for _, bn := range bottlenecks {
		if bn.Severity == "warning" || bn.Severity == "critical" {
			rec := models.FlowRecommendation{
				Type:                 "dynamic_station_switching",
				Title:                "แนะนำให้ปรับเส้นทางผู้ป่วยที่สถานี " + bn.StationName,
				Description:          fmt.Sprintf("สถานี %s มีผู้รอ %d ราย รอเฉลี่ย %d นาที", bn.StationName, bn.WaitingCount, bn.AvgWaitMin),
				AffectedStationCodes: []string{bn.StationCode},
				Status:               "pending",
				CreatedBy:            "system",
				CreatedAt:            time.Now(),
				ExpectedImpact: &models.RecommendationImpact{
					WaitReductionMin:           bn.AvgWaitMin / 3,
					BottleneckReductionPercent: 20,
				},
			}
			recs = append(recs, rec)
		}
	}

	if len(recs) > 0 {
		docs := make([]interface{}, len(recs))
		for i, r := range recs {
			docs[i] = r
		}
		db.GetCollection("flow_recommendations").InsertMany(context.Background(), docs)
	}

	return recs, nil
}

func (s *FlowEngineService) AcceptRecommendation(ctx context.Context, recID primitive.ObjectID, userID primitive.ObjectID) error {
	now := time.Now()
	_, err := db.GetCollection("flow_recommendations").UpdateOne(ctx,
		bson.M{"_id": recID, "status": "pending"},
		bson.M{"$set": bson.M{"status": "accepted", "accepted_by": userID, "resolved_at": now}},
	)
	return err
}

func (s *FlowEngineService) RejectRecommendation(ctx context.Context, recID primitive.ObjectID) error {
	now := time.Now()
	_, err := db.GetCollection("flow_recommendations").UpdateOne(ctx,
		bson.M{"_id": recID, "status": "pending"},
		bson.M{"$set": bson.M{"status": "rejected", "resolved_at": now}},
	)
	return err
}

func (s *FlowEngineService) GetRecommendations(ctx context.Context) ([]models.FlowRecommendation, error) {
	cursor, err := db.GetCollection("flow_recommendations").Find(ctx, bson.M{"status": "pending"})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var recs []models.FlowRecommendation
	if err := cursor.All(ctx, &recs); err != nil {
		return nil, err
	}
	return recs, nil
}
