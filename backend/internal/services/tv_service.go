package services

import (
	"context"
	"sync"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// TVService feeds the unauthenticated hallway display. The payload carries
// queue numbers only — never a patient name, id, or encounter id — so it's
// safe to expose without login.
type TVService struct {
	Stats *StatsService

	mu       sync.RWMutex
	cache    *TVBoard
	cachedAt time.Time
}

func NewTVService(stats *StatsService) *TVService {
	return &TVService{Stats: stats}
}

const tvCacheTTL = 3 * time.Second

type TVCall struct {
	QueueNo  string    `json:"queue_no"`
	CalledAt time.Time `json:"called_at"`
}

type TVStationBoard struct {
	Code         string   `json:"code"`
	NameTH       string   `json:"name_th"`
	NowCalling   []TVCall `json:"now_calling"`
	InProgress   []string `json:"in_progress"`
	NextWaiting  []string `json:"next_waiting"`
	WaitingCount int      `json:"waiting_count"`
	AvgWaitMin   int      `json:"avg_wait_min"`
	WaitBandMin  int      `json:"wait_band_min"`
}

type TVBoard struct {
	Stations  []TVStationBoard `json:"stations"`
	UpdatedAt time.Time        `json:"updated_at"`
}

func (s *TVService) GetBoard(ctx context.Context, codes []string) (*TVBoard, error) {
	s.mu.RLock()
	if s.cache != nil && time.Since(s.cachedAt) < tvCacheTTL {
		cached := s.cache
		s.mu.RUnlock()
		return filterTVBoard(cached, codes), nil
	}
	s.mu.RUnlock()

	fresh, err := s.compute(ctx)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.cache = fresh
	s.cachedAt = time.Now()
	s.mu.Unlock()

	return filterTVBoard(fresh, codes), nil
}

func filterTVBoard(board *TVBoard, codes []string) *TVBoard {
	if len(codes) == 0 {
		return board
	}
	want := make(map[string]bool, len(codes))
	for _, c := range codes {
		want[c] = true
	}
	out := &TVBoard{Stations: []TVStationBoard{}, UpdatedAt: board.UpdatedAt}
	for _, st := range board.Stations {
		if want[st.Code] {
			out.Stations = append(out.Stations, st)
		}
	}
	return out
}

func (s *TVService) compute(ctx context.Context) (*TVBoard, error) {
	scur, err := db.GetCollection("stations").Find(ctx, bson.M{"is_active": true},
		options.Find().SetSort(bson.M{"sort_order": 1}))
	if err != nil {
		return nil, err
	}
	var stations []models.Station
	if err := scur.All(ctx, &stations); err != nil {
		return nil, err
	}

	qcur, err := db.GetCollection("queue_items").Find(ctx, bson.M{
		"status": bson.M{"$in": []string{"waiting", "called", "in_progress"}},
	}, options.Find().SetSort(bson.D{{Key: "rank", Value: 1}, {Key: "created_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	var items []models.QueueItem
	if err := qcur.All(ctx, &items); err != nil {
		return nil, err
	}

	byStation := map[string][]models.QueueItem{}
	for _, it := range items {
		byStation[it.StationCode] = append(byStation[it.StationCode], it)
	}

	statsMap, _, err := s.Stats.GetAll(ctx)
	if err != nil {
		statsMap = map[string]StationStats{}
	}

	board := &TVBoard{Stations: []TVStationBoard{}, UpdatedAt: time.Now()}
	for _, st := range stations {
		tvSt := TVStationBoard{
			Code:        st.Code,
			NameTH:      st.Name,
			NowCalling:  []TVCall{},
			InProgress:  []string{},
			NextWaiting: []string{},
		}

		for _, it := range byStation[st.Code] {
			switch it.Status {
			case "called":
				calledAt := it.CreatedAt
				if it.CalledAt != nil {
					calledAt = *it.CalledAt
				}
				tvSt.NowCalling = append(tvSt.NowCalling, TVCall{QueueNo: it.QueueNo, CalledAt: calledAt})
			case "in_progress":
				tvSt.InProgress = append(tvSt.InProgress, it.QueueNo)
			case "waiting":
				tvSt.WaitingCount++
				if len(tvSt.NextWaiting) < 5 {
					tvSt.NextWaiting = append(tvSt.NextWaiting, it.QueueNo)
				}
			}
		}

		if stat, ok := statsMap[st.Code]; ok {
			tvSt.AvgWaitMin = int(stat.AvgWaitMin)
			tvSt.WaitBandMin = stat.BandMin
		}

		board.Stations = append(board.Stations, tvSt)
	}

	return board, nil
}
