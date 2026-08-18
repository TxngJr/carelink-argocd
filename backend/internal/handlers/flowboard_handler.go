package handlers

import (
	"net/http"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/realtime"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type FlowBoardHandler struct {
	FlowBoardService *services.FlowBoardService
}

func NewFlowBoardHandler(fbs *services.FlowBoardService) *FlowBoardHandler {
	return &FlowBoardHandler{FlowBoardService: fbs}
}

func (h *FlowBoardHandler) GetBoard(c *gin.Context) {
	board, err := h.FlowBoardService.GetBoard(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": board, "message": "OK"})
}

type ReportBottleneckRequest struct {
	StationCode      string `json:"station_code" binding:"required"`
	Severity         string `json:"severity"` // high | medium | low
	EstimatedWaitMin int    `json:"estimated_wait_min"`
	Note             string `json:"note"`
}

func (h *FlowBoardHandler) ReportBottleneck(c *gin.Context) {
	var req ReportBottleneckRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณาระบุสถานี"}})
		return
	}

	reportedBy := "manager"
	if username, ok := c.Get("username"); ok {
		if u, ok := username.(string); ok && u != "" {
			reportedBy = "manager:" + u
		}
	}

	rec, err := h.FlowBoardService.ReportBottleneck(c.Request.Context(), req.StationCode, req.Severity, req.Note, reportedBy, req.EstimatedWaitMin)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.HubInstance.BroadcastEvent(realtime.Event{
		Type:    "AMIS_RECOMMENDATION_CREATED",
		Payload: map[string]interface{}{"station_code": req.StationCode, "type": "manual_bottleneck"},
	})
	realtime.BroadcastStationStatusUpdated(req.StationCode)
	realtime.BroadcastDashboardKPI()

	c.JSON(http.StatusOK, gin.H{"success": true, "data": rec, "message": "แจ้งคอขวดสำเร็จ"})
}

// RegisterFlowBoardRoutes: the board is visible to every authenticated role;
// only managers/admins can file manual bottleneck reports.
func RegisterFlowBoardRoutes(r *gin.RouterGroup, h *FlowBoardHandler, cfg *config.Config) {
	flow := r.Group("/flow")
	flow.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	flow.GET("/board", h.GetBoard)

	report := flow.Group("")
	report.Use(middleware.RoleMiddleware("manager", "admin"))
	report.POST("/report-bottleneck", h.ReportBottleneck)
}
