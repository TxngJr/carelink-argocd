package handlers

import (
	"net/http"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/models"
	"github.com/carelink/backend/internal/realtime"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type StationQueueHandler struct {
	QueueService        *services.QueueService
	StationService      *services.StationService
	NotificationService *services.NotificationService
}

func stationAllowed(c *gin.Context, code string) bool {
	role := c.MustGet("role").(string)
	isPC := code == "PC" || code == "PC2" || code == "PC3" || code == "PC4"
	allowed := (role == "doctor" && isPC) || (role == "nurse" && !isPC)
	if !allowed {
		httpx.Fail(c, http.StatusForbidden, "FORBIDDEN", "บทบาทนี้ไม่มีสิทธิ์จัดการ Station นี้")
	}
	return allowed
}

func NewStationQueueHandler(qs *services.QueueService, ss *services.StationService, ns *services.NotificationService) *StationQueueHandler {
	return &StationQueueHandler{QueueService: qs, StationService: ss, NotificationService: ns}
}

func (h *StationQueueHandler) GetQueue(c *gin.Context) {
	code := c.Param("code")
	if !stationAllowed(c, code) {
		return
	}
	items, err := h.QueueService.GetQueueByStation(c.Request.Context(), code)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	nowServing := make([]models.QueueItem, 0)
	waiting, called, inProgress := 0, 0, 0
	for _, it := range items {
		switch it.Status {
		case "waiting":
			waiting++
		case "called":
			called++
			nowServing = append(nowServing, it)
		case "in_progress":
			inProgress++
			nowServing = append(nowServing, it)
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"items":       items,
		"now_serving": nowServing,
		"counts":      gin.H{"waiting": waiting, "called": called, "in_progress": inProgress},
	}, "message": "OK"})
}

func (h *StationQueueHandler) CallNext(c *gin.Context) {
	code := c.Param("code")
	if !stationAllowed(c, code) {
		return
	}
	staffID := c.MustGet("user_id").(primitive.ObjectID)

	item, err := h.QueueService.CallNext(c.Request.Context(), code, staffID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "EMPTY_QUEUE", "message": "ไม่มีคิวรอ"}})
		return
	}

	realtime.BroadcastQueueCalled(code, item.QueueNo, item.PatientID.Hex(), item.CallCount)
	realtime.BroadcastQueueUpdate(code)

	if station, err := h.StationService.GetByCode(c.Request.Context(), code); err == nil {
		message := "ถึงคิวของคุณแล้ว เชิญที่ " + station.Name
		h.NotificationService.Create(c.Request.Context(), &models.Notification{
			PatientID:   item.PatientID,
			EncounterID: item.EncounterID,
			Channel:     "in_app",
			Title:       "ถึงคิวของคุณแล้ว",
			Message:     message,
			Type:        "queue_called",
			IsRead:      false,
		})
		realtime.BroadcastNotification(item.PatientID.Hex(), "ถึงคิวของคุณแล้ว", message, "queue_called")
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"queue_item": item}, "message": "เรียกคิวสำเร็จ"})
}

func (h *StationQueueHandler) Start(c *gin.Context) {
	code := c.Param("code")
	if !stationAllowed(c, code) {
		return
	}
	itemID, err := primitive.ObjectIDFromHex(c.Param("itemId"))
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "ID ไม่ถูกต้อง")
		return
	}
	item, err := h.QueueService.StartItem(c.Request.Context(), itemID, code, c.MustGet("user_id").(primitive.ObjectID))
	if err != nil {
		httpx.Fail(c, http.StatusConflict, "INVALID_STATE", "ไม่สามารถเริ่มคิวนี้ได้")
		return
	}
	realtime.BroadcastQueueUpdate(code)
	httpx.OK(c, gin.H{"queue_item": item}, "เริ่มให้บริการแล้ว")
}

func (h *StationQueueHandler) Complete(c *gin.Context) {
	code := c.Param("code")
	if !stationAllowed(c, code) {
		return
	}
	itemID, err := primitive.ObjectIDFromHex(c.Param("itemId"))
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "ID ไม่ถูกต้อง")
		return
	}
	item, next, err := h.QueueService.CompleteAndAdvance(c.Request.Context(), itemID, code, c.MustGet("user_id").(primitive.ObjectID))
	if err != nil {
		httpx.Fail(c, http.StatusConflict, "INVALID_STATE", err.Error())
		return
	}
	realtime.BroadcastQueueUpdate(code)
	if next != nil {
		realtime.BroadcastPatientMoved(item.EncounterID.Hex(), code, next.StationCode)
		realtime.BroadcastQueueUpdate(next.StationCode)
		if station, stationErr := h.StationService.GetByCode(c.Request.Context(), next.StationCode); stationErr == nil {
			_ = h.NotificationService.Create(c.Request.Context(), &models.Notification{
				PatientID: next.PatientID, EncounterID: next.EncounterID, Channel: "in_app",
				Title: "ไปยังจุดถัดไป", Message: "กรุณาไปที่ " + station.Name,
				Type: "station_changed", IsRead: false,
			})
			if next.EstimatedWaitMin <= station.AverageServiceMin*2 {
				_ = h.NotificationService.Create(c.Request.Context(), &models.Notification{
					PatientID: next.PatientID, EncounterID: next.EncounterID, Channel: "in_app",
					Title: "ใกล้ถึงคิวแล้ว", Message: "ขณะนี้มีผู้ป่วยข้างหน้าคุณไม่เกิน 2 คิวที่ " + station.Name,
					Type: "queue_near", IsRead: false,
				})
			}
		}
	}
	httpx.OK(c, gin.H{"queue_item": item, "next_queue_item": next}, "เสร็จสิ้น Station แล้ว")
}

func (h *StationQueueHandler) Recall(c *gin.Context) {
	if !stationAllowed(c, c.Param("code")) {
		return
	}
	itemID, err := primitive.ObjectIDFromHex(c.Param("itemId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}
	staffID := c.MustGet("user_id").(primitive.ObjectID)

	item, err := h.QueueService.Recall(c.Request.Context(), itemID, c.Param("code"), staffID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบคิวที่เรียกอยู่"}})
		return
	}

	realtime.BroadcastQueueCalled(item.StationCode, item.QueueNo, item.PatientID.Hex(), item.CallCount)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"queue_item": item}, "message": "เรียกซ้ำสำเร็จ"})
}

func (h *StationQueueHandler) Skip(c *gin.Context) {
	if !stationAllowed(c, c.Param("code")) {
		return
	}
	itemID, err := primitive.ObjectIDFromHex(c.Param("itemId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}
	staffID := c.MustGet("user_id").(primitive.ObjectID)

	item, err := h.QueueService.Skip(c.Request.Context(), itemID, c.Param("code"), staffID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบคิว"}})
		return
	}

	realtime.BroadcastQueueUpdate(item.StationCode)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"queue_item": item}, "message": "ข้ามคิวสำเร็จ"})
}

func (h *StationQueueHandler) Requeue(c *gin.Context) {
	if !stationAllowed(c, c.Param("code")) {
		return
	}
	itemID, err := primitive.ObjectIDFromHex(c.Param("itemId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}
	staffID := c.MustGet("user_id").(primitive.ObjectID)

	item, err := h.QueueService.Requeue(c.Request.Context(), itemID, c.Param("code"), staffID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบคิว"}})
		return
	}

	realtime.BroadcastQueueUpdate(item.StationCode)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"queue_item": item}, "message": "นำคิวกลับเข้าแถวสำเร็จ"})
}

func RegisterStationQueueRoutes(r *gin.RouterGroup, h *StationQueueHandler, cfg *config.Config) {
	sq := r.Group("/stations")
	sq.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	sq.Use(middleware.RoleMiddleware("nurse", "doctor"))
	sq.GET("/:code/queue", h.GetQueue)
	sq.POST("/:code/call-next", h.CallNext)
	sq.POST("/:code/queue/:itemId/start", h.Start)
	sq.POST("/:code/queue/:itemId/complete", h.Complete)
	sq.POST("/:code/queue/:itemId/recall", h.Recall)
	sq.POST("/:code/queue/:itemId/skip", h.Skip)
	sq.POST("/:code/queue/:itemId/requeue", h.Requeue)
}
