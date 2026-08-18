package services

import (
	"context"
	"fmt"
	"time"

	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type QueueService struct{}

func NewQueueService() *QueueService {
	return &QueueService{}
}

func (s *QueueService) GenerateQueueNo(ctx context.Context, stationCode string) (string, error) {
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		loc = time.Local
	}
	key := time.Now().In(loc).Format("20060102") + ":" + stationCode
	var counter models.DailyCounter
	err = db.GetCollection("daily_counters").FindOneAndUpdate(ctx,
		bson.M{"_id": key},
		bson.M{"$inc": bson.M{"value": 1}},
		options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After),
	).Decode(&counter)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%03d", stationCode, counter.Value), nil
}

func (s *QueueService) Enqueue(ctx context.Context, item *models.QueueItem) error {
	count, _ := db.GetCollection("queue_items").CountDocuments(ctx, bson.M{
		"station_code": item.StationCode,
		"status":       bson.M{"$in": []string{"waiting", "called", "in_progress"}},
	})
	average := 10
	var station models.Station
	if db.GetCollection("stations").FindOne(ctx, bson.M{"code": item.StationCode}).Decode(&station) == nil && station.AverageServiceMin > 0 {
		average = station.AverageServiceMin
	}
	item.EstimatedWaitMin = int(count) * average
	if item.Rank.IsZero() {
		item.Rank = item.CreatedAt
	}

	res, err := db.GetCollection("queue_items").InsertOne(ctx, item)
	if err != nil {
		return err
	}
	item.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *QueueService) StartItem(ctx context.Context, itemID primitive.ObjectID, stationCode string, staffID primitive.ObjectID) (*models.QueueItem, error) {
	now := time.Now()
	var item models.QueueItem
	err := db.GetCollection("queue_items").FindOneAndUpdate(ctx,
		bson.M{"_id": itemID, "station_code": stationCode, "status": bson.M{"$in": []string{"waiting", "called"}}},
		bson.M{"$set": bson.M{"status": "in_progress", "assigned_staff_id": staffID, "started_at": now, "updated_at": now}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&item)
	if err != nil {
		return nil, err
	}
	s.writeQueueEvent(ctx, item, "start", staffID)
	if item.EncounterID != primitive.NilObjectID {
		var enc models.Encounter
		if db.GetCollection("encounters").FindOne(ctx, bson.M{"_id": item.EncounterID}).Decode(&enc) == nil && enc.AppointmentRequestID != nil {
			_, _ = db.GetCollection("appointment_requests").UpdateOne(ctx,
				bson.M{"_id": *enc.AppointmentRequestID, "status": "checked_in"},
				bson.M{"$set": bson.M{"status": "in_service", "updated_at": now}},
			)
		}
	}
	return &item, nil
}

func (s *QueueService) CompleteAndAdvance(ctx context.Context, itemID primitive.ObjectID, stationCode string, staffID primitive.ObjectID) (*models.QueueItem, *models.QueueItem, error) {
	session, err := db.Client.StartSession()
	if err != nil {
		return nil, nil, err
	}
	defer session.EndSession(ctx)
	var item, next *models.QueueItem
	_, err = session.WithTransaction(ctx, func(sessionContext mongo.SessionContext) (interface{}, error) {
		var transactionErr error
		item, next, transactionErr = s.completeAndAdvance(sessionContext, itemID, stationCode, staffID)
		return nil, transactionErr
	})
	return item, next, err
}

// completeAndAdvance changes the old queue item, encounter route, next queue
// item, appointment status and audit event inside one MongoDB transaction.
func (s *QueueService) completeAndAdvance(ctx context.Context, itemID primitive.ObjectID, stationCode string, staffID primitive.ObjectID) (*models.QueueItem, *models.QueueItem, error) {
	var item models.QueueItem
	if err := db.GetCollection("queue_items").FindOne(ctx, bson.M{"_id": itemID, "station_code": stationCode}).Decode(&item); err != nil {
		return nil, nil, err
	}
	if item.Status == "completed" {
		var completedEncounter models.Encounter
		if db.GetCollection("encounters").FindOne(ctx, bson.M{"_id": item.EncounterID}).Decode(&completedEncounter) == nil {
			for index, step := range completedEncounter.Route {
				if step.StationCode == item.StationCode && index+1 < len(completedEncounter.Route) {
					var existingNext models.QueueItem
					if db.GetCollection("queue_items").FindOne(ctx, bson.M{
						"encounter_id": item.EncounterID,
						"station_code": completedEncounter.Route[index+1].StationCode,
					}).Decode(&existingNext) == nil {
						return &item, &existingNext, nil
					}
					break
				}
			}
		}
		return &item, nil, nil
	}
	if item.Status != "in_progress" && item.Status != "called" {
		return nil, nil, fmt.Errorf("queue item is not active")
	}
	var enc models.Encounter
	if err := db.GetCollection("encounters").FindOne(ctx, bson.M{"_id": item.EncounterID, "status": "active"}).Decode(&enc); err != nil {
		return nil, nil, err
	}

	currentIndex := -1
	for i := range enc.Route {
		if enc.Route[i].StationCode == item.StationCode && enc.Route[i].Status == "in_progress" {
			currentIndex = i
			break
		}
	}
	if currentIndex < 0 {
		return nil, nil, fmt.Errorf("route step is not active")
	}
	if (item.StationCode == "PC" || item.StationCode == "PC2" || item.StationCode == "PC3" || item.StationCode == "PC4") && currentIndex == len(enc.Route)-1 {
		return nil, nil, fmt.Errorf("doctor route is required before completing PC")
	}

	now := time.Now()
	oldStatus := item.Status
	res, err := db.GetCollection("queue_items").UpdateOne(ctx,
		bson.M{"_id": item.ID, "status": oldStatus},
		bson.M{"$set": bson.M{"status": "completed", "completed_at": now, "updated_at": now}},
	)
	if err != nil || res.ModifiedCount == 0 {
		if err == nil {
			err = fmt.Errorf("queue item state changed")
		}
		return nil, nil, err
	}
	item.Status = "completed"
	item.CompletedAt = &now
	enc.Route[currentIndex].Status = "completed"
	enc.Route[currentIndex].CompletedAt = &now

	if currentIndex == len(enc.Route)-1 {
		enc.Status = "completed"
		enc.CompletedAt = &now
		enc.CurrentStation = item.StationCode
		enc.CurrentQueueNo = item.QueueNo
		_, err = db.GetCollection("encounters").UpdateOne(ctx, bson.M{"_id": enc.ID}, bson.M{"$set": enc})
		if err != nil {
			_, _ = db.GetCollection("queue_items").UpdateOne(ctx, bson.M{"_id": item.ID}, bson.M{"$set": bson.M{"status": oldStatus}, "$unset": bson.M{"completed_at": ""}})
			return nil, nil, err
		}
		if enc.AppointmentRequestID != nil {
			_, _ = db.GetCollection("appointment_requests").UpdateOne(ctx,
				bson.M{"_id": *enc.AppointmentRequestID},
				bson.M{"$set": bson.M{"status": "completed", "updated_at": now}},
			)
		}
		s.writeQueueEvent(ctx, item, "complete_station", staffID)
		return &item, nil, nil
	}

	nextCode := enc.Route[currentIndex+1].StationCode
	queueNo, err := s.GenerateQueueNo(ctx, nextCode)
	if err != nil {
		_, _ = db.GetCollection("queue_items").UpdateOne(ctx, bson.M{"_id": item.ID}, bson.M{"$set": bson.M{"status": oldStatus}, "$unset": bson.M{"completed_at": ""}})
		return nil, nil, err
	}
	enc.Route[currentIndex+1].Status = "in_progress"
	enc.Route[currentIndex+1].StartedAt = &now
	enc.CurrentStation = nextCode
	enc.CurrentQueueNo = queueNo
	enc.UpdatedAt = now
	next := &models.QueueItem{
		QueueNo: queueNo, EncounterID: enc.ID, PatientID: enc.PatientID,
		StationCode: nextCode, Status: "waiting", Priority: enc.Priority,
		Rank: now, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.Enqueue(ctx, next); err != nil {
		_, _ = db.GetCollection("queue_items").UpdateOne(ctx, bson.M{"_id": item.ID}, bson.M{"$set": bson.M{"status": oldStatus}, "$unset": bson.M{"completed_at": ""}})
		return nil, nil, err
	}
	if _, err := db.GetCollection("encounters").UpdateOne(ctx, bson.M{"_id": enc.ID}, bson.M{"$set": enc}); err != nil {
		_, _ = db.GetCollection("queue_items").DeleteOne(ctx, bson.M{"_id": next.ID})
		_, _ = db.GetCollection("queue_items").UpdateOne(ctx, bson.M{"_id": item.ID}, bson.M{"$set": bson.M{"status": oldStatus}, "$unset": bson.M{"completed_at": ""}})
		return nil, nil, err
	}
	s.writeQueueEvent(ctx, item, "complete_station", staffID)
	return &item, next, nil
}

func (s *QueueService) GetQueueByStation(ctx context.Context, stationCode string) ([]models.QueueItem, error) {
	opts := options.Find().SetSort(bson.D{{Key: "rank", Value: 1}, {Key: "created_at", Value: 1}})
	cursor, err := db.GetCollection("queue_items").Find(ctx, bson.M{
		"station_code": stationCode,
		"status":       bson.M{"$in": []string{"waiting", "called", "in_progress", "no_show"}},
	}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := []models.QueueItem{}
	if err := cursor.All(ctx, &items); err != nil {
		return nil, err
	}

	for i := range items {
		var patient models.Patient
		if err := db.GetCollection("patients").FindOne(ctx, bson.M{"_id": items[i].PatientID}).Decode(&patient); err == nil {
			items[i].Patient = &patient
		}
		var encounter models.Encounter
		if err := db.GetCollection("encounters").FindOne(ctx, bson.M{"_id": items[i].EncounterID}).Decode(&encounter); err == nil {
			items[i].Encounter = &encounter
		}
	}
	return items, nil
}

func (s *QueueService) CallNext(ctx context.Context, stationCode string, staffID primitive.ObjectID) (*models.QueueItem, error) {
	now := time.Now()
	opts := options.FindOneAndUpdate().
		SetSort(bson.D{{Key: "rank", Value: 1}, {Key: "created_at", Value: 1}}).
		SetReturnDocument(options.After)

	var item models.QueueItem
	err := db.GetCollection("queue_items").FindOneAndUpdate(ctx,
		bson.M{"station_code": stationCode, "status": "waiting"},
		bson.M{
			"$set": bson.M{"status": "called", "assigned_staff_id": staffID, "called_at": now, "updated_at": now},
			"$inc": bson.M{"call_count": 1},
		},
		opts,
	).Decode(&item)
	if err != nil {
		return nil, err
	}
	s.writeQueueEvent(ctx, item, "call", staffID)
	return &item, nil
}

// Recall re-notifies the currently called/in-progress patient without changing status.
func (s *QueueService) Recall(ctx context.Context, itemID primitive.ObjectID, stationCode string, staffID primitive.ObjectID) (*models.QueueItem, error) {
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var item models.QueueItem
	err := db.GetCollection("queue_items").FindOneAndUpdate(ctx,
		bson.M{"_id": itemID, "station_code": stationCode, "status": bson.M{"$in": []string{"called", "in_progress"}}},
		bson.M{
			"$set": bson.M{"updated_at": time.Now()},
			"$inc": bson.M{"call_count": 1},
		},
		opts,
	).Decode(&item)
	if err != nil {
		return nil, err
	}
	s.writeQueueEvent(ctx, item, "recall", staffID)
	return &item, nil
}

// Skip marks a called-but-absent patient as no_show, freeing the station to call the next patient.
func (s *QueueService) Skip(ctx context.Context, itemID primitive.ObjectID, stationCode string, staffID primitive.ObjectID) (*models.QueueItem, error) {
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var item models.QueueItem
	err := db.GetCollection("queue_items").FindOneAndUpdate(ctx,
		bson.M{"_id": itemID, "station_code": stationCode, "status": bson.M{"$in": []string{"waiting", "called"}}},
		bson.M{
			"$set": bson.M{"status": "no_show", "updated_at": time.Now()},
			"$inc": bson.M{"skip_count": 1},
		},
		opts,
	).Decode(&item)
	if err != nil {
		return nil, err
	}
	s.writeQueueEvent(ctx, item, "no_show", staffID)
	return &item, nil
}

// Requeue sends a no_show patient back to waiting at the end of the line. Rank (not
// CreatedAt) is bumped so the true arrival time keeps informing wait-time stats.
func (s *QueueService) Requeue(ctx context.Context, itemID primitive.ObjectID, stationCode string, staffID primitive.ObjectID) (*models.QueueItem, error) {
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var item models.QueueItem
	err := db.GetCollection("queue_items").FindOneAndUpdate(ctx,
		bson.M{"_id": itemID, "station_code": stationCode, "status": "no_show"},
		bson.M{"$set": bson.M{
			"status":     "waiting",
			"rank":       time.Now(),
			"updated_at": time.Now(),
		}, "$unset": bson.M{"called_at": "", "assigned_staff_id": ""}},
		opts,
	).Decode(&item)
	if err != nil {
		return nil, err
	}
	s.writeQueueEvent(ctx, item, "requeue", staffID)
	return &item, nil
}

func (s *QueueService) writeQueueEvent(ctx context.Context, item models.QueueItem, action string, performedBy primitive.ObjectID) {
	db.GetCollection("queue_events").InsertOne(ctx, models.QueueEvent{
		EncounterID: item.EncounterID,
		PatientID:   item.PatientID,
		StationCode: item.StationCode,
		QueueNo:     item.QueueNo,
		FromStation: item.StationCode,
		ToStation:   item.StationCode,
		Action:      action,
		PerformedBy: performedBy,
		CreatedAt:   time.Now(),
	})
}

func (s *QueueService) StartService(ctx context.Context, encounterID primitive.ObjectID, stationCode string) error {
	now := time.Now()
	_, err := db.GetCollection("queue_items").UpdateOne(ctx,
		bson.M{"encounter_id": encounterID, "station_code": stationCode, "status": bson.M{"$in": []string{"waiting", "called"}}},
		bson.M{"$set": bson.M{"status": "in_progress", "started_at": now, "updated_at": now}},
	)
	return err
}

func (s *QueueService) CompleteQueueItem(ctx context.Context, encounterID primitive.ObjectID, stationCode string) {
	now := time.Now()
	db.GetCollection("queue_items").UpdateOne(context.Background(),
		bson.M{"encounter_id": encounterID, "station_code": stationCode, "status": bson.M{"$ne": "completed"}},
		bson.M{"$set": bson.M{"status": "completed", "completed_at": now, "updated_at": now}},
	)
}

func (s *QueueService) GetPatientPosition(ctx context.Context, encounterID primitive.ObjectID, stationCode string) (int, error) {
	var item models.QueueItem
	err := db.GetCollection("queue_items").FindOne(ctx, bson.M{
		"encounter_id": encounterID,
		"station_code": stationCode,
		"status":       bson.M{"$in": []string{"waiting", "called"}},
	}).Decode(&item)
	if err != nil {
		return 0, err
	}

	count, err := db.GetCollection("queue_items").CountDocuments(ctx, bson.M{
		"station_code": stationCode,
		"status":       "waiting",
		"rank":         bson.M{"$lte": item.Rank},
	})
	if err != nil {
		return 0, err
	}
	return int(count), nil
}

func (s *QueueService) EstimateWaitTime(ctx context.Context, stationCode string) (int, error) {
	count, err := db.GetCollection("queue_items").CountDocuments(ctx, bson.M{
		"station_code": stationCode,
		"status":       bson.M{"$in": []string{"waiting", "called", "in_progress"}},
	})
	if err != nil {
		return 0, err
	}

	var station models.Station
	err = db.GetCollection("stations").FindOne(ctx, bson.M{"code": stationCode}).Decode(&station)
	if err != nil {
		return int(count) * 10, nil
	}

	return int(count) * station.AverageServiceMin, nil
}
