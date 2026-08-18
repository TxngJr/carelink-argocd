package handlers

import (
	"net/http"
	"time"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/models"
	"github.com/carelink/backend/internal/realtime"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type RegistrationHandler struct {
	EncounterService *services.EncounterService
	PatientService   *services.PatientService
	QueueService     *services.QueueService
	StationService   *services.StationService
}

func NewRegistrationHandler(es *services.EncounterService, ps *services.PatientService, qs *services.QueueService, ss *services.StationService) *RegistrationHandler {
	return &RegistrationHandler{EncounterService: es, PatientService: ps, QueueService: qs, StationService: ss}
}

func (h *RegistrationHandler) GetQueue(c *gin.Context) {
	items, err := h.QueueService.GetQueueByStation(c.Request.Context(), "NPR")
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items, "message": "OK"})
}

func (h *RegistrationHandler) Register(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	now := time.Now()
	_ = h.QueueService.StartService(c.Request.Context(), encID, "NPR")
	err = h.EncounterService.CompleteStation(c.Request.Context(), encID, "NPR", primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	err = h.EncounterService.MoveToStation(c.Request.Context(), encID, "EV", primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	enc, _ := h.EncounterService.GetByID(c.Request.Context(), encID)
	realtime.BroadcastPatientMoved(encID.Hex(), "NPR", "EV")
	realtime.BroadcastQueueUpdate("NPR")
	realtime.BroadcastQueueUpdate("EV")
	realtime.BroadcastDashboardKPI()

	_ = now
	c.JSON(http.StatusOK, gin.H{"success": true, "data": enc, "message": "ลงทะเบียนสำเร็จ"})
}

func (h *RegistrationHandler) VerifyEligibility(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	enc, err := h.EncounterService.GetByID(c.Request.Context(), encID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบ encounter"}})
		return
	}

	patient, _ := h.PatientService.GetByID(c.Request.Context(), enc.PatientID)
	if patient != nil {
		patient.EligibilityStatus = "verified"
		h.PatientService.Update(c.Request.Context(), patient)
	}

	err = h.EncounterService.CompleteStation(c.Request.Context(), encID, "EV", primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"eligibility": "verified"}, "message": "ตรวจสอบสิทธิสำเร็จ"})
}

func (h *RegistrationHandler) SendToVitals(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	err = h.EncounterService.MoveToStation(c.Request.Context(), encID, "VM", primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.BroadcastPatientMoved(encID.Hex(), "EV", "VM")
	realtime.BroadcastQueueUpdate("VM")
	realtime.BroadcastDashboardKPI()

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "ส่งต่อจุดวัดสัญญาณชีพสำเร็จ"})
}

type CreateEncounterRequest struct {
	PatientID       string `json:"patient_id" binding:"required"`
	AppointmentTime string `json:"appointment_time"`
	Priority        string `json:"priority"`
}

func (h *RegistrationHandler) CreateEncounter(c *gin.Context) {
	var req CreateEncounterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	patientID, err := primitive.ObjectIDFromHex(req.PatientID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "Patient ID ไม่ถูกต้อง"}})
		return
	}

	enc := &models.Encounter{
		PatientID:      patientID,
		VisitDate:      time.Now(),
		CurrentStation: "NPR",
		Status:         "active",
		Priority:       req.Priority,
		Route: []models.RouteStep{
			{StationCode: "NPR", Status: "in_progress"},
			{StationCode: "EV", Status: "pending"},
			{StationCode: "VM", Status: "pending"},
			{StationCode: "MHT", Status: "pending"},
			{StationCode: "PC", Status: "pending"},
		},
	}

	err = h.EncounterService.Create(c.Request.Context(), enc)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	h.QueueService.Enqueue(c.Request.Context(), &models.QueueItem{
		EncounterID: enc.ID,
		PatientID:   patientID,
		StationCode: "NPR",
		Status:      "waiting",
		Priority:    enc.Priority,
		QueueNo:     "NPR-01",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	})

	realtime.BroadcastQueueUpdate("NPR")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": enc, "message": "สร้าง encounter สำเร็จ"})
}

func RegisterRegistrationRoutes(r *gin.RouterGroup, h *RegistrationHandler, cfg *config.Config) {
	reg := r.Group("/registration")
	reg.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	reg.Use(middleware.RoleMiddleware("registration_staff", "admin", "manager"))
	reg.GET("/queue", h.GetQueue)
	reg.POST("/encounter", h.CreateEncounter)
	reg.POST("/:encounterId/register", h.Register)
	reg.POST("/:encounterId/verify-eligibility", h.VerifyEligibility)
	reg.POST("/:encounterId/send-to-vitals", h.SendToVitals)
}
