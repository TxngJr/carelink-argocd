package services

import (
	"context"
	"math"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MapService builds the live hospital map: how many patients are at each
// station and who is currently walking between stations.
type MapService struct {
	Stats *StatsService
}

func NewMapService(stats *StatsService) *MapService {
	return &MapService{Stats: stats}
}

// transitWindow is how long after a transfer a waiting patient is considered
// "walking" to the next station (until staff calls them or the window expires).
const transitWindow = 5 * time.Minute

type MapPatient struct {
	EncounterID string `json:"encounter_id"`
	PatientID   string `json:"patient_id"`
	DisplayName string `json:"display_name"`
	HN          string `json:"hn"`
	QueueNo     string `json:"queue_no"`
	Status      string `json:"status"`
	Priority    string `json:"priority"`
}

type MapStation struct {
	Code             string       `json:"code"`
	Name             string       `json:"name"`
	Type             string       `json:"type"`
	Floor            string       `json:"floor"`
	Capacity         int          `json:"capacity"`
	SortOrder        int          `json:"sort_order"`
	Waiting          int          `json:"waiting"`
	InProgress       int          `json:"in_progress"`
	EstimatedWaitMin int          `json:"estimated_wait_min"`
	AvgWaitMin       int          `json:"avg_wait_min"`
	AvgServiceMin    int          `json:"avg_service_min"`
	WaitBandMin      int          `json:"wait_band_min"`
	WaitSource       string       `json:"wait_source"`
	SampleCount      int          `json:"sample_count"`
	OldestWaitingMin int          `json:"oldest_waiting_min"`
	Stuck            bool         `json:"stuck"`
	Trend            string       `json:"trend"`
	Patients         []MapPatient `json:"patients"`
}

type MapTransit struct {
	EncounterID string    `json:"encounter_id"`
	PatientID   string    `json:"patient_id"`
	DisplayName string    `json:"display_name"`
	HN          string    `json:"hn"`
	FromStation string    `json:"from_station"`
	ToStation   string    `json:"to_station"`
	QueueNo     string    `json:"queue_no"`
	SinceAt     time.Time `json:"since_at"`
}

type MapOverview struct {
	Stations    []MapStation `json:"stations"`
	Transits    []MapTransit `json:"transits"`
	GeneratedAt time.Time    `json:"generated_at"`
}

func (s *MapService) GetOverview(ctx context.Context) (*MapOverview, error) {
	// all stations, in display order
	cur, err := db.GetCollection("stations").Find(ctx, bson.M{"is_active": true},
		options.Find().SetSort(bson.M{"sort_order": 1}))
	if err != nil {
		return nil, err
	}
	var stations []models.Station
	if err := cur.All(ctx, &stations); err != nil {
		return nil, err
	}

	// active queue items across all stations
	qcur, err := db.GetCollection("queue_items").Find(ctx, bson.M{
		"status": bson.M{"$in": []string{"waiting", "called", "in_progress"}},
	}, options.Find().SetSort(bson.M{"created_at": 1}))
	if err != nil {
		return nil, err
	}
	var items []models.QueueItem
	if err := qcur.All(ctx, &items); err != nil {
		return nil, err
	}

	// patient names for everything on the map
	patientNames := map[string]models.Patient{}
	pcur, err := db.GetCollection("patients").Find(ctx, bson.M{})
	if err == nil {
		var patients []models.Patient
		if err := pcur.All(ctx, &patients); err == nil {
			for _, p := range patients {
				patientNames[p.ID.Hex()] = p
			}
		}
	}

	byStation := map[string][]MapPatient{}
	transitCutoff := time.Now().Add(-transitWindow)
	transits := []MapTransit{}

	for _, it := range items {
		p := patientNames[it.PatientID.Hex()]
		mp := MapPatient{
			EncounterID: it.EncounterID.Hex(),
			PatientID:   it.PatientID.Hex(),
			DisplayName: p.DisplayName,
			HN:          p.HN,
			QueueNo:     it.QueueNo,
			Status:      it.Status,
			Priority:    it.Priority,
		}
		byStation[it.StationCode] = append(byStation[it.StationCode], mp)

		// a patient who was just transferred and hasn't been called yet is
		// treated as walking from their previous station
		if it.Status == "waiting" && it.CreatedAt.After(transitCutoff) {
			var ev models.QueueEvent
			err := db.GetCollection("queue_events").FindOne(ctx,
				bson.M{"encounter_id": it.EncounterID, "to_station": it.StationCode},
				options.FindOne().SetSort(bson.M{"created_at": -1}),
			).Decode(&ev)
			if err == nil && ev.FromStation != "" && ev.FromStation != it.StationCode {
				transits = append(transits, MapTransit{
					EncounterID: it.EncounterID.Hex(),
					PatientID:   it.PatientID.Hex(),
					DisplayName: p.DisplayName,
					HN:          p.HN,
					FromStation: ev.FromStation,
					ToStation:   it.StationCode,
					QueueNo:     it.QueueNo,
					SinceAt:     it.CreatedAt,
				})
			}
		}
	}

	statsByStation, _, err := s.Stats.GetAll(ctx)
	if err != nil {
		statsByStation = map[string]StationStats{}
	}

	out := make([]MapStation, 0, len(stations))
	for _, st := range stations {
		pts := byStation[st.Code]
		if pts == nil {
			pts = []MapPatient{}
		}
		waiting, inProgress := 0, 0
		for _, p := range pts {
			switch p.Status {
			case "in_progress":
				inProgress++
			default:
				waiting++
			}
		}

		stat := statsByStation[st.Code]
		est, _ := EstimateForPosition(stat, st, waiting)

		out = append(out, MapStation{
			Code:             st.Code,
			Name:             st.Name,
			Type:             st.Type,
			Floor:            st.Floor,
			Capacity:         st.Capacity,
			SortOrder:        st.SortOrder,
			Waiting:          waiting,
			InProgress:       inProgress,
			EstimatedWaitMin: est,
			AvgWaitMin:       int(math.Round(stat.AvgWaitMin)),
			AvgServiceMin:    int(math.Round(stat.AvgServiceMin)),
			WaitBandMin:      stat.BandMin,
			WaitSource:       stat.Source,
			SampleCount:      stat.SampleCount,
			OldestWaitingMin: stat.OldestWaitingMin,
			Stuck:            stat.Stuck,
			Trend:            stat.Trend,
			Patients:         pts,
		})
	}

	return &MapOverview{
		Stations:    out,
		Transits:    transits,
		GeneratedAt: time.Now(),
	}, nil
}
