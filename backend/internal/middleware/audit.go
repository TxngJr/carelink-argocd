package middleware

import (
	"context"
	"strings"
	"time"

	"github.com/carelink/backend/internal/models"
	"github.com/carelink/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var auditedMethods = map[string]bool{
	"POST": true, "PUT": true, "PATCH": true, "DELETE": true,
}

// AuditMiddleware records every mutating request as one line in audit_logs
// — who (actor/role), what (method+path), from where (IP), when, and the
// resulting status. It's a middleware rather than per-handler calls so new
// endpoints are covered automatically instead of relying on every handler
// remembering to log itself.
func AuditMiddleware(audit *services.AuditService) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		if !auditedMethods[c.Request.Method] {
			return
		}
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api/auth/") || strings.Contains(path, "/public/") {
			return
		}

		var actorID primitive.ObjectID
		if v, ok := c.Get("user_id"); ok {
			if id, ok := v.(primitive.ObjectID); ok {
				actorID = id
			}
		}
		role, _ := c.Get("role")
		roleStr, _ := role.(string)

		entry := &models.AuditLog{
			ActorUserID: actorID,
			Role:        roleStr,
			Action:      c.Request.Method + " " + path,
			EntityType:  firstPathSegment(path),
			IPAddress:   c.ClientIP(),
			After:       map[string]interface{}{"status": c.Writer.Status()},
		}

		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			audit.Log(ctx, entry)
		}()
	}
}

func firstPathSegment(path string) string {
	parts := strings.Split(strings.TrimPrefix(path, "/api/"), "/")
	if len(parts) > 0 {
		return parts[0]
	}
	return ""
}
