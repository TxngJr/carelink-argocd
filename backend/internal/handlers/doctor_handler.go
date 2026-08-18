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

type DoctorHandler struct {
	DoctorService    *services.DoctorService
	EncounterService *services.EncounterService
	QueueService     *services.QueueService
	FlowEngine       *services.FlowEngineService
	OrderService     *services.OrderService
	PharmacyService  *services.PharmacyService
	NotificationSvc  *services.NotificationService
}

func NewDoctorHandler(ds *services.DoctorService, es *services.EncounterService, qs *services.QueueService, fe *services.FlowEngineService, os *services.OrderService, ps *services.PharmacyService, ns *services.NotificationService) *DoctorHandler {
	return &DoctorHandler{DoctorService: ds, EncounterService: es, QueueService: qs, FlowEngine: fe, OrderService: os, PharmacyService: ps, NotificationSvc: ns}
}

func (h *DoctorHandler) GetQueue(c *gin.Context) {
	items, err := h.QueueService.GetQueueByStation(c.Request.Context(), "PC")
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items, "message": "OK"})
}

func (h *DoctorHandler) GetSummary(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	summary, err := h.DoctorService.GetSummary(c.Request.Context(), encID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": summary, "message": "OK"})
}

type PreTriageRequest struct {
	Decision         string `json:"decision"`
	MessageToPatient string `json:"message_to_patient"`
}

func (h *DoctorHandler) SavePreTriage(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	var req PreTriageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	if enc, err := h.EncounterService.GetByID(c.Request.Context(), encID); err == nil {
		_ = h.QueueService.StartService(c.Request.Context(), encID, enc.CurrentStation)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"decision": req.Decision}, "message": "OK"})
}

type CreateOrdersRequest struct {
	Orders []OrderItem `json:"orders" binding:"required"`
}

type OrderItem struct {
	OrderType      string `json:"order_type"`
	OrderCode      string `json:"order_code"`
	OrderName      string `json:"order_name"`
	TargetStation  string `json:"target_station"`
	Priority       string `json:"priority"`
	ClinicalReason string `json:"clinical_reason"`
}

func (h *DoctorHandler) CreateOrders(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	enc, err := h.EncounterService.GetByID(c.Request.Context(), encID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบ encounter"}})
		return
	}

	_ = h.QueueService.StartService(c.Request.Context(), encID, enc.CurrentStation)

	var req CreateOrdersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	userID, _ := c.Get("user_id")

	var orders []models.Order
	for _, item := range req.Orders {
		orders = append(orders, models.Order{
			EncounterID:    encID,
			PatientID:      enc.PatientID,
			OrderedBy:      userID.(primitive.ObjectID),
			OrderType:      item.OrderType,
			OrderCode:      item.OrderCode,
			OrderName:      item.OrderName,
			TargetStation:  item.TargetStation,
			Priority:       item.Priority,
			ClinicalReason: item.ClinicalReason,
		})
	}

	if err := h.DoctorService.CreateOrders(c.Request.Context(), orders); err != nil {
		httpx.FailErr(c, err)
		return
	}

	realtime.HubInstance.BroadcastEvent(realtime.Event{Type: "ORDER_CREATED", Payload: map[string]interface{}{"encounter_id": encID.Hex()}})

	c.JSON(http.StatusOK, gin.H{"success": true, "data": orders, "message": "สร้างคำสั่งสำเร็จ"})
}

type ConfirmRouteRequest struct {
	Route            []string `json:"route" binding:"required"`
	Assessment       string   `json:"assessment"`
	Plan             string   `json:"plan"`
	TreatmentChoices []string `json:"treatment_choices"`
	DestinationToday string   `json:"destination_today"`
}

func (h *DoctorHandler) ConfirmRoute(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	var req ConfirmRouteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบ"}})
		return
	}

	userID, _ := c.Get("user_id")

	enc, err := h.EncounterService.GetByID(c.Request.Context(), encID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบ encounter"}})
		return
	}

	note := &models.DoctorNote{
		EncounterID:      encID,
		PatientID:        enc.PatientID,
		DoctorID:         userID.(primitive.ObjectID),
		Assessment:       req.Assessment,
		Plan:             req.Plan,
		TreatmentChoices: req.TreatmentChoices,
		DestinationToday: &req.DestinationToday,
		CalculatedRoute:  req.Route,
	}

	h.DoctorService.SaveDoctorNote(c.Request.Context(), note)
	h.DoctorService.ConfirmRoute(c.Request.Context(), encID, req.Route)

	for _, item := range req.Route {
		if item == "PD_VERIFY" || item == "PD_DISP" {
			h.PharmacyService.CreatePrescription(c.Request.Context(), &models.Prescription{
				EncounterID: encID,
				PatientID:   enc.PatientID,
				DoctorID:    userID.(primitive.ObjectID),
				Items: []models.PrescriptionItem{
					{DrugName: "Ondansetron", Strength: "8mg", Qty: 10, Instruction: "รับประทานครั้งละ 1 เม็ด เมื่อมีอาการคลื่นไส้"},
					{DrugName: "Penicillin V", Strength: "250mg", Qty: 20, Instruction: "รับประทานครั้งละ 1 เม็ด ก่อนอาหาร"},
				},
			})
		}
	}

	realtime.HubInstance.BroadcastEvent(realtime.Event{Type: "AMIS_RECOMMENDATION_CREATED", Payload: map[string]interface{}{"encounter_id": encID.Hex()}})

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"route": req.Route}, "message": "ยืนยันเส้นทางสำเร็จ"})
}

func (h *DoctorHandler) Complete(c *gin.Context) {
	encIDStr := c.Param("encounterId")
	encID, err := primitive.ObjectIDFromHex(encIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": gin.H{"code": "VALIDATION_ERROR", "message": "ID ไม่ถูกต้อง"}})
		return
	}

	enc, err := h.EncounterService.GetByID(c.Request.Context(), encID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": gin.H{"code": "NOT_FOUND", "message": "ไม่พบ encounter"}})
		return
	}

	// doctor works the patient through PC (first visit), RC (result review), and TD (treatment decision)
	stationCode := enc.CurrentStation
	if stationCode != "PC" && stationCode != "RC" && stationCode != "TD" {
		stationCode = "PC"
	}

	err = h.EncounterService.CompleteStation(c.Request.Context(), encID, stationCode, primitive.NilObjectID)
	if err != nil {
		httpx.FailErr(c, err)
		return
	}

	nextStation, _ := h.FlowEngine.GetNextStation(encID)
	if nextStation != "" {
		h.EncounterService.MoveToStation(c.Request.Context(), encID, nextStation, primitive.NilObjectID)
		realtime.BroadcastPatientMoved(encID.Hex(), stationCode, nextStation)
		realtime.BroadcastQueueUpdate(nextStation)
	}

	realtime.BroadcastDashboardKPI()
	_ = enc

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"next_station": nextStation}, "message": "OK"})
}

func RegisterDoctorRoutes(r *gin.RouterGroup, h *DoctorHandler, cfg *config.Config) {
	doc := r.Group("/doctor")
	doc.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	doc.Use(middleware.RoleMiddleware("doctor", "admin", "manager"))
	doc.GET("/queue", h.GetQueue)
	doc.GET("/:encounterId/summary", h.GetSummary)
	doc.POST("/:encounterId/pre-triage", h.SavePreTriage)
	doc.POST("/:encounterId/orders", h.CreateOrders)
	doc.POST("/:encounterId/confirm-route", h.ConfirmRoute)
	doc.POST("/:encounterId/complete", h.Complete)
}
