package services

import (
	"strings"
)

type AIService struct{}

func NewAIService() *AIService {
	return &AIService{}
}

func (s *AIService) ScreenSymptoms(symptoms []string, chiefComplaint string) (string, string) {
	allText := strings.ToLower(chiefComplaint)
	for _, sym := range symptoms {
		allText += " " + strings.ToLower(sym)
	}

	highRiskKeywords := []string{"ไข้สูง", "หายใจลำบาก", "เจ็บหน้าอก", "เลือดออก", "ช็อก", "หมดสติ"}
	for _, kw := range highRiskKeywords {
		if strings.Contains(allText, kw) {
			return "high", "อาการเสี่ยงสูง แนะนำให้ติดต่อโรงพยาบาลทันที"
		}
	}

	mediumRiskKeywords := []string{"อ่อนเพลีย", "เบื่ออาหาร", "คลื่นไส้", "อาเจียน", "น้ำหนักลด", "ปวดศีรษะ"}
	for _, kw := range mediumRiskKeywords {
		if strings.Contains(allText, kw) {
			return "medium", "มีอาการที่ควรได้รับการประเมิน ควรส่งต่อพยาบาลและแพทย์พิจารณา"
		}
	}

	return "low", "อาการทั่วไป แนะนำเฝ้าระวัง ระบบเป็นเพียงผู้ช่วยคัดกรองเบื้องต้น แพทย์เป็นผู้ตัดสินใจขั้นสุดท้าย"
}

func (s *AIService) GenerateDoctorSuggestion(patientData map[string]interface{}) string {
	var sb strings.Builder
	sb.WriteString("สรุปข้อมูลก่อนพบแพทย์:\n")

	if complaint, ok := patientData["chief_complaint"].(string); ok {
		sb.WriteString("- " + complaint + "\n")
	}
	if allergies, ok := patientData["allergies"].([]string); ok && len(allergies) > 0 {
		sb.WriteString("- มีประวัติแพ้: " + strings.Join(allergies, ", ") + "\n")
	}
	if symptoms, ok := patientData["symptoms"].([]string); ok && len(symptoms) > 0 {
		sb.WriteString("- อาการ: " + strings.Join(symptoms, ", ") + "\n")
	}

	sb.WriteString("\nควรพิจารณาตรวจสอบผลการตรวจก่อนวางแผนการรักษา")
	return sb.String()
}

func (s *AIService) AIChat(userMessage string) (string, string) {
	msg := strings.ToLower(userMessage)

	emergencyKeywords := []string{"ไข้สูง", "หายใจลำบาก", "หายใจไม่ออก", "เจ็บหน้าอก", "เลือดออก", "หมดสติ", "ช็อก"}
	for _, kw := range emergencyKeywords {
		if strings.Contains(msg, kw) {
			return "high", "อาการของท่านต้องได้รับการดูแลอย่างเร่งด่วน กรุณาติดต่อโรงพยาบาลที่ใกล้ที่สุดหรือโทร 1669 ทันที"
		}
	}

	painKeywords := []string{"ปวด", "เจ็บ"}
	for _, kw := range painKeywords {
		if strings.Contains(msg, kw) {
			return "medium", "ท่านมีอาการปวด กรุณาระบุตำแหน่งและความรุนแรง ควรแจ้งพยาบาลเมื่อมาถึงโรงพยาบาล"
		}
	}

	nauseaKeywords := []string{"คลื่นไส้", "อาเจียน", "เบื่ออาหาร", "อ่อนเพลีย"}
	for _, kw := range nauseaKeywords {
		if strings.Contains(msg, kw) {
			return "medium", "ท่านมีอาการคลื่นไส้ กรุณาจดบันทึกความถี่และนำยาที่ใช้ปัจจุบันมาด้วย"
		}
	}

	return "low", "ขอบคุณที่ให้ข้อมูล กรุณาระบุอาการเพิ่มเติมเพื่อการคัดกรองที่แม่นยำ ระบบเป็นเพียงผู้ช่วยคัดกรองเบื้องต้น แพทย์เป็นผู้ตัดสินใจขั้นสุดท้าย"
}
