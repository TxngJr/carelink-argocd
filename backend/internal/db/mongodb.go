package db

import (
	"context"
	"log"
	"time"

	"github.com/carelink/backend/internal/config"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var Client *mongo.Client
var Database *mongo.Database

func Connect(cfg *config.Config) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOpts := options.Client().ApplyURI(cfg.MongoURI)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		log.Fatal("Failed to connect to MongoDB:", err)
	}

	if err = client.Ping(ctx, nil); err != nil {
		log.Fatal("Failed to ping MongoDB:", err)
	}

	Client = client
	Database = client.Database(cfg.DBName)
	log.Println("Connected to MongoDB:", cfg.DBName)
}

func EnsureIndexes() {
	ctx := context.Background()

	Database.Collection("users").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "username", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "role", Value: 1}}},
	})

	Database.Collection("patients").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "hn", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "phone", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "display_name", Value: 1}}},
		{Keys: bson.D{{Key: "phone", Value: 1}}},
		{Keys: bson.D{{Key: "insurance_type", Value: 1}}},
		{Keys: bson.D{{Key: "is_out_province", Value: 1}}},
	})

	Database.Collection("encounters").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "encounter_no", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "patient_id", Value: 1}}},
		{Keys: bson.D{{Key: "visit_date", Value: 1}}},
		{Keys: bson.D{{Key: "status", Value: 1}}},
		{Keys: bson.D{{Key: "current_station", Value: 1}}},
		{Keys: bson.D{{Key: "priority", Value: 1}}},
		{Keys: bson.D{{Key: "appointment_request_id", Value: 1}}, Options: options.Index().SetUnique(true).SetSparse(true)},
	})

	Database.Collection("stations").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "code", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "type", Value: 1}}},
		{Keys: bson.D{{Key: "is_active", Value: 1}}},
	})

	Database.Collection("queue_items").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "station_code", Value: 1}, {Key: "status", Value: 1}}},
		{Keys: bson.D{{Key: "station_code", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: 1}}},
		{Keys: bson.D{{Key: "station_code", Value: 1}, {Key: "completed_at", Value: -1}}},
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}},
		{Keys: bson.D{{Key: "patient_id", Value: 1}}},
		{Keys: bson.D{{Key: "priority", Value: 1}}},
		{Keys: bson.D{{Key: "created_at", Value: 1}}},
		{Keys: bson.D{{Key: "rank", Value: 1}}},
		{Keys: bson.D{{Key: "encounter_id", Value: 1}, {Key: "station_code", Value: 1}}, Options: options.Index().SetUnique(true)},
	})

	Database.Collection("appointment_requests").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "patient_id", Value: 1}, {Key: "created_at", Value: -1}}},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "created_at", Value: 1}}},
		{Keys: bson.D{{Key: "appointment_at", Value: 1}}},
		{
			Keys: bson.D{{Key: "patient_id", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("one_active_request_per_patient").SetPartialFilterExpression(bson.M{
				"status": bson.M{"$in": []string{"submitted", "nurse_proposed", "confirmed", "arrival_reported", "checked_in", "in_service"}},
			}),
		},
	})

	Database.Collection("queue_events").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}},
		{Keys: bson.D{{Key: "patient_id", Value: 1}}},
		{Keys: bson.D{{Key: "created_at", Value: 1}}},
		{Keys: bson.D{{Key: "from_station", Value: 1}, {Key: "to_station", Value: 1}, {Key: "created_at", Value: -1}}},
		{Keys: bson.D{{Key: "station_code", Value: 1}, {Key: "action", Value: 1}, {Key: "created_at", Value: -1}}},
	})

	Database.Collection("pre_screenings").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "patient_id", Value: 1}}},
	})

	Database.Collection("vitals").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}},
		{Keys: bson.D{{Key: "patient_id", Value: 1}}},
		{Keys: bson.D{{Key: "recorded_at", Value: 1}}},
	})

	Database.Collection("nursing_assessments").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "patient_id", Value: 1}}},
	})

	Database.Collection("doctor_notes").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "patient_id", Value: 1}}},
	})

	Database.Collection("orders").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}},
		{Keys: bson.D{{Key: "patient_id", Value: 1}}},
		{Keys: bson.D{{Key: "order_type", Value: 1}}},
		{Keys: bson.D{{Key: "target_station", Value: 1}}},
		{Keys: bson.D{{Key: "status", Value: 1}}},
	})

	Database.Collection("lab_results").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "order_id", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}},
		{Keys: bson.D{{Key: "sample_no", Value: 1}}, Options: options.Index().SetUnique(true)},
	})

	Database.Collection("prescriptions").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "rx_no", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}},
		{Keys: bson.D{{Key: "status", Value: 1}}},
	})

	Database.Collection("chemo_sessions").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}},
		{Keys: bson.D{{Key: "chair_no", Value: 1}}},
		{Keys: bson.D{{Key: "status", Value: 1}}},
	})

	Database.Collection("radiation_sessions").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "machine_code", Value: 1}}},
		{Keys: bson.D{{Key: "scheduled_time", Value: 1}}},
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}},
		{Keys: bson.D{{Key: "status", Value: 1}}},
	})

	Database.Collection("notifications").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "user_id", Value: 1}}},
		{Keys: bson.D{{Key: "patient_id", Value: 1}}},
		{Keys: bson.D{{Key: "is_read", Value: 1}}},
		{Keys: bson.D{{Key: "created_at", Value: 1}}},
	})

	Database.Collection("flow_recommendations").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "status", Value: 1}}},
		{Keys: bson.D{{Key: "type", Value: 1}}},
		{Keys: bson.D{{Key: "created_at", Value: 1}}},
	})

	Database.Collection("audit_logs").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "actor_user_id", Value: 1}}},
		{Keys: bson.D{{Key: "action", Value: 1}}},
		{Keys: bson.D{{Key: "encounter_id", Value: 1}}},
		{Keys: bson.D{{Key: "created_at", Value: 1}}},
	})

	log.Println("Database indexes ensured")
}

// BackfillQueueRank fills the rank field (used to order the live queue) on any
// queue_items inserted before rank existed, defaulting it to created_at.
func BackfillQueueRank() {
	ctx := context.Background()
	res, err := Database.Collection("queue_items").UpdateMany(ctx,
		bson.M{"$or": []bson.M{{"rank": bson.M{"$exists": false}}, {"rank": nil}}},
		bson.A{bson.D{{Key: "$set", Value: bson.D{{Key: "rank", Value: "$created_at"}}}}},
	)
	if err != nil {
		log.Println("Rank backfill failed:", err)
		return
	}
	if res.ModifiedCount > 0 {
		log.Printf("Backfilled rank on %d queue_items", res.ModifiedCount)
	}
}

func GetCollection(name string) *mongo.Collection {
	return Database.Collection(name)
}
