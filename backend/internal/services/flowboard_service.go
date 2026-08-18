package services

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// FlowBoardService builds the live "Patient Flow" board: station flow states,
// the paths patients actually travel today, and DynaFlow suggestions.
// Visible to every role; managers can additionally file manual bottleneck reports.
type FlowBoardService struct {
	MapService *MapService
}

func NewFlowBoardService(ms *MapService) *FlowBoardService {
	return &FlowBoardService{MapService: ms}
}

type FlowStation struct {
	Code             string `json:"code"`
	Name             string `json:"name"`
	Type             string `json:"type"`
	Floor            string `json:"floor"`
	Capacity         int    `json:"capacity"`
	Waiting          int    `json:"waiting"`
	InProgress       int    `json:"in_progress"`
	EstimatedWaitMin int    `json:"estimated_wait_min"`
	Status           string `json:"status"` // flowing | building | bottleneck | idle
	ManualReport     bool   `json:"manual_report"`
	AvgWaitMin       int    `json:"avg_wait_min"`
	AvgServiceMin    int    `json:"avg_service_min"`
	WaitBandMin      int    `json:"wait_band_min"`
	WaitSource       string `json:"wait_source"`
	SampleCount      int    `json:"sample_count"`
	OldestWaitingMin int    `json:"oldest_waiting_min"`
	Stuck            bool   `json:"stuck"`
	Trend            string `json:"trend"`
}

type FlowEdge struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Count int    `json:"count"`
}

type FlowKPIs struct {
	AvgWaitMin       int     `json:"avg_wait_min"`
	PatientsInSystem int     `json:"patients_in_system"`
	AvgTotalMin      int     `json:"avg_total_min"`
	Gini             float64 `json:"gini"`
	AvgWaitDeltaPct  float64 `json:"avg_wait_delta_pct"`
	AvgTotalDeltaPct float64 `json:"avg_total_delta_pct"`
	GiniDeltaPct     float64 `json:"gini_delta_pct"`
	// Source is always "measured" now — deltas compare the current window
	// against earlier-today data actually observed, never a fixed constant.
	Source string `json:"kpi_source"`
}

type FlowBoard struct {
	KPIs            FlowKPIs                    `json:"kpis"`
	Stations        []FlowStation               `json:"stations"`
	Edges           []FlowEdge                  `json:"edges"`
	Transits        []MapTransit                `json:"transits"`
	Recommendations []models.FlowRecommendation `json:"recommendations"`
	GeneratedAt     time.Time                   `json:"generated_at"`
}

func (s *FlowBoardService) GetBoard(ctx context.Context) (*FlowBoard, error) {
	overview, err := s.MapService.GetOverview(ctx)
	if err != nil {
		return nil, err
	}

	// stations with pending manual bottleneck reports are forced red
	manual := map[string]bool{}
	mcur, err := db.GetCollection("flow_recommendations").Find(ctx, bson.M{
		"type":   "manual_bottleneck",
		"status": "pending",
	})
	if err == nil {
		var mrecs []models.FlowRecommendation
		mcur.All(ctx, &mrecs)
		for _, r := range mrecs {
			for _, code := range r.AffectedStationCodes {
				manual[code] = true
			}
		}
	}

	statsMap, _, statsErr := s.MapService.Stats.GetAll(ctx)
	if statsErr != nil {
		statsMap = map[string]StationStats{}
	}

	stations := make([]FlowStation, 0, len(overview.Stations))
	waitCounts := make([]float64, 0, len(overview.Stations))
	totalWait := 0
	activeStations := 0
	for _, st := range overview.Stations {
		status := "idle"
		switch {
		case manual[st.Code] || st.Waiting >= st.Capacity*2 || st.EstimatedWaitMin >= 30:
			status = "bottleneck"
		case st.Waiting > 0 && (st.Waiting >= st.Capacity || st.EstimatedWaitMin >= 10):
			status = "building"
		case st.Waiting > 0 || st.InProgress > 0:
			status = "flowing"
		}

		stations = append(stations, FlowStation{
			Code:             st.Code,
			Name:             st.Name,
			Type:             st.Type,
			Floor:            st.Floor,
			Capacity:         st.Capacity,
			Waiting:          st.Waiting,
			InProgress:       st.InProgress,
			EstimatedWaitMin: st.EstimatedWaitMin,
			Status:           status,
			ManualReport:     manual[st.Code],
			AvgWaitMin:       st.AvgWaitMin,
			AvgServiceMin:    st.AvgServiceMin,
			WaitBandMin:      st.WaitBandMin,
			WaitSource:       st.WaitSource,
			SampleCount:      st.SampleCount,
			OldestWaitingMin: st.OldestWaitingMin,
			Stuck:            st.Stuck,
			Trend:            st.Trend,
		})

		if st.Type != "exit" {
			waitCounts = append(waitCounts, float64(st.Waiting))
		}
		if st.Waiting > 0 {
			totalWait += st.EstimatedWaitMin
			activeStations++
		}
	}

	// edges = paths patients actually took today, from queue_events
	edges := s.aggregateEdges(ctx)

	// KPIs
	inSystem, _ := db.GetCollection("encounters").CountDocuments(ctx, bson.M{"status": "active"})
	avgWait := 0
	if activeStations > 0 {
		avgWait = totalWait / activeStations
	}

	now := time.Now()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	twoHoursAgo := now.Add(-2 * time.Hour)

	// average total visit time of today's encounters, split into "earlier
	// today" (baseline) vs "last 2h" (current) so the delta compares real
	// data against real data instead of a fixed constant.
	avgTotal := 0
	baselineTotal := 0.0
	hasBaselineTotal := false
	tcur, err := db.GetCollection("encounters").Find(ctx, bson.M{"visit_date": bson.M{"$gte": dayStart}})
	if err == nil {
		var encs []models.Encounter
		tcur.All(ctx, &encs)
		sum, n := 0, 0
		baseSum, baseN := 0, 0
		for _, e := range encs {
			if e.TotalVisitMin <= 0 {
				continue
			}
			sum += e.TotalVisitMin
			n++
			if e.CompletedAt != nil && e.CompletedAt.Before(twoHoursAgo) {
				baseSum += e.TotalVisitMin
				baseN++
			}
		}
		if n > 0 {
			avgTotal = sum / n
		}
		if baseN > 0 {
			baselineTotal = float64(baseSum) / float64(baseN)
			hasBaselineTotal = true
		}
	}

	gini := giniCoefficient(waitCounts)

	// baseline wait = mean of each station's earlier-today average (from
	// StatsService); baseline gini = fairness of today's completed-patient
	// count per station (a "typical" distribution reference). Falls back to
	// the current value (0% delta) when there isn't enough history yet,
	// rather than comparing against a made-up number.
	baselineWaitSum, baselineWaitN := 0.0, 0
	sampleCounts := make([]float64, 0, len(statsMap))
	for _, stat := range statsMap {
		if stat.HasBaseline {
			baselineWaitSum += stat.BaselineAvgWaitMin
			baselineWaitN++
		}
		sampleCounts = append(sampleCounts, float64(stat.SampleCount))
	}
	baselineAvgWait := float64(avgWait)
	if baselineWaitN > 0 {
		baselineAvgWait = baselineWaitSum / float64(baselineWaitN)
	}
	baselineTotalFinal := float64(avgTotal)
	if hasBaselineTotal {
		baselineTotalFinal = baselineTotal
	}
	baselineGiniLive := giniCoefficient(sampleCounts)

	kpis := FlowKPIs{
		AvgWaitMin:       avgWait,
		PatientsInSystem: int(inSystem),
		AvgTotalMin:      avgTotal,
		Gini:             gini,
		AvgWaitDeltaPct:  pctDelta(float64(avgWait), baselineAvgWait),
		AvgTotalDeltaPct: pctDelta(float64(avgTotal), baselineTotalFinal),
		GiniDeltaPct:     pctDelta(gini, baselineGiniLive),
		Source:           "measured",
	}

	// display-only suggestions, most impactful first
	recs := []models.FlowRecommendation{}
	rcur, err := db.GetCollection("flow_recommendations").Find(ctx,
		bson.M{"status": "pending"},
		options.Find().SetSort(bson.M{"created_at": -1}).SetLimit(10))
	if err == nil {
		rcur.All(ctx, &recs)
	}
	impactRank := map[string]int{"high": 0, "medium": 1, "low": 2}
	sort.SliceStable(recs, func(i, j int) bool {
		ri, ok := impactRank[recs[i].Impact]
		if !ok {
			ri = 3
		}
		rj, ok := impactRank[recs[j].Impact]
		if !ok {
			rj = 3
		}
		return ri < rj
	})

	return &FlowBoard{
		KPIs:            kpis,
		Stations:        stations,
		Edges:           edges,
		Transits:        overview.Transits,
		Recommendations: recs,
		GeneratedAt:     time.Now(),
	}, nil
}

func (s *FlowBoardService) aggregateEdges(ctx context.Context) []FlowEdge {
	now := time.Now()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	cur, err := db.GetCollection("queue_events").Aggregate(ctx, []bson.M{
		{"$match": bson.M{
			"created_at":   bson.M{"$gte": dayStart},
			"from_station": bson.M{"$nin": []interface{}{"", nil}},
			"to_station":   bson.M{"$nin": []interface{}{"", nil}},
		}},
		{"$group": bson.M{
			"_id":   bson.M{"from": "$from_station", "to": "$to_station"},
			"count": bson.M{"$sum": 1},
		}},
	})
	if err != nil {
		return []FlowEdge{}
	}
	var raw []struct {
		ID struct {
			From string `bson:"from"`
			To   string `bson:"to"`
		} `bson:"_id"`
		Count int `bson:"count"`
	}
	cur.All(ctx, &raw)

	edges := make([]FlowEdge, 0, len(raw))
	for _, r := range raw {
		if r.ID.From == r.ID.To {
			continue
		}
		edges = append(edges, FlowEdge{From: r.ID.From, To: r.ID.To, Count: r.Count})
	}
	return edges
}

// ReportBottleneck lets a manager flag a station as congested; the report
// appears as a pending DynaFlow suggestion and forces the station red.
func (s *FlowBoardService) ReportBottleneck(ctx context.Context, stationCode, severity, note, reportedBy string, estWaitMin int) (*models.FlowRecommendation, error) {
	var st models.Station
	if err := db.GetCollection("stations").FindOne(ctx, bson.M{"code": stationCode}).Decode(&st); err != nil {
		return nil, fmt.Errorf("ไม่พบสถานี %s", stationCode)
	}
	if severity != "high" && severity != "medium" && severity != "low" {
		severity = "medium"
	}

	desc := fmt.Sprintf("Manager แจ้งคอขวดที่ %s · รอประมาณ %d นาที", st.Name, estWaitMin)
	if note != "" {
		desc += " · " + note
	}

	rec := models.FlowRecommendation{
		Type:                 "manual_bottleneck",
		Title:                fmt.Sprintf("คอขวดที่ %s (%s) — แจ้งโดยผู้จัดการ", st.Name, st.Code),
		Description:          desc,
		AffectedStationCodes: []string{stationCode},
		Impact:               severity,
		Status:               "pending",
		CreatedBy:            reportedBy,
		ExpectedImpact:       &models.RecommendationImpact{WaitReductionMin: estWaitMin / 2},
		CreatedAt:            time.Now(),
	}
	res, err := db.GetCollection("flow_recommendations").InsertOne(ctx, rec)
	if err != nil {
		return nil, err
	}
	if oid, ok := res.InsertedID.(interface{ Hex() string }); ok {
		_ = oid
	}
	return &rec, nil
}

func giniCoefficient(values []float64) float64 {
	n := len(values)
	if n == 0 {
		return 0
	}
	sorted := append([]float64{}, values...)
	sort.Float64s(sorted)
	var cum, total float64
	for _, v := range sorted {
		total += v
	}
	if total == 0 {
		return 0
	}
	var lorenz float64
	for _, v := range sorted {
		cum += v
		lorenz += cum
	}
	// G = 1 - 2 * B where B is area under the Lorenz curve
	return 1 - (2*lorenz-total)/(float64(n)*total)
}

func pctDelta(current, baseline float64) float64 {
	if baseline == 0 {
		return 0
	}
	return (current - baseline) / baseline * 100
}
