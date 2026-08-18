package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/handlers"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/realtime"
	"github.com/carelink/backend/internal/seed"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// jsonRecovery replaces gin's default (bare "500 Internal Server Error"
// with no body) with the same {success,error} envelope every other error
// path uses, and logs the panic value + stack instead of letting gin print
// it straight to stdout.
func jsonRecovery(c *gin.Context, recovered interface{}) {
	slog.Error("panic recovered", "path", c.Request.URL.Path, "method", c.Request.Method, "panic", recovered)
	c.JSON(http.StatusInternalServerError, gin.H{
		"success": false,
		"error":   gin.H{"code": "INTERNAL_ERROR", "message": "เกิดข้อผิดพลาด กรุณาลองใหม่"},
	})
}

func requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		slog.Info("request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"latency_ms", time.Since(start).Milliseconds(),
			"ip", c.ClientIP(),
		)
	}
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg := config.Load()

	db.Connect(cfg)
	db.EnsureIndexes()
	db.BackfillQueueRank()

	hub := realtime.NewHub()
	realtime.HubInstance = hub
	go hub.Run()

	if len(os.Args) > 1 && os.Args[1] == "seed" {
		seedData := seed.NewSeedData()
		seedData.Reset()
		seedData.Run()
		log.Println("Seed complete, exiting")
		return
	}

	if cfg.AppEnv == "development" {
		seedData := seed.NewSeedData()
		seedData.Run()
	}

	authService := services.NewAuthService(cfg)
	patientService := services.NewPatientService()
	queueService := services.NewQueueService()
	stationService := services.NewStationService()
	statsService := services.NewStatsService()
	notificationService := services.NewNotificationService()
	appointmentService := services.NewAppointmentService(queueService, notificationService)
	auditService := services.NewAuditService()
	aiService := services.NewAIService()

	encounterService := services.NewEncounterService(queueService)
	preScreeningService := services.NewPreScreeningService(aiService)

	authHandler := handlers.NewAuthHandler(authService, cfg)
	mapService := services.NewMapService(statsService)
	mobileHandler := handlers.NewMobileHandler(authService, patientService, encounterService, preScreeningService, notificationService, aiService, statsService, mapService, cfg)
	stationQueueHandler := handlers.NewStationQueueHandler(queueService, stationService, notificationService)
	appointmentHandler := handlers.NewAppointmentHandler(appointmentService)

	gin.SetMode(gin.ReleaseMode)
	if cfg.AppEnv == "development" {
		gin.SetMode(gin.DebugMode)
	}

	r := gin.New()
	r.Use(gin.CustomRecovery(jsonRecovery))
	r.Use(requestLogger())
	r.Use(middleware.CORSMiddleware(cfg.CORSAllowedOrigins))
	r.Use(middleware.AuditMiddleware(auditService))

	r.GET("/health", func(c *gin.Context) {
		dbOK := true
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if err := db.Client.Ping(ctx, nil); err != nil {
			dbOK = false
		}
		status := http.StatusOK
		if !dbOK {
			status = http.StatusServiceUnavailable
		}
		c.JSON(status, gin.H{"status": "ok", "service": "carelink-backend", "db": dbOK})
	})

	r.GET("/ws", realtime.HandleWebSocket(hub, cfg.JWTSecret, cfg.CORSAllowedOrigins))

	api := r.Group("/api")

	if cfg.AppEnv == "development" {
		api.POST("/dev/seed", func(c *gin.Context) {
			if cfg.AppEnv != "development" {
				c.JSON(http.StatusForbidden, gin.H{"success": false, "error": gin.H{"code": "FORBIDDEN", "message": "not available"}})
				return
			}
			seedData := seed.NewSeedData()
			seedData.Reset()
			seedData.Run()
			c.JSON(200, gin.H{"success": true, "data": nil, "message": "reseeded"})
		})

	}

	handlers.RegisterAuthRoutes(api, authHandler, cfg)
	handlers.RegisterMobileRoutes(api, mobileHandler, cfg)
	handlers.RegisterAppointmentRoutes(api, appointmentHandler, cfg)
	handlers.RegisterStationQueueRoutes(api, stationQueueHandler, cfg)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		log.Printf("CareLink Backend starting on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Failed to start server:", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}
	if db.Client != nil {
		_ = db.Client.Disconnect(ctx)
	}
	log.Println("Server exited")
}
