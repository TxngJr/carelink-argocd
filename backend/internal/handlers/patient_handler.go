package handlers

import (
	"net/http"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/realtime"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type PatientHandler struct {
	PatientService   *services.PatientService
	EncounterService *services.EncounterService
}

func NewPatientHandler(ps *services.PatientService, es *services.EncounterService) *PatientHandler {
	return &PatientHandler{PatientService: ps, EncounterService: es}
}

func (h *PatientHandler) ListPatients(c *gin.Context) {
	patients, err := h.PatientService.List(c.Request.Context(), bson.M{})
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": patients, "message": "OK"})
}

func (h *PatientHandler) GetPatient(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}
	patient, err := h.PatientService.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบผู้ป่วย"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": patient, "message": "OK"})
}

func (h *PatientHandler) ListEncounters(c *gin.Context) {
	encs, err := h.EncounterService.List(c.Request.Context(), bson.M{})
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": encs, "message": "OK"})
}

func (h *PatientHandler) GetEncounter(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}
	enc, err := h.EncounterService.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบ encounter"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": enc, "message": "OK"})
}

func (h *PatientHandler) GetJourney(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}
	journey, err := h.EncounterService.GetJourney(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบ journey"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": journey, "message": "OK"})
}

type MoveRequest struct {
	ToStation string `json:"to_station" binding:"required"`
}

func (h *PatientHandler) MoveEncounter(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	var req MoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณาระบุสถานีปลายทาง"}})
		return
	}

	enc, err := h.EncounterService.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบ encounter"}})
		return
	}
	fromStation := enc.CurrentStation

	h.EncounterService.CompleteStation(c.Request.Context(), id, fromStation, primitive.NilObjectID)
	if err := h.EncounterService.MoveToStation(c.Request.Context(), id, req.ToStation, primitive.NilObjectID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.BroadcastPatientMoved(id.Hex(), fromStation, req.ToStation)
	realtime.BroadcastQueueUpdate(fromStation)
	realtime.BroadcastQueueUpdate(req.ToStation)
	realtime.BroadcastDashboardKPI()

	updated, _ := h.EncounterService.GetByID(c.Request.Context(), id)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": updated, "message": "ย้ายสถานีสำเร็จ"})
}

type PriorityRequest struct {
	Priority string `json:"priority" binding:"required"`
}

func (h *PatientHandler) UpdatePriority(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	var req PriorityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณาระบุ priority"}})
		return
	}

	if err := h.EncounterService.UpdatePriority(c.Request.Context(), id, req.Priority); err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.BroadcastDashboardKPI()
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"priority": req.Priority}, "message": "อัปเดต priority สำเร็จ"})
}

func RegisterPatientRoutes(r *gin.RouterGroup, h *PatientHandler, cfg *config.Config) {
	pat := r.Group("/patients")
	pat.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	pat.Use(middleware.RoleMiddleware("nurse", "doctor"))
	pat.GET("", h.ListPatients)
	pat.GET("/:id", h.GetPatient)

	enc := r.Group("/encounters")
	enc.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	enc.Use(middleware.RoleMiddleware("nurse", "doctor"))
	enc.GET("", h.ListEncounters)
	enc.GET("/:id", h.GetEncounter)
	enc.GET("/:id/journey", h.GetJourney)
	enc.POST("/:id/move", h.MoveEncounter)
	enc.PATCH("/:id/priority", h.UpdatePriority)
}
