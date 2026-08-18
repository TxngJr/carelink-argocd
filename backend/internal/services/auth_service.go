package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/carelink/backend/internal/config"
	"github.com/carelink/backend/internal/db"
	"github.com/carelink/backend/internal/models"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	Cfg *config.Config
}

func NewAuthService(cfg *config.Config) *AuthService {
	return &AuthService{Cfg: cfg}
}

func (s *AuthService) Login(ctx context.Context, username, password string) (*models.User, string, error) {
	var user models.User
	err := db.GetCollection("users").FindOne(ctx, bson.M{"username": username, "is_active": true}).Decode(&user)
	if err != nil {
		return nil, "", errors.New("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", errors.New("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
	}

	claims := &jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &struct {
		UserID      primitive.ObjectID `json:"user_id"`
		Username    string             `json:"username"`
		Role        string             `json:"role"`
		DisplayName string             `json:"display_name"`
		*jwt.RegisteredClaims
	}{
		UserID:           user.ID,
		Username:         user.Username,
		Role:             user.Role,
		DisplayName:      user.DisplayName,
		RegisteredClaims: claims,
	})

	tokenStr, err := token.SignedString([]byte(s.Cfg.JWTSecret))
	if err != nil {
		return nil, "", err
	}

	return &user, tokenStr, nil
}

func (s *AuthService) GetUserByID(ctx context.Context, id primitive.ObjectID) (*models.User, error) {
	var user models.User
	err := db.GetCollection("users").FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func normalizePhone(phone string) string {
	return strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
}

// RegisterPatient creates the patient and its login account. The phone number is
// the username so the mobile flow stays simple and deterministic.
func (s *AuthService) RegisterPatient(ctx context.Context, displayName, phone, password string, birthDate time.Time) (*models.User, string, error) {
	displayName = strings.TrimSpace(displayName)
	phone = normalizePhone(phone)
	if displayName == "" || len(phone) < 9 || len(password) < 6 {
		return nil, "", errors.New("กรุณากรอกชื่อ เบอร์โทร และรหัสผ่านอย่างน้อย 6 ตัวอักษร")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}

	now := time.Now()
	patientID := primitive.NewObjectID()
	seq, _ := db.GetCollection("patients").CountDocuments(ctx, bson.M{})
	patient := models.Patient{
		ID:          patientID,
		HN:          fmt.Sprintf("CL-%06d", seq+1),
		DisplayName: displayName,
		Phone:       phone,
		BirthDate:   birthDate,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := db.GetCollection("patients").InsertOne(ctx, patient); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, "", errors.New("เบอร์โทรนี้ถูกใช้งานแล้ว")
		}
		return nil, "", err
	}

	user := &models.User{
		ID:           primitive.NewObjectID(),
		Username:     phone,
		PasswordHash: string(hash),
		Role:         "patient",
		DisplayName:  displayName,
		PatientID:    &patientID,
		IsActive:     true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if _, err := db.GetCollection("users").InsertOne(ctx, user); err != nil {
		_, _ = db.GetCollection("patients").DeleteOne(ctx, bson.M{"_id": patientID})
		if mongo.IsDuplicateKeyError(err) {
			return nil, "", errors.New("เบอร์โทรนี้ถูกใช้งานแล้ว")
		}
		return nil, "", err
	}

	_, token, err := s.Login(ctx, phone, password)
	return user, token, err
}
