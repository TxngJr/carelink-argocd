package handlers

import (
	"net/http"
	"strings"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// TVHandler serves the unauthenticated hallway/kiosk display. Deliberately
// registered with no auth middleware — the payload (TVService) carries no PII.
type TVHandler struct {
	TVService *services.TVService
	Cfg       *config.Config
}

func NewTVHandler(tv *services.TVService, cfg *config.Config) *TVHandler {
	return &TVHandler{TVService: tv, Cfg: cfg}
}

func (h *TVHandler) GetBoard(c *gin.Context) {
	if h.Cfg.TVAccessKey != "" && c.Query("key") != h.Cfg.TVAccessKey {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "error": gin.H{"code": "FORBIDDEN", "message": "key ไม่ถูกต้อง"}})
		return
	}

	var codes []string
	if q := c.Query("stations"); q != "" {
		codes = strings.Split(q, ",")
	}

	board, err := h.TVService.GetBoard(c.Request.Context(), codes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": gin.H{"code": "INTERNAL_ERROR", "message": "โหลดข้อมูลไม่สำเร็จ"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": board, "message": "OK"})
}

func RegisterTVRoutes(r *gin.RouterGroup, h *TVHandler) {
	pub := r.Group("/public")
	pub.GET("/tv", h.GetBoard)
}
