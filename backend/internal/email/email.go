package email

import (
	"fmt"
	"net/smtp"
	"strings"

	"github.com/arcanea/backend/internal/config"
)

type Service struct {
	cfg config.EmailConfig
}

func NewService(cfg config.EmailConfig) *Service {
	return &Service{cfg: cfg}
}

func (s *Service) SendVerificationEmail(toEmail, token string) error {
	if s.cfg.SMTPUser == "" || s.cfg.SMTPPass == "" {
		// SMTP not configured — log and skip silently (dev mode)
		fmt.Printf("[EMAIL-DEV] Verification link for %s: %s/verify?token=%s\n", toEmail, s.cfg.FrontendURL, token)
		return nil
	}

	verifyURL := fmt.Sprintf("%s/verify?token=%s", s.cfg.FrontendURL, token)

	subject := "Verifica tu cuenta - Arcanea"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#4F46E5">¡Bienvenido a Arcanea!</h2>
  <p>Gracias por registrarte. Para activar tu cuenta, haz clic en el siguiente enlace:</p>
  <p style="text-align:center;margin:30px 0">
    <a href="%s" style="background:#4F46E5;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold">
      Verificar mi cuenta
    </a>
  </p>
  <p style="color:#666;font-size:14px">Si no creaste esta cuenta, puedes ignorar este correo.</p>
  <p style="color:#666;font-size:12px">Este enlace expira en 24 horas.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
  <p style="color:#999;font-size:12px">Arcanea - Plataforma Educativa</p>
</body>
</html>`, verifyURL)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		s.cfg.FromEmail, toEmail, subject, body)

	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)

	return smtp.SendMail(addr, auth, s.cfg.FromEmail, []string{toEmail}, []byte(msg))
}

func (s *Service) SendNotificationEmail(toEmail, subject, message string) error {
	if strings.TrimSpace(toEmail) == "" {
		return fmt.Errorf("email destino requerido")
	}

	if s.cfg.SMTPUser == "" || s.cfg.SMTPPass == "" {
		fmt.Printf("[EMAIL-DEV] Notification for %s | %s: %s\n", toEmail, subject, message)
		return nil
	}

	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h3 style="color:#111827">%s</h3>
  <p style="color:#374151">%s</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
  <p style="color:#999;font-size:12px">Arcanea - Plataforma Educativa</p>
</body>
</html>`, subject, message)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		s.cfg.FromEmail, toEmail, subject, body)

	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)

	return smtp.SendMail(addr, auth, s.cfg.FromEmail, []string{toEmail}, []byte(msg))
}
