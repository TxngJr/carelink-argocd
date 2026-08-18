package realtime

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type WSClaims struct {
	UserID primitive.ObjectID `json:"user_id"`
	Role   string             `json:"role"`
	jwt.RegisteredClaims
}

// tokenFromRequest reads the JWT from the Sec-WebSocket-Protocol header
// ("bearer.<jwt>") first — a query-string token can end up in proxy/server
// logs — falling back to ?token= for one release so an un-upgraded client
// isn't locked out mid-deploy.
func tokenFromRequest(r *http.Request) (token, subprotocol string) {
	for _, p := range websocket.Subprotocols(r) {
		if strings.HasPrefix(p, "bearer.") {
			return strings.TrimPrefix(p, "bearer."), p
		}
	}
	return r.URL.Query().Get("token"), ""
}

// HandleWebSocket. allowedOrigins empty means dev mode (any origin, and any
// missing Origin header — native apps don't send one).
func HandleWebSocket(hub *Hub, jwtSecret string, allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" || len(allowed) == 0 {
				return true
			}
			return allowed[origin]
		},
	}

	return func(c *gin.Context) {
		tokenStr, subprotocol := tokenFromRequest(c.Request)
		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "token required"})
			return
		}

		claims := &WSClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		var responseHeader http.Header
		if subprotocol != "" {
			responseHeader = http.Header{"Sec-WebSocket-Protocol": []string{subprotocol}}
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, responseHeader)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		client := &Client{
			ID:     primitive.NewObjectID().Hex(),
			UserID: claims.UserID.Hex(),
			Role:   claims.Role,
			Send:   make(chan []byte, 256),
			Hub:    hub,
		}

		hub.Register <- client

		go client.writePump(conn)
		go client.readPump(conn)
	}
}

func (c *Client) readPump(conn *websocket.Conn) {
	defer func() {
		c.Hub.Unregister <- c
		conn.Close()
	}()

	conn.SetReadLimit(512)
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		if msgType, ok := msg["type"].(string); ok && msgType == "ping" {
			pong := map[string]string{"type": "pong"}
			data, _ := json.Marshal(pong)
			c.Send <- data
		}
	}
}

func (c *Client) writePump(conn *websocket.Conn) {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)
			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
