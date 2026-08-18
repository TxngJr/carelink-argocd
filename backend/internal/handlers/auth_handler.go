package handlers

import (
	"net/http"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type AuthHandler struct {
	AuthService *services.AuthService
	Cfg         *config.Config
}

func NewAuthHandler(as *services.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{AuthService: as, Cfg: cfg}
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	user, token, err := h.AuthService.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": gin.H{"code": "UNAUTHORIZED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"token": token,
			"user": gin.H{
				"id":           user.ID,
				"display_name": user.DisplayName,
				"role":         user.Role,
				"username":     user.Username,
			},
		},
		"message": "OK",
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	user, err := h.AuthService.GetUserByID(c.Request.Context(), userID.(primitive.ObjectID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบผู้ใช้"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"id":            user.ID,
			"display_name":  user.DisplayName,
			"role":          user.Role,
			"username":      user.Username,
			"department":    user.Department,
			"station_codes": user.StationCodes,
		},
		"message": "OK",
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "OK"})
}

func RegisterAuthRoutes(r *gin.RouterGroup, h *AuthHandler, cfg *config.Config) {
	r.POST("/auth/login", h.Login)
	r.POST("/auth/logout", h.Logout)

	auth := r.Group("/auth")
	auth.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	auth.GET("/me", h.Me)
}
