package handlers

import (
	"net/http"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/models"
	"github.com/carelink/backend/internal/realtime"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type NurseHandler struct {
	NurseService     *services.NurseService
	EncounterService *services.EncounterService
	QueueService     *services.QueueService
}

func NewNurseHandler(ns *services.NurseService, es *services.EncounterService, qs *services.QueueService) *NurseHandler {
	return &NurseHandler{NurseService: ns, EncounterService: es, QueueService: qs}
}

func (h *NurseHandler) GetQueue(c *gin.Context) {
	items, err := h.QueueService.GetQueueByStation(c.Request.Context(), "MHT")
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items, "message": "OK"})
}

func (h *NurseHandler) GetWorkup(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	workup, err := h.NurseService.GetWorkup(c.Request.Context(), encID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": workup, "message": "OK"})
}

type AssessmentRequest struct {
	ChiefComplaint      string   `json:"chief_complaint"`
	PainScore           int      `json:"pain_score"`
	SymptomsReview      []string `json:"symptoms_review"`
	HPI                 string   `json:"hpi"`
	CurrentChemoRegimen string   `json:"current_chemo_regimen"`
	RegularMedications  []string `json:"regular_medications"`
	SmokingStatus       string   `json:"smoking_status"`
	AlcoholStatus       string   `json:"alcohol_status"`
	NurseNote           string   `json:"nurse_note"`
	IsUrgent            bool     `json:"is_urgent"`
}

func (h *NurseHandler) SaveAssessment(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	var req AssessmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	enc, err := h.EncounterService.GetByID(c.Request.Context(), encID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบ encounter"}})
		return
	}

	_ = h.QueueService.StartService(c.Request.Context(), encID, "MHT")

	userID, _ := c.Get("user_id")

	na := &models.NursingAssessment{
		EncounterID:         encID,
		PatientID:           enc.PatientID,
		ChiefComplaint:      req.ChiefComplaint,
		PainScore:           req.PainScore,
		SymptomsReview:      req.SymptomsReview,
		HPI:                 req.HPI,
		CurrentChemoRegimen: req.CurrentChemoRegimen,
		RegularMedications:  req.RegularMedications,
		SmokingStatus:       req.SmokingStatus,
		AlcoholStatus:       req.AlcoholStatus,
		NurseNote:           req.NurseNote,
		IsUrgent:            req.IsUrgent,
		RecordedBy:          userID.(primitive.ObjectID),
	}

	if err := h.NurseService.CreateAssessment(c.Request.Context(), na); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": na, "message": "บันทึกการซักประวัติสำเร็จ"})
}

func (h *NurseHandler) MarkUrgent(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	err = h.EncounterService.UpdatePriority(c.Request.Context(), encID, "urgent")
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.BroadcastDashboardKPI()

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "-marked as urgent"})
}

func (h *NurseHandler) SendToDoctor(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	err = h.EncounterService.CompleteStation(c.Request.Context(), encID, "MHT", primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	err = h.EncounterService.MoveToStation(c.Request.Context(), encID, "PC", primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.BroadcastPatientMoved(encID.Hex(), "MHT", "PC")
	realtime.BroadcastQueueUpdate("MHT")
	realtime.BroadcastQueueUpdate("PC")
	realtime.BroadcastDashboardKPI()

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "ส่งต่อแพทย์สำเร็จ"})
}

func RegisterNurseRoutes(r *gin.RouterGroup, h *NurseHandler, cfg *config.Config) {
	nurse := r.Group("/nurse")
	nurse.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	nurse.Use(middleware.RoleMiddleware("nurse", "admin", "manager"))
	nurse.GET("/queue", h.GetQueue)
	nurse.GET("/:encounterId/workup", h.GetWorkup)
	nurse.POST("/:encounterId/assessment", h.SaveAssessment)
	nurse.POST("/:encounterId/urgent", h.MarkUrgent)
	nurse.POST("/:encounterId/send-to-doctor", h.SendToDoctor)
}
