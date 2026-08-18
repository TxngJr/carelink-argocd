package handlers

import (
	"net/http"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/realtime"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type RadiationHandler struct {
	RadiationService *services.RadiationService
}

func NewRadiationHandler(rs *services.RadiationService) *RadiationHandler {
	return &RadiationHandler{RadiationService: rs}
}

func (h *RadiationHandler) GetSchedule(c *gin.Context) {
	sessions, err := h.RadiationService.GetSchedule(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": sessions, "message": "OK"})
}

func (h *RadiationHandler) Start(c *gin.Context) {
	sessionIDStr := c.Param("sessionId")
	sessionID, err := primitive.ObjectIDFromHex(sessionIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	if err := h.RadiationService.Start(c.Request.Context(), sessionID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.BroadcastStationStatusUpdated("RT_L1")
	realtime.BroadcastStationStatusUpdated("RT_L2")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "เริ่มฉายแสงสำเร็จ"})
}

func (h *RadiationHandler) Complete(c *gin.Context) {
	sessionIDStr := c.Param("sessionId")
	sessionID, err := primitive.ObjectIDFromHex(sessionIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	if err := h.RadiationService.Complete(c.Request.Context(), sessionID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.BroadcastStationStatusUpdated("RT_L1")
	realtime.BroadcastStationStatusUpdated("RT_L2")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "ฉายแสงเสร็จสิ้น"})
}

func (h *RadiationHandler) NoShow(c *gin.Context) {
	sessionIDStr := c.Param("sessionId")
	sessionID, err := primitive.ObjectIDFromHex(sessionIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	if err := h.RadiationService.NoShow(c.Request.Context(), sessionID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "Marked as no-show"})
}

func RegisterRadiationRoutes(r *gin.RouterGroup, h *RadiationHandler, cfg *config.Config) {
	rt := r.Group("/radiation")
	rt.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	rt.Use(middleware.RoleMiddleware("rt_staff", "admin", "manager"))
	rt.GET("/schedule", h.GetSchedule)
	rt.POST("/:sessionId/start", h.Start)
	rt.POST("/:sessionId/complete", h.Complete)
	rt.POST("/:sessionId/no-show", h.NoShow)
}
