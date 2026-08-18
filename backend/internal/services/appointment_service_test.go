package services

import (
	"testing"
	"time"

	"github.com/carelink/backend/internal/models"
)

func floatPtr(value float64) *float64 { return &value }
func intPtr(value int) *int           { return &value }

func TestValidateMeasurements(t *testing.T) {
	tests := []struct {
		name    string
		value   models.PatientMeasurements
		wantErr bool
	}{
		{name: "all optional"},
		{name: "complete valid values", value: models.PatientMeasurements{
			HeightCM: floatPtr(170), WeightKG: floatPtr(65.5),
			SBP: intPtr(120), DBP: intPtr(80), SPO2: intPtr(98),
		}},
		{name: "missing dbp", value: models.PatientMeasurements{SBP: intPtr(120)}, wantErr: true},
		{name: "spo2 over 100", value: models.PatientMeasurements{SPO2: intPtr(101)}, wantErr: true},
		{name: "weight too low", value: models.PatientMeasurements{WeightKG: floatPtr(1)}, wantErr: true},
		{name: "height too high", value: models.PatientMeasurements{HeightCM: floatPtr(251)}, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := validateMeasurements(test.value); (got != nil) != test.wantErr {
				t.Fatalf("validateMeasurements() error = %v, wantErr %v", got, test.wantErr)
			}
		})
	}
}

func TestValidateDoctorRoute(t *testing.T) {
	valid := [][]string{{"DH"}, {"LAB", "RC", "PD", "DH"}, {"HA", "IPW"}, {"LAB", "HA", "IPW"}}
	for _, route := range valid {
		if err := validateDoctorRoute(route); err != nil {
			t.Errorf("valid route %v rejected: %v", route, err)
		}
	}
	invalid := [][]string{{}, {"LAB"}, {"HA"}, {"IPW"}, {"DH", "LAB"}, {"NPR", "DH"}, {"LAB", "LAB", "DH"}}
	for _, route := range invalid {
		if err := validateDoctorRoute(route); err == nil {
			t.Errorf("invalid route %v was accepted", route)
		}
	}
}

func TestSameBangkokDay(t *testing.T) {
	first := time.Date(2026, 7, 26, 16, 30, 0, 0, time.UTC) // 23:30 Bangkok
	same := time.Date(2026, 7, 26, 17, 20, 0, 0, time.UTC)  // 00:20 Bangkok, next date
	if sameBangkokDay(first, same) {
		t.Fatal("times on different Bangkok calendar dates must not match")
	}
}
