package handlers

import (
	"net/http"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type MapHandler struct {
	MapService *services.MapService
}

func NewMapHandler(ms *services.MapService) *MapHandler {
	return &MapHandler{MapService: ms}
}

func (h *MapHandler) GetOverview(c *gin.Context) {
	overview, err := h.MapService.GetOverview(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": overview, "message": "OK"})
}

// RegisterMapRoutes: staff-only — this payload includes patient names/HNs
// per station, so patient tokens must not be able to fetch it. Patients get
// the aggregate-only GET /api/mobile/overview instead.
func RegisterMapRoutes(r *gin.RouterGroup, h *MapHandler, cfg *config.Config) {
	m := r.Group("/map")
	m.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	m.Use(middleware.RoleMiddleware(
		"registration_staff", "vitals_staff", "nurse", "doctor",
		"lab_staff", "chemo_staff", "rt_staff", "pharmacy_staff",
	))
	m.GET("/overview", h.GetOverview)
}
