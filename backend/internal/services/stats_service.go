package services

import (
	"context"
	"math"
	"sync"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
)

// StatsService turns the raw call/service timestamps QueueService now writes
// (Phase 1) into measured wait/service times per station, replacing the old
// static waiting*AverageServiceMin/capacity guesses used everywhere.
type StatsService struct {
	mu        sync.RWMutex
	cache     map[string]StationStats
	updatedAt time.Time
}

func NewStatsService() *StatsService {
	return &StatsService{cache: map[string]StationStats{}}
}

const statsCacheTTL = 30 * time.Second

// StationStats.Source: measured_2h (>=3 completions in the last 2h) |
// measured_today (fewer, but at least 1 completion today) | estimate (no
// completions today yet — falls back to the station's static config).
type StationStats struct {
	StationCode      string  `json:"station_code"`
	AvgWaitMin       float64 `json:"avg_wait_min"`
	AvgServiceMin    float64 `json:"avg_service_min"`
	BandMin          int     `json:"wait_band_min"`
	SampleCount      int     `json:"sample_count"`
	Source           string  `json:"wait_source"`
	Trend            string  `json:"trend"`
	OldestWaitingMin int     `json:"oldest_waiting_min"`
	Stuck            bool    `json:"stuck"`
	// BaselineAvgWaitMin is the mean wait for items completed earlier today
	// (before the last 2h) — used only by FlowBoardService to compare the
	// live average against how the day has gone so far. Not part of the
	// map/mobile/TV responses.
	BaselineAvgWaitMin float64 `json:"-"`
	HasBaseline        bool    `json:"-"`
}

// GetAll returns per-station stats, recomputing at most once every 30s since
// map/flow/mobile/TV all poll this heavily.
func (s *StatsService) GetAll(ctx context.Context) (map[string]StationStats, time.Time, error) {
	s.mu.RLock()
	if len(s.cache) > 0 && time.Since(s.updatedAt) < statsCacheTTL {
		out := cloneStats(s.cache)
		ts := s.updatedAt
		s.mu.RUnlock()
		return out, ts, nil
	}
	s.mu.RUnlock()

	fresh, err := s.compute(ctx)
	if err != nil {
		return nil, time.Time{}, err
	}

	s.mu.Lock()
	s.cache = fresh
	s.updatedAt = time.Now()
	out := cloneStats(s.cache)
	ts := s.updatedAt
	s.mu.Unlock()

	return out, ts, nil
}

func cloneStats(in map[string]StationStats) map[string]StationStats {
	out := make(map[string]StationStats, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func (s *StatsService) compute(ctx context.Context) (map[string]StationStats, error) {
	now := time.Now()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	twoHoursAgo := now.Add(-2 * time.Hour)
	lastHourStart := now.Add(-1 * time.Hour)
	prevHourStart := now.Add(-2 * time.Hour)

	var stations []models.Station
	scur, err := db.GetCollection("stations").Find(ctx, bson.M{"is_active": true})
	if err != nil {
		return nil, err
	}
	if err := scur.All(ctx, &stations); err != nil {
		return nil, err
	}

	ccur, err := db.GetCollection("queue_items").Find(ctx, bson.M{
		"completed_at": bson.M{"$gte": dayStart},
	})
	if err != nil {
		return nil, err
	}
	var completed []models.QueueItem
	if err := ccur.All(ctx, &completed); err != nil {
		return nil, err
	}

	byStation := map[string][]models.QueueItem{}
	for _, it := range completed {
		if it.CompletedAt == nil {
			continue
		}
		byStation[it.StationCode] = append(byStation[it.StationCode], it)
	}

	oldestWaiting := map[string]time.Time{}
	wcur, err := db.GetCollection("queue_items").Find(ctx, bson.M{"status": "waiting"})
	if err == nil {
		var waitingItems []models.QueueItem
		wcur.All(ctx, &waitingItems)
		for _, it := range waitingItems {
			if existing, ok := oldestWaiting[it.StationCode]; !ok || it.CreatedAt.Before(existing) {
				oldestWaiting[it.StationCode] = it.CreatedAt
			}
		}
	}

	result := make(map[string]StationStats, len(stations))
	for _, st := range stations {
		items := byStation[st.Code]

		var waitToday, wait2h, service2h, lastHour, prevHour, earlierToday []float64
		for _, it := range items {
			waitEnd := it.CompletedAt
			switch {
			case it.CalledAt != nil:
				waitEnd = it.CalledAt
			case it.StartedAt != nil:
				waitEnd = it.StartedAt
			}
			waitMin := waitEnd.Sub(it.CreatedAt).Minutes()
			if waitMin < 0 {
				waitMin = 0
			}

			serviceStart := it.CreatedAt
			switch {
			case it.StartedAt != nil:
				serviceStart = *it.StartedAt
			case it.CalledAt != nil:
				serviceStart = *it.CalledAt
			}
			serviceMin := it.CompletedAt.Sub(serviceStart).Minutes()
			if serviceMin < 0 {
				serviceMin = 0
			}

			waitToday = append(waitToday, waitMin)
			if it.CompletedAt.After(twoHoursAgo) {
				wait2h = append(wait2h, waitMin)
				service2h = append(service2h, serviceMin)
			} else {
				earlierToday = append(earlierToday, waitMin)
			}
			if it.CompletedAt.After(lastHourStart) {
				lastHour = append(lastHour, waitMin)
			} else if it.CompletedAt.After(prevHourStart) {
				prevHour = append(prevHour, waitMin)
			}
		}

		stats := StationStats{StationCode: st.Code}

		switch {
		case len(wait2h) >= 3:
			stats.Source = "measured_2h"
			stats.AvgWaitMin, stats.BandMin = meanAndBand(wait2h)
			stats.AvgServiceMin, _ = meanAndBand(service2h)
			stats.SampleCount = len(wait2h)
		case len(waitToday) >= 1:
			stats.Source = "measured_today"
			stats.AvgWaitMin, stats.BandMin = meanAndBand(waitToday)
			allService := make([]float64, 0, len(items))
			for _, it := range items {
				serviceStart := it.CreatedAt
				switch {
				case it.StartedAt != nil:
					serviceStart = *it.StartedAt
				case it.CalledAt != nil:
					serviceStart = *it.CalledAt
				}
				allService = append(allService, it.CompletedAt.Sub(serviceStart).Minutes())
			}
			stats.AvgServiceMin, _ = meanAndBand(allService)
			stats.SampleCount = len(waitToday)
		default:
			stats.Source = "estimate"
			stats.AvgWaitMin = 0
			stats.AvgServiceMin = float64(st.AverageServiceMin)
			stats.BandMin = 5
			stats.SampleCount = 0
		}

		if len(earlierToday) > 0 {
			stats.BaselineAvgWaitMin, _ = meanAndBand(earlierToday)
			stats.HasBaseline = true
		}

		stats.Trend = "flat"
		if len(lastHour) > 0 && len(prevHour) > 0 {
			lastAvg, _ := meanAndBand(lastHour)
			prevAvg, _ := meanAndBand(prevHour)
			if prevAvg > 0 {
				delta := (lastAvg - prevAvg) / prevAvg
				switch {
				case delta > 0.2:
					stats.Trend = "up"
				case delta < -0.2:
					stats.Trend = "down"
				}
			}
		}

		if oldest, ok := oldestWaiting[st.Code]; ok {
			stats.OldestWaitingMin = int(now.Sub(oldest).Minutes())
			basisWait := stats.AvgWaitMin
			if basisWait <= 0 {
				basisWait = float64(st.AverageServiceMin)
			}
			threshold := math.Max(15, 1.5*basisWait)
			stats.Stuck = float64(stats.OldestWaitingMin) > threshold
		}

		result[st.Code] = stats
	}

	return result, nil
}

// meanAndBand returns the mean and a ±band derived from the sample stddev,
// clamped to [2,15] minutes so it stays readable on a patient-facing screen.
func meanAndBand(samples []float64) (float64, int) {
	n := len(samples)
	if n == 0 {
		return 0, 5
	}
	sum := 0.0
	for _, v := range samples {
		sum += v
	}
	mean := sum / float64(n)

	if n < 2 {
		return mean, 5
	}
	var sqDiff float64
	for _, v := range samples {
		d := v - mean
		sqDiff += d * d
	}
	stddev := math.Sqrt(sqDiff / float64(n-1))
	band := int(math.Round(stddev))
	if band < 2 {
		band = 2
	}
	if band > 15 {
		band = 15
	}
	return mean, band
}

// EstimateForPosition computes the ETA for a patient with queueAhead people
// ahead of them at the station, using measured service time when available
// and falling back to the station's static config otherwise.
func EstimateForPosition(st StationStats, station models.Station, queueAhead int) (etaMin, bandMin int) {
	effService := st.AvgServiceMin
	if effService <= 0 {
		effService = float64(station.AverageServiceMin)
	}
	capacity := station.Capacity
	if capacity < 1 {
		capacity = 1
	}
	if queueAhead < 0 {
		queueAhead = 0
	}
	eta := int(math.Ceil(float64(queueAhead+1) * effService / float64(capacity)))
	return eta, st.BandMin
}
