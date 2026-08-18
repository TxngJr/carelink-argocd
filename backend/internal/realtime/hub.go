package realtime

import (
	"encoding/json"
	"log"
	"sync"
	"time"
)

type Event struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type Client struct {
	ID     string
	UserID string
	Role   string
	Send   chan []byte
	Hub    *Hub
}

type Hub struct {
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	mu         sync.RWMutex
}

var HubInstance *Hub

func NewHub() *Hub {
	return &Hub{
		Clients:    make(map[*Client]bool),
		Broadcast:  make(chan []byte, 256),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			h.mu.Unlock()
			log.Printf("WebSocket client connected: %s (role: %s)", client.ID, client.Role)

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("WebSocket client disconnected: %s", client.ID)

		case message := <-h.Broadcast:
			h.mu.RLock()
			for client := range h.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.Clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) BroadcastEvent(event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Failed to marshal event: %v", err)
		return
	}
	h.Broadcast <- data
}

func (h *Hub) BroadcastToRole(role string, event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Failed to marshal event: %v", err)
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.Clients {
		if client.Role == role || client.Role == "admin" || client.Role == "manager" {
			select {
			case client.Send <- data:
			default:
			}
		}
	}
}

func (h *Hub) SendToUser(userID string, event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.Clients {
		if client.UserID == userID {
			select {
			case client.Send <- data:
			default:
			}
		}
	}
}

func (h *Hub) GetOnlineCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.Clients)
}

func BroadcastQueueUpdate(stationCode string) {
	HubInstance.BroadcastEvent(Event{
		Type: "QUEUE_UPDATED",
		Payload: map[string]interface{}{
			"station_code": stationCode,
		},
	})
}

func BroadcastPatientMoved(encounterID, fromStation, toStation string) {
	HubInstance.BroadcastEvent(Event{
		Type: "PATIENT_MOVED",
		Payload: map[string]interface{}{
			"encounter_id": encounterID,
			"from_station": fromStation,
			"to_station":   toStation,
		},
	})
}

func BroadcastStationStatusUpdated(stationCode string) {
	HubInstance.BroadcastEvent(Event{
		Type: "STATION_STATUS_UPDATED",
		Payload: map[string]interface{}{
			"station_code": stationCode,
		},
	})
}

func BroadcastDashboardKPI() {
	HubInstance.BroadcastEvent(Event{
		Type:    "DASHBOARD_KPI_UPDATED",
		Payload: map[string]interface{}{},
	})
}

// BroadcastQueueCalled fires when staff call the next patient. Deliberately
// carries no patient name so it is safe to relay to the unauthenticated TV display.
func BroadcastQueueCalled(stationCode, queueNo, patientID string, callCount int) {
	HubInstance.BroadcastEvent(Event{
		Type: "QUEUE_CALLED",
		Payload: map[string]interface{}{
			"station_code": stationCode,
			"queue_no":     queueNo,
			"patient_id":   patientID,
			"call_count":   callCount,
			"called_at":    time.Now(),
		},
	})
}

func BroadcastNotification(patientID, title, message, notifType string) {
	HubInstance.BroadcastEvent(Event{
		Type: "PATIENT_NOTIFICATION_CREATED",
		Payload: map[string]interface{}{
			"patient_id": patientID,
			"title":      title,
			"message":    message,
			"type":       notifType,
		},
	})
}
