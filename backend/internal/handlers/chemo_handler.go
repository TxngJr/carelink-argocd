package handlers

import (
	"net/http"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/models"
	"github.com/carelink/backend/internal/realtime"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ChemoHandler struct {
	ChemoService     *services.ChemoService
	EncounterService *services.EncounterService
	QueueService     *services.QueueService
}

func NewChemoHandler(cs *services.ChemoService, es *services.EncounterService, qs *services.QueueService) *ChemoHandler {
	return &ChemoHandler{ChemoService: cs, EncounterService: es, QueueService: qs}
}

func (h *ChemoHandler) GetChairs(c *gin.Context) {
	sessions, err := h.ChemoService.GetChairs(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": sessions, "message": "OK"})
}

type AssignChairRequest struct {
	ChairNo   int    `json:"chair_no" binding:"required"`
	Regimen   string `json:"regimen" binding:"required"`
	CycleText string `json:"cycle_text"`
}

func (h *ChemoHandler) AssignChair(c *gin.Context) {
	encIDStr := c.Param("id")
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

	var req AssignChairRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	_ = h.QueueService.StartService(c.Request.Context(), encID, "CHEMO_PRE")

	cs := &models.ChemoSession{
		EncounterID: encID,
		PatientID:   enc.PatientID,
		ChairNo:     req.ChairNo,
		Regimen:     req.Regimen,
		CycleText:   req.CycleText,
	}

	if err := h.ChemoService.AssignChair(c.Request.Context(), cs); err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.BroadcastStationStatusUpdated("CHEMO_INF")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": cs, "message": "จัดเก้าอี้สำเร็จ"})
}

func (h *ChemoHandler) Start(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := primitive.ObjectIDFromHex(sessionIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	if err := h.ChemoService.Start(c.Request.Context(), sessionID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	var session models.ChemoSession
	db.GetCollection("chemo_sessions").FindOne(c.Request.Context(), bson.M{"_id": sessionID}).Decode(&session)

	h.EncounterService.CompleteStation(c.Request.Context(), session.EncounterID, "CHEMO_PRE", primitive.NilObjectID)
	h.EncounterService.MoveToStation(c.Request.Context(), session.EncounterID, "CHEMO_INF", primitive.NilObjectID)
	_ = h.QueueService.StartService(c.Request.Context(), session.EncounterID, "CHEMO_INF")

	realtime.BroadcastStationStatusUpdated("CHEMO_INF")
	realtime.BroadcastPatientMoved(session.EncounterID.Hex(), "CHEMO_PRE", "CHEMO_INF")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "เริ่มให้ยาสำเร็จ"})
}

type ProgressRequest struct {
	Progress int `json:"progress"`
}

func (h *ChemoHandler) UpdateProgress(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := primitive.ObjectIDFromHex(sessionIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	var req ProgressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	if err := h.ChemoService.UpdateProgress(c.Request.Context(), sessionID, req.Progress); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "อัปเดต progress สำเร็จ"})
}

func (h *ChemoHandler) Complete(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := primitive.ObjectIDFromHex(sessionIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	if err := h.ChemoService.Complete(c.Request.Context(), sessionID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	var session models.ChemoSession
	db.GetCollection("chemo_sessions").FindOne(c.Request.Context(), bson.M{"_id": sessionID}).Decode(&session)

	h.EncounterService.CompleteStation(c.Request.Context(), session.EncounterID, "CHEMO_INF", primitive.NilObjectID)
	h.EncounterService.MoveToStation(c.Request.Context(), session.EncounterID, "PD_VERIFY", primitive.NilObjectID)

	realtime.BroadcastStationStatusUpdated("CHEMO_INF")
	realtime.BroadcastPatientMoved(session.EncounterID.Hex(), "CHEMO_INF", "PD_VERIFY")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "เสร็จสิ้นการให้ยา"})
}

func RegisterChemoRoutes(r *gin.RouterGroup, h *ChemoHandler, cfg *config.Config) {
	chemo := r.Group("/chemo")
	chemo.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	chemo.Use(middleware.RoleMiddleware("chemo_staff", "admin", "manager"))
	chemo.GET("/chairs", h.GetChairs)
	chemo.POST("/:id/assign-chair", h.AssignChair)
	chemo.POST("/:id/start", h.Start)
	chemo.PATCH("/:id/progress", h.UpdateProgress)
	chemo.POST("/:id/complete", h.Complete)
}
