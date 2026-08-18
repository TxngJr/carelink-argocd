package config

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

const devJWTSecret = "carelink_dev_secret"

type Config struct {
	MongoURI           string
	DBName             string
	JWTSecret          string
	AppEnv             string
	Port               string
	TVAccessKey        string
	CORSAllowedOrigins []string
}

func Load() *Config {
	godotenv.Load()

	cfg := &Config{
		MongoURI:    getEnv("MONGO_URI", "mongodb://localhost:27017"),
		DBName:      getEnv("DB_NAME", "carelink"),
		JWTSecret:   getEnv("JWT_SECRET", devJWTSecret),
		AppEnv:      getEnv("APP_ENV", "development"),
		Port:        getEnv("PORT", "8080"),
		TVAccessKey: getEnv("TV_ACCESS_KEY", ""),
	}

	if origins := getEnv("CORS_ALLOWED_ORIGINS", ""); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			if o = strings.TrimSpace(o); o != "" {
				cfg.CORSAllowedOrigins = append(cfg.CORSAllowedOrigins, o)
			}
		}
	}

	// A production deploy running with the checked-in dev secret would let
	// anyone forge a valid staff JWT — fail loudly at startup rather than
	// silently accepting requests signed with a secret that's public on GitHub.
	if cfg.AppEnv == "production" {
		if cfg.JWTSecret == "" || cfg.JWTSecret == devJWTSecret {
			log.Fatal("JWT_SECRET must be set to a non-default value when APP_ENV=production")
		}
		if len(cfg.CORSAllowedOrigins) == 0 {
			log.Fatal("CORS_ALLOWED_ORIGINS must be set when APP_ENV=production")
		}
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
