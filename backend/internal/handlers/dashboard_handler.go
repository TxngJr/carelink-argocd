package handlers

import (
	"net/http"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DashboardHandler struct {
	DashboardService *services.DashboardService
	FlowEngine       *services.FlowEngineService
}

func NewDashboardHandler(ds *services.DashboardService, fe *services.FlowEngineService) *DashboardHandler {
	return &DashboardHandler{DashboardService: ds, FlowEngine: fe}
}

func (h *DashboardHandler) GetKPIs(c *gin.Context) {
	kpis, err := h.DashboardService.GetKPIs(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": kpis, "message": "OK"})
}

func (h *DashboardHandler) GetStations(c *gin.Context) {
	loads, err := h.DashboardService.GetStationLoads(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": loads, "message": "OK"})
}

func (h *DashboardHandler) GetPatients(c *gin.Context) {
	patients, err := h.DashboardService.GetActivePatients(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": patients, "message": "OK"})
}

func (h *DashboardHandler) GetRecommendations(c *gin.Context) {
	recs, err := h.FlowEngine.GetRecommendations(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": recs, "message": "OK"})
}

func (h *DashboardHandler) AcceptRecommendation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	userID, _ := c.Get("user_id")
	if err := h.FlowEngine.AcceptRecommendation(c.Request.Context(), id, userID.(primitive.ObjectID)); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "OK"})
}

func (h *DashboardHandler) RejectRecommendation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	if err := h.FlowEngine.RejectRecommendation(c.Request.Context(), id); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "OK"})
}

func RegisterDashboardRoutes(r *gin.RouterGroup, h *DashboardHandler, cfg *config.Config) {
	dash := r.Group("/dashboard")
	dash.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	dash.Use(middleware.RoleMiddleware("admin", "manager"))
	dash.GET("/kpis", h.GetKPIs)
	dash.GET("/stations", h.GetStations)
	dash.GET("/patients", h.GetPatients)
	dash.GET("/recommendations", h.GetRecommendations)
	dash.POST("/recommendations/:id/accept", h.AcceptRecommendation)
	dash.POST("/recommendations/:id/reject", h.RejectRecommendation)
}
