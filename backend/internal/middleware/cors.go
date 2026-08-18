package middleware

import (
	"github.com/gin-gonic/gin"
)

// CORSMiddleware allows any origin in dev (matches how this project has
// always been run locally). In production, pass allowedOrigins from
// CORS_ALLOWED_ORIGINS — config.Load already refuses to start in production
// without it, so an empty slice here only happens in dev.
func CORSMiddleware(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}
	wildcard := len(allowedOrigins) == 0

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		if wildcard {
			c.Header("Access-Control-Allow-Origin", "*")
		} else if allowed[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		}

		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, Accept")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
