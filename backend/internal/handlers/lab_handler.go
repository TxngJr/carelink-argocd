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

type LabHandler struct {
	LabService       *services.LabService
	OrderService     *services.OrderService
	EncounterService *services.EncounterService
	QueueService     *services.QueueService
}

func NewLabHandler(ls *services.LabService, os *services.OrderService, es *services.EncounterService, qs *services.QueueService) *LabHandler {
	return &LabHandler{LabService: ls, OrderService: os, EncounterService: es, QueueService: qs}
}

func (h *LabHandler) GetQueue(c *gin.Context) {
	results, err := h.LabService.GetQueue(c.Request.Context())
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": results, "message": "OK"})
}

// findLabResult resolves a URL id that may be either the lab_result _id or its order_id.
func (h *LabHandler) findLabResult(c *gin.Context) (*models.LabResult, bool) {
	id, err := primitive.ObjectIDFromHex(c.Param("orderId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return nil, false
	}
	var lr models.LabResult
	err = db.GetCollection("lab_results").FindOne(c.Request.Context(), bson.M{
		"$or": []bson.M{{"_id": id}, {"order_id": id}},
	}).Decode(&lr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบรายการตรวจ"}})
		return nil, false
	}
	return &lr, true
}

func (h *LabHandler) Collect(c *gin.Context) {
	lr, ok := h.findLabResult(c)
	if !ok {
		return
	}
	orderID := lr.OrderID

	_ = h.OrderService

	_ = h.QueueService.StartService(c.Request.Context(), lr.EncounterID, "LABC")

	err := h.LabService.Collect(c.Request.Context(), orderID, primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	db.GetCollection("orders").UpdateOne(c.Request.Context(),
		bson.M{"_id": orderID},
		bson.M{"$set": bson.M{"status": "in_progress"}})

	h.EncounterService.CompleteStation(c.Request.Context(), lr.EncounterID, "LABC", primitive.NilObjectID)
	h.EncounterService.MoveToStation(c.Request.Context(), lr.EncounterID, "LABA", primitive.NilObjectID)

	realtime.BroadcastQueueUpdate("LABC")
	realtime.BroadcastQueueUpdate("LABA")
	realtime.BroadcastPatientMoved(lr.EncounterID.Hex(), "LABC", "LABA")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "เก็บตัวอย่างสำเร็จ"})
}

func (h *LabHandler) StartAnalyze(c *gin.Context) {
	lr, ok := h.findLabResult(c)
	if !ok {
		return
	}
	orderID := lr.OrderID

	err := h.LabService.StartAnalyze(c.Request.Context(), orderID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "เริ่มวิเคราะห์สำเร็จ"})
}

type SaveLabResultsRequest struct {
	Results []models.LabValue `json:"results" binding:"required"`
}

func (h *LabHandler) SaveResults(c *gin.Context) {
	lr, ok := h.findLabResult(c)
	if !ok {
		return
	}
	orderID := lr.OrderID

	var req SaveLabResultsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	err := h.LabService.SaveResults(c.Request.Context(), orderID, req.Results)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.HubInstance.BroadcastEvent(realtime.Event{Type: "LAB_RESULT_READY", Payload: map[string]interface{}{"order_id": orderID.Hex()}})

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "บันทึกผลสำเร็จ"})
}

func (h *LabHandler) SendBack(c *gin.Context) {
	lr, ok := h.findLabResult(c)
	if !ok {
		return
	}
	orderID := lr.OrderID

	err := h.LabService.SendBack(c.Request.Context(), orderID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	db.GetCollection("orders").UpdateOne(c.Request.Context(),
		bson.M{"_id": orderID},
		bson.M{"$set": bson.M{"status": "completed"}})

	h.EncounterService.CompleteStation(c.Request.Context(), lr.EncounterID, "LABA", primitive.NilObjectID)
	h.EncounterService.MoveToStation(c.Request.Context(), lr.EncounterID, "RC", primitive.NilObjectID)

	realtime.HubInstance.BroadcastEvent(realtime.Event{Type: "LAB_RESULT_READY", Payload: map[string]interface{}{"order_id": orderID.Hex(), "status": "reported"}})
	realtime.BroadcastQueueUpdate("LABA")
	realtime.BroadcastQueueUpdate("RC")
	realtime.BroadcastPatientMoved(lr.EncounterID.Hex(), "LABA", "RC")

	c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "ส่งผลกลับสำเร็จ"})
}

func RegisterLabRoutes(r *gin.RouterGroup, h *LabHandler, cfg *config.Config) {
	lab := r.Group("/lab")
	lab.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	lab.Use(middleware.RoleMiddleware("lab_staff", "admin", "manager"))
	lab.GET("/queue", h.GetQueue)
	lab.POST("/:orderId/collect", h.Collect)
	lab.POST("/:orderId/start-analyze", h.StartAnalyze)
	lab.POST("/:orderId/results", h.SaveResults)
	lab.POST("/:orderId/send-back", h.SendBack)
}
