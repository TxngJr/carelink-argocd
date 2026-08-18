package httpx

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

// OK writes a successful envelope. Matches the {success,data,message} shape
// every handler already uses.
func OK(c *gin.Context, data interface{}, message string) {
	if message == "" {
		message = "OK"
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data, "message": message})
}

// Fail writes a client-facing error with a specific code and a message safe
// to show a user (validation errors, not-found, etc).
func Fail(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{"success": false, "error": gin.H{"code": code, "message": message}})
}

// FailErr logs the real error server-side (with the request id already
// attached by gin's context) and returns a generic Thai message to the
// client — internal error detail (Mongo errors, stack traces, etc.) must
// never reach the browser.
func FailErr(c *gin.Context, err error) {
	slog.Error("request failed", "path", c.Request.URL.Path, "method", c.Request.Method, "error", err)
	c.JSON(http.StatusInternalServerError, gin.H{
		"success": false,
		"error":   gin.H{"code": "INTERNAL_ERROR", "message": "เกิดข้อผิดพลาด กรุณาลองใหม่"},
	})
}
