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

type VitalsHandler struct {
	VitalsService    *services.VitalsService
	EncounterService *services.EncounterService
	QueueService     *services.QueueService
}

func NewVitalsHandler(vs *services.VitalsService, es *services.EncounterService, qs *services.QueueService) *VitalsHandler {
	return &VitalsHandler{VitalsService: vs, EncounterService: es, QueueService: qs}
}

func (h *VitalsHandler) GetQueue(c *gin.Context) {
	items, err := h.QueueService.GetQueueByStation(c.Request.Context(), "VM")
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items, "message": "OK"})
}

type SaveVitalsRequest struct {
	SBP             int     `json:"sbp"`
	DBP             int     `json:"dbp"`
	Pulse           int     `json:"pulse"`
	Temperature     float64 `json:"temperature"`
	SPO2            int     `json:"spo2"`
	RespiratoryRate int     `json:"respiratory_rate"`
	Weight          float64 `json:"weight"`
	Height          float64 `json:"height"`
}

func (h *VitalsHandler) SaveVitals(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	var req SaveVitalsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	enc, err := h.EncounterService.GetByID(c.Request.Context(), encID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบ encounter"}})
		return
	}

	_ = h.QueueService.StartService(c.Request.Context(), encID, "VM")

	bmi := 0.0
	if req.Height > 0 {
		heightM := req.Height / 100
		bmi = req.Weight / (heightM * heightM)
	}

	vitals := &models.Vitals{
		EncounterID:     encID,
		PatientID:       enc.PatientID,
		Source:          "station",
		SBP:             req.SBP,
		DBP:             req.DBP,
		Pulse:           req.Pulse,
		Temperature:     req.Temperature,
		SPO2:            req.SPO2,
		RespiratoryRate: req.RespiratoryRate,
		Weight:          req.Weight,
		Height:          req.Height,
		BMI:             bmi,
	}

	if err := h.VitalsService.Create(c.Request.Context(), vitals); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": vitals, "message": "บันทึก vital signs สำเร็จ"})
}

func (h *VitalsHandler) SendToNurse(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	err = h.EncounterService.CompleteStation(c.Request.Context(), encID, "VM", primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	err = h.EncounterService.MoveToStation(c.Request.Context(), encID, "MHT", primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.BroadcastPatientMoved(encID.Hex(), "VM", "MHT")
	realtime.BroadcastQueueUpdate("VM")
	realtime.BroadcastQueueUpdate("MHT")
	realtime.BroadcastDashboardKPI()

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "ส่งต่อซักประวัติสำเร็จ"})
}

func RegisterVitalsRoutes(r *gin.RouterGroup, h *VitalsHandler, cfg *config.Config) {
	vit := r.Group("/vitals")
	vit.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	vit.Use(middleware.RoleMiddleware("vitals_staff", "admin", "manager"))
	vit.GET("/queue", h.GetQueue)
	vit.POST("/:encounterId", h.SaveVitals)
	vit.POST("/:encounterId/send-to-nurse", h.SendToNurse)
}
