package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/httpx"
	"github.com/carelink/backend/internal/middleware"
	"github.com/carelink/backend/internal/models"
	"github.com/carelink/backend/internal/realtime"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type AppointmentHandler struct {
	Service *services.AppointmentService
}

func NewAppointmentHandler(service *services.AppointmentService) *AppointmentHandler {
	return &AppointmentHandler{Service: service}
}

type appointmentSubmissionRequest struct {
	ChiefComplaint string                     `json:"chief_complaint"`
	Measurements   models.PatientMeasurements `json:"measurements"`
}

func appointmentError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrAppointmentConflict):
		httpx.Fail(c, http.StatusConflict, "INVALID_STATE", "ไม่สามารถทำรายการในสถานะปัจจุบันได้")
	case errors.Is(err, mongo.ErrNoDocuments):
		httpx.Fail(c, http.StatusNotFound, "NOT_FOUND", "ไม่พบคำขอนัด")
	default:
		httpx.Fail(c, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
	}
}

func objectIDParam(c *gin.Context, name string) (primitive.ObjectID, bool) {
	id, err := primitive.ObjectIDFromHex(c.Param(name))
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "ID ไม่ถูกต้อง")
		return primitive.NilObjectID, false
	}
	return id, true
}

func (h *AppointmentHandler) patientID(c *gin.Context) (primitive.ObjectID, bool) {
	id, err := h.Service.PatientIDForUser(c.Request.Context(), c.MustGet("user_id").(primitive.ObjectID))
	if err != nil {
		httpx.Fail(c, http.StatusNotFound, "NOT_FOUND", "ไม่พบข้อมูลผู้ป่วย")
		return primitive.NilObjectID, false
	}
	return id, true
}

func (h *AppointmentHandler) Create(c *gin.Context) {
	patientID, ok := h.patientID(c)
	if !ok {
		return
	}
	var body appointmentSubmissionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง")
		return
	}
	row, err := h.Service.Create(c.Request.Context(), patientID, body.ChiefComplaint, body.Measurements)
	if err != nil {
		appointmentError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": row, "message": "ส่งคำขอนัดสำเร็จ"})
}

func (h *AppointmentHandler) Current(c *gin.Context) {
	patientID, ok := h.patientID(c)
	if !ok {
		return
	}
	row, err := h.Service.GetCurrent(c.Request.Context(), patientID)
	if errors.Is(err, mongo.ErrNoDocuments) {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": nil, "message": "ยังไม่มีคำขอนัด"})
		return
	}
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	httpx.OK(c, row, "OK")
}

func (h *AppointmentHandler) Update(c *gin.Context) {
	id, ok := objectIDParam(c, "id")
	if !ok {
		return
	}
	patientID, ok := h.patientID(c)
	if !ok {
		return
	}
	var body appointmentSubmissionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง")
		return
	}
	row, err := h.Service.UpdateSubmission(c.Request.Context(), id, patientID, body.ChiefComplaint, body.Measurements)
	if err != nil {
		appointmentError(c, err)
		return
	}
	httpx.OK(c, row, "แก้ไขคำขอสำเร็จ")
}

func (h *AppointmentHandler) Cancel(c *gin.Context) {
	id, ok := objectIDParam(c, "id")
	if !ok {
		return
	}
	patientID, ok := h.patientID(c)
	if !ok {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&body)
	if err := h.Service.Cancel(c.Request.Context(), id, patientID, body.Reason); err != nil {
		appointmentError(c, err)
		return
	}
	httpx.OK(c, nil, "ยกเลิกคำขอแล้ว")
}

func (h *AppointmentHandler) ReportArrival(c *gin.Context) {
	id, ok := objectIDParam(c, "id")
	if !ok {
		return
	}
	patientID, ok := h.patientID(c)
	if !ok {
		return
	}
	row, err := h.Service.ReportArrival(c.Request.Context(), id, patientID)
	if err != nil {
		appointmentError(c, err)
		return
	}
	httpx.OK(c, row, "แจ้งการมาถึงแล้ว กรุณารอพยาบาลยืนยัน")
}

func (h *AppointmentHandler) List(c *gin.Context) {
	rows, err := h.Service.List(c.Request.Context(), c.Query("status"))
	if err != nil {
		httpx.FailErr(c, err)
		return
	}
	httpx.OK(c, rows, "OK")
}

func (h *AppointmentHandler) Detail(c *gin.Context) {
	id, ok := objectIDParam(c, "id")
	if !ok {
		return
	}
	row, err := h.Service.Get(c.Request.Context(), id)
	if err != nil {
		appointmentError(c, err)
		return
	}
	httpx.OK(c, row, "OK")
}

type scheduleRequest struct {
	AppointmentAt string `json:"appointment_at"`
	Note          string `json:"note"`
	AssignedPC    string `json:"assigned_pc"`
}

func parseAppointmentTime(value string) (time.Time, error) {
	return time.Parse(time.RFC3339, value)
}

func (h *AppointmentHandler) Propose(c *gin.Context) {
	id, ok := objectIDParam(c, "id")
	if !ok {
		return
	}
	var body scheduleRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง")
		return
	}
	at, err := parseAppointmentTime(body.AppointmentAt)
	if err != nil {
		appointmentError(c, errors.New("วันและเวลาไม่ถูกต้อง"))
		return
	}
	row, err := h.Service.Propose(c.Request.Context(), id, at, body.Note)
	if err != nil {
		appointmentError(c, err)
		return
	}
	httpx.OK(c, row, "เสนอวันนัดแล้ว")
}

func (h *AppointmentHandler) Confirm(c *gin.Context) {
	id, ok := objectIDParam(c, "id")
	if !ok {
		return
	}
	var body scheduleRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง")
		return
	}
	at, err := parseAppointmentTime(body.AppointmentAt)
	if err != nil {
		appointmentError(c, errors.New("วันและเวลาไม่ถูกต้อง"))
		return
	}
	row, err := h.Service.Confirm(c.Request.Context(), id, at, body.AssignedPC, body.Note)
	if err != nil {
		appointmentError(c, err)
		return
	}
	httpx.OK(c, row, "ยืนยันวันนัดแล้ว")
}

func (h *AppointmentHandler) CancelByNurse(c *gin.Context) {
	id, ok := objectIDParam(c, "id")
	if !ok {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&body)
	if err := h.Service.CancelByStaff(c.Request.Context(), id, body.Reason); err != nil {
		appointmentError(c, err)
		return
	}
	httpx.OK(c, nil, "ยกเลิกคำขอแล้ว")
}

func (h *AppointmentHandler) ConfirmCheckIn(c *gin.Context) {
	id, ok := objectIDParam(c, "id")
	if !ok {
		return
	}
	row, err := h.Service.ConfirmCheckIn(c.Request.Context(), id)
	if err != nil {
		appointmentError(c, err)
		return
	}
	realtime.BroadcastQueueUpdate("NPR")
	httpx.OK(c, row, "ยืนยันเช็กอินและออกคิวแล้ว")
}

func (h *AppointmentHandler) SetRoute(c *gin.Context) {
	id, ok := objectIDParam(c, "id")
	if !ok {
		return
	}
	var body struct {
		StationCodes []string `json:"station_codes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "ข้อมูลไม่ถูกต้อง")
		return
	}
	enc, err := h.Service.SetDoctorRoute(c.Request.Context(), id, body.StationCodes)
	if err != nil {
		appointmentError(c, err)
		return
	}
	httpx.OK(c, enc, "บันทึกเส้นทางแล้ว")
}

func RegisterAppointmentRoutes(r *gin.RouterGroup, h *AppointmentHandler, cfg *config.Config) {
	mobile := r.Group("/mobile/appointment-requests")
	mobile.Use(middleware.AuthMiddleware(cfg.JWTSecret), middleware.RoleMiddleware("patient"))
	mobile.POST("", h.Create)
	mobile.GET("/current", h.Current)
	mobile.PATCH("/:id", h.Update)
	mobile.POST("/:id/cancel", h.Cancel)
	mobile.POST("/:id/report-arrival", h.ReportArrival)

	nurse := r.Group("/nurse")
	nurse.Use(middleware.AuthMiddleware(cfg.JWTSecret), middleware.RoleMiddleware("nurse"))
	nurse.GET("/appointment-requests", h.List)
	nurse.GET("/appointment-requests/:id", h.Detail)
	nurse.POST("/appointment-requests/:id/propose", h.Propose)
	nurse.POST("/appointment-requests/:id/cancel", h.CancelByNurse)
	nurse.GET("/arrivals/today", func(c *gin.Context) {
		c.Request.URL.RawQuery = "status=arrival_reported"
		h.List(c)
	})
	nurse.POST("/appointment-requests/:id/confirm-checkin", h.ConfirmCheckIn)

	doctor := r.Group("/doctor")
	doctor.Use(middleware.AuthMiddleware(cfg.JWTSecret), middleware.RoleMiddleware("doctor"))
	doctor.GET("/appointment-requests", h.List)
	doctor.POST("/appointment-requests/:id/confirm", h.Confirm)
	doctor.POST("/encounters/:id/route", h.SetRoute)
}
