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

type PharmacyHandler struct {
	PharmacyService  *services.PharmacyService
	EncounterService *services.EncounterService
	QueueService     *services.QueueService
}

func NewPharmacyHandler(ps *services.PharmacyService, es *services.EncounterService, qs *services.QueueService) *PharmacyHandler {
	return &PharmacyHandler{PharmacyService: ps, EncounterService: es, QueueService: qs}
}

func (h *PharmacyHandler) GetQueue(c *gin.Context) {
	prescriptions, err := h.PharmacyService.GetQueue(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": prescriptions, "message": "OK"})
}

func (h *PharmacyHandler) StartPrepare(c *gin.Context) {
	rxIDStr := c.Param("rxId")
	rxID, err := primitive.ObjectIDFromHex(rxIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	var rx models.Prescription
	if db.GetCollection("prescriptions").FindOne(c.Request.Context(), bson.M{"_id": rxID}).Decode(&rx) == nil {
		_ = h.QueueService.StartService(c.Request.Context(), rx.EncounterID, "PD_VERIFY")
	}

	if err := h.PharmacyService.StartPrepare(c.Request.Context(), rxID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "เริ่มจัดยาสำเร็จ"})
}

func (h *PharmacyHandler) Review(c *gin.Context) {
	rxIDStr := c.Param("rxId")
	rxID, err := primitive.ObjectIDFromHex(rxIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	if err := h.PharmacyService.Review(c.Request.Context(), rxID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "ตรวจยาสำเร็จ"})
}

func (h *PharmacyHandler) Ready(c *gin.Context) {
	rxIDStr := c.Param("rxId")
	rxID, err := primitive.ObjectIDFromHex(rxIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	if err := h.PharmacyService.Ready(c.Request.Context(), rxID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	var rx models.Prescription
	db.GetCollection("prescriptions").FindOne(c.Request.Context(), bson.M{"_id": rxID}).Decode(&rx)

	h.EncounterService.CompleteStation(c.Request.Context(), rx.EncounterID, "PD_VERIFY", primitive.NilObjectID)
	h.EncounterService.MoveToStation(c.Request.Context(), rx.EncounterID, "PD_DISP", primitive.NilObjectID)

	realtime.HubInstance.BroadcastEvent(realtime.Event{Type: "PHARMACY_READY", Payload: map[string]interface{}{"rx_id": rxID.Hex()}})
	realtime.BroadcastPatientMoved(rx.EncounterID.Hex(), "PD_VERIFY", "PD_DISP")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "พร้อมจ่ายยา"})
}

func (h *PharmacyHandler) Dispense(c *gin.Context) {
	rxIDStr := c.Param("rxId")
	rxID, err := primitive.ObjectIDFromHex(rxIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	if err := h.PharmacyService.Dispense(c.Request.Context(), rxID); err != nil {
		httpx.FailErr(c, err)
		return
	}

	var rx models.Prescription
	db.GetCollection("prescriptions").FindOne(c.Request.Context(), bson.M{"_id": rxID}).Decode(&rx)

	h.EncounterService.CompleteStation(c.Request.Context(), rx.EncounterID, "PD_DISP", primitive.NilObjectID)
	h.EncounterService.MoveToStation(c.Request.Context(), rx.EncounterID, "DH", primitive.NilObjectID)

	realtime.HubInstance.BroadcastEvent(realtime.Event{Type: "PHARMACY_READY", Payload: map[string]interface{}{"rx_id": rxID.Hex(), "status": "dispensed"}})
	realtime.BroadcastPatientMoved(rx.EncounterID.Hex(), "PD_DISP", "DH")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "จ่ายยาสำเร็จ"})
}

func RegisterPharmacyRoutes(r *gin.RouterGroup, h *PharmacyHandler, cfg *config.Config) {
	pd := r.Group("/pharmacy")
	pd.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	pd.Use(middleware.RoleMiddleware("pharmacy_staff", "admin", "manager"))
	pd.GET("/queue", h.GetQueue)
	pd.POST("/:rxId/start-prepare", h.StartPrepare)
	pd.POST("/:rxId/review", h.Review)
	pd.POST("/:rxId/ready", h.Ready)
	pd.POST("/:rxId/dispense", h.Dispense)
}
