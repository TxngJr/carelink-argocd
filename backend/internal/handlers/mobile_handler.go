package handlers

import (
	"net/http"
	"time"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/models"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MobileHandler struct {
	AuthService         *services.AuthService
	PatientService      *services.PatientService
	EncounterService    *services.EncounterService
	PreScreeningService *services.PreScreeningService
	NotificationService *services.NotificationService
	AIService           *services.AIService
	Stats               *services.StatsService
	MapService          *services.MapService
	Cfg                 *config.Config
}

func NewMobileHandler(as *services.AuthService, ps *services.PatientService, es *services.EncounterService, pss *services.PreScreeningService, ns *services.NotificationService, ai *services.AIService, stats *services.StatsService, mapSvc *services.MapService, cfg *config.Config) *MobileHandler {
	return &MobileHandler{AuthService: as, PatientService: ps, EncounterService: es, PreScreeningService: pss, NotificationService: ns, AIService: ai, Stats: stats, MapService: mapSvc, Cfg: cfg}
}

// MobileStationOverview is the patient-facing hospital overview — aggregate
// counts only, never another patient's name, HN, or queue number.
type MobileStationOverview struct {
	Code         string `json:"code"`
	NameTH       string `json:"name_th"`
	Floor        string `json:"floor"`
	WaitingCount int    `json:"waiting_count"`
	AvgWaitMin   int    `json:"avg_wait_min"`
	WaitBandMin  int    `json:"wait_band_min"`
	Status       string `json:"status"` // idle | moderate | busy
}

func (h *MobileHandler) GetOverview(c *gin.Context) {
	overview, err := h.MapService.GetOverview(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": gin.H{"code": "INTERNAL_ERROR", "message": "โหลดข้อมูลไม่สำเร็จ"}})
		return
	}

	out := make([]MobileStationOverview, 0, len(overview.Stations))
	for _, st := range overview.Stations {
		status := "idle"
		switch {
		case st.Waiting >= st.Capacity && st.Waiting > 0:
			status = "busy"
		case st.Waiting > 0:
			status = "moderate"
		}
		out = append(out, MobileStationOverview{
			Code:         st.Code,
			NameTH:       st.Name,
			Floor:        st.Floor,
			WaitingCount: st.Waiting,
			AvgWaitMin:   st.AvgWaitMin,
			WaitBandMin:  st.WaitBandMin,
			Status:       status,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"stations": out, "updated_at": overview.GeneratedAt}, "message": "OK"})
}

type MobileLoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type MobileRegisterRequest struct {
	DisplayName string `json:"display_name" binding:"required"`
	Phone       string `json:"phone" binding:"required"`
	BirthDate   string `json:"birth_date" binding:"required"`
	Password    string `json:"password" binding:"required"`
}

func (h *MobileHandler) Register(c *gin.Context) {
	var req MobileRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}
	birthDate, err := time.Parse("2006-01-02", req.BirthDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "วันเกิดไม่ถูกต้อง"}})
		return
	}
	user, token, err := h.AuthService.RegisterPatient(c.Request.Context(), req.DisplayName, req.Phone, req.Password, birthDate)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "เบอร์โทรนี้ถูกใช้งานแล้ว" {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"success": false, "error": gin.H{"code": "REGISTRATION_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": gin.H{
		"token": token,
		"user":  gin.H{"id": user.ID, "display_name": user.DisplayName, "role": user.Role},
	}, "message": "สมัครสมาชิกสำเร็จ"})
}

func (h *MobileHandler) Login(c *gin.Context) {
	var req MobileLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	user, token, err := h.AuthService.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": gin.H{"code": "UNAUTHORIZED", "message": err.Error()}})
		return
	}
	if user.Role != "patient" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "error": gin.H{"code": "FORBIDDEN", "message": "บัญชีนี้ไม่ใช่บัญชีผู้ป่วย"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"token": token,
			"user": gin.H{
				"id":           user.ID,
				"display_name": user.DisplayName,
				"role":         user.Role,
			},
		},
		"message": "OK",
	})
}

func (h *MobileHandler) GetMe(c *gin.Context) {
	userID, _ := c.Get("user_id")
	user, err := h.AuthService.GetUserByID(c.Request.Context(), userID.(primitive.ObjectID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบผู้ใช้"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"id":           user.ID,
			"display_name": user.DisplayName,
			"role":         user.Role,
		},
		"message": "OK",
	})
}

func (h *MobileHandler) GetCurrentJourney(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user models.User
	err := db.GetCollection("users").FindOne(c.Request.Context(), bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบผู้ใช้"}})
		return
	}

	var patientID primitive.ObjectID
	if user.PatientID != nil {
		patientID = *user.PatientID
	} else {
		patientID = user.ID
	}

	var patient models.Patient
	err = db.GetCollection("patients").FindOne(c.Request.Context(), bson.M{"_id": patientID}).Decode(&patient)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบข้อมูลผู้ป่วย"}})
		return
	}

	var enc models.Encounter
	err = db.GetCollection("encounters").FindOne(c.Request.Context(), bson.M{
		"patient_id": patient.ID,
		"status":     "active",
	}).Decode(&enc)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "ไม่มี visit ปัจจุบัน"})
		return
	}

	stepCurrent := 0
	for i, step := range enc.Route {
		if step.Status == "in_progress" {
			stepCurrent = i + 1
			break
		}
	}

	nextStation := ""
	for _, step := range enc.Route {
		if step.Status == "pending" {
			nextStation = step.StationCode
			break
		}
	}

	// station names + floors for current and next stops
	stationInfo := map[string]models.Station{}
	cur, err := db.GetCollection("stations").Find(c.Request.Context(), bson.M{
		"code": bson.M{"$in": []string{enc.CurrentStation, nextStation}},
	})
	if err == nil {
		var list []models.Station
		cur.All(c.Request.Context(), &list)
		for _, st := range list {
			stationInfo[st.Code] = st
		}
	}

	// this patient's own queue item at the current station, and how many
	// people are queued ahead of them there (ordered by rank, not arrival
	// time, so a requeued no-show correctly counts as "at the back")
	queueAhead := 0
	queueStatus := ""
	var myItem models.QueueItem
	if db.GetCollection("queue_items").FindOne(c.Request.Context(), bson.M{
		"encounter_id": enc.ID,
		"station_code": enc.CurrentStation,
	}, options.FindOne().SetSort(bson.M{"created_at": -1})).Decode(&myItem) == nil {
		queueStatus = myItem.Status
		if myItem.Status == "waiting" || myItem.Status == "called" {
			n, _ := db.GetCollection("queue_items").CountDocuments(c.Request.Context(), bson.M{
				"station_code": enc.CurrentStation,
				"status":       bson.M{"$in": []string{"waiting", "called"}},
				"rank":         bson.M{"$lt": myItem.Rank},
			})
			queueAhead = int(n)
		}
	}

	// queue number currently being called/served at this station, for a
	// "now serving" display alongside the patient's own position
	nowServingQueueNo := ""
	var servingItem models.QueueItem
	if db.GetCollection("queue_items").FindOne(c.Request.Context(), bson.M{
		"station_code": enc.CurrentStation,
		"status":       bson.M{"$in": []string{"called", "in_progress"}},
	}, options.FindOne().SetSort(bson.M{"called_at": -1})).Decode(&servingItem) == nil {
		nowServingQueueNo = servingItem.QueueNo
	}

	waitTime, waitBand, waitSource := 0, 0, "estimate"
	if st, ok := stationInfo[enc.CurrentStation]; ok {
		stat := services.StationStats{Source: "estimate"}
		if h.Stats != nil {
			if statsMap, _, err := h.Stats.GetAll(c.Request.Context()); err == nil {
				if s, ok := statsMap[enc.CurrentStation]; ok {
					stat = s
				}
			}
		}
		waitTime, waitBand = services.EstimateForPosition(stat, st, queueAhead)
		waitSource = stat.Source
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"encounter": enc,
			"patient": gin.H{
				"hn":           patient.HN,
				"display_name": patient.DisplayName,
			},
			"current_station":      enc.CurrentStation,
			"station_name":         stationInfo[enc.CurrentStation].Name,
			"station_floor":        stationInfo[enc.CurrentStation].Floor,
			"next_station":         nextStation,
			"next_station_name":    stationInfo[nextStation].Name,
			"next_station_floor":   stationInfo[nextStation].Floor,
			"estimated_wait":       waitTime,
			"queue_ahead":          queueAhead,
			"step_current":         stepCurrent,
			"step_total":           len(enc.Route),
			"route":                enc.Route,
			"queue_no":             enc.CurrentQueueNo,
			"est_wait_min":         waitTime,
			"est_wait_band":        waitBand,
			"wait_source":          waitSource,
			"queue_status":         queueStatus,
			"now_serving_queue_no": nowServingQueueNo,
			"updated_at":           time.Now(),
		},
		"message": "OK",
	})
}

type PreScreeningRequest struct {
	ChiefComplaint     string             `json:"chief_complaint"`
	FoodIntake         string             `json:"food_intake"`
	Symptoms           []string           `json:"symptoms"`
	Allergies          []string           `json:"allergies"`
	CurrentMedications []string           `json:"current_medications"`
	HomeVitals         *models.HomeVitals `json:"home_vitals"`
}

func (h *MobileHandler) SubmitPreScreening(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req PreScreeningRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	var user models.User
	db.GetCollection("users").FindOne(c.Request.Context(), bson.M{"_id": userID}).Decode(&user)
	var patientID primitive.ObjectID
	if user.PatientID != nil {
		patientID = *user.PatientID
	} else {
		patientID = user.ID
	}

	var enc models.Encounter
	var encounterID primitive.ObjectID
	err := db.GetCollection("encounters").FindOne(c.Request.Context(), bson.M{
		"patient_id": patientID,
		"status":     "active",
	}).Decode(&enc)
	if err == nil {
		encounterID = enc.ID
	}

	ps := &models.PreScreening{
		EncounterID:        encounterID,
		PatientID:          patientID,
		ChiefComplaint:     req.ChiefComplaint,
		FoodIntake:         req.FoodIntake,
		Symptoms:           req.Symptoms,
		Allergies:          req.Allergies,
		CurrentMedications: req.CurrentMedications,
		HomeVitals:         req.HomeVitals,
	}

	if err := h.PreScreeningService.Create(c.Request.Context(), ps); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": ps, "message": "ส่งข้อมูลสำเร็จ"})
}

type HomeVitalsRequest struct {
	SBP         int     `json:"sbp"`
	DBP         int     `json:"dbp"`
	Pulse       int     `json:"pulse"`
	Temperature float64 `json:"temperature"`
	SPO2        int     `json:"spo2"`
	Weight      float64 `json:"weight"`
}

func (h *MobileHandler) SubmitHomeVitals(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req HomeVitalsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	var user models.User
	db.GetCollection("users").FindOne(c.Request.Context(), bson.M{"_id": userID}).Decode(&user)
	patientID := user.ID
	if user.PatientID != nil {
		patientID = *user.PatientID
	}

	var enc models.Encounter
	var encounterID primitive.ObjectID
	err := db.GetCollection("encounters").FindOne(c.Request.Context(), bson.M{
		"patient_id": patientID,
		"status":     "active",
	}).Decode(&enc)
	if err == nil {
		encounterID = enc.ID
	}

	v := &models.Vitals{
		ID:          primitive.NewObjectID(),
		EncounterID: encounterID,
		PatientID:   patientID,
		Source:      "home",
		SBP:         req.SBP,
		DBP:         req.DBP,
		Pulse:       req.Pulse,
		Temperature: req.Temperature,
		SPO2:        req.SPO2,
		RecordedAt:  time.Now(),
		CreatedAt:   time.Now(),
	}

	_, err = db.GetCollection("vitals").InsertOne(c.Request.Context(), v)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": v, "message": "บันทึก vital signs จากบ้านสำเร็จ"})
}

type AIChatRequest struct {
	Message string `json:"message" binding:"required"`
}

func (h *MobileHandler) AIChat(c *gin.Context) {
	var req AIChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อความ"}})
		return
	}

	riskLevel, response := h.AIService.AIChat(req.Message)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"response":   response,
			"risk_level": riskLevel,
			"disclaimer": "ระบบเป็นเพียงผู้ช่วยคัดกรองเบื้องต้น แพทย์เป็นผู้ตัดสินใจขั้นสุดท้าย",
		},
		"message": "OK",
	})
}

func (h *MobileHandler) HelpRequest(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "ส่งคำขอความช่วยเหลือสำเร็จ"})
}

func (h *MobileHandler) GetNotifications(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var user models.User
	if err := db.GetCollection("users").FindOne(c.Request.Context(), bson.M{"_id": userID}).Decode(&user); err != nil || user.PatientID == nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบข้อมูลผู้ป่วย"}})
		return
	}
	notifs, err := h.NotificationService.GetByPatient(c.Request.Context(), *user.PatientID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": notifs, "message": "OK"})
}

func (h *MobileHandler) MarkNotificationRead(c *gin.Context) {
	notifIDStr := c.Param("id")
	notifID, err := primitive.ObjectIDFromHex(notifIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	userID, _ := c.Get("user_id")
	var user models.User
	if err := db.GetCollection("users").FindOne(c.Request.Context(), bson.M{"_id": userID}).Decode(&user); err != nil || user.PatientID == nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบข้อมูลผู้ป่วย"}})
		return
	}
	if err := h.NotificationService.MarkReadForPatient(c.Request.Context(), notifID, *user.PatientID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "OK"})
}

func RegisterMobileRoutes(r *gin.RouterGroup, h *MobileHandler, cfg *config.Config) {
	mobile := r.Group("/mobile")

	mobile.POST("/auth/register", h.Register)
	mobile.POST("/auth/login", h.Login)

	auth := mobile.Group("")
	auth.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	auth.Use(middleware.RoleMiddleware("patient"))
	auth.GET("/me", h.GetMe)
	auth.GET("/journey/current", h.GetCurrentJourney)
	auth.GET("/notifications", h.GetNotifications)
	auth.PATCH("/notifications/:id/read", h.MarkNotificationRead)
}
