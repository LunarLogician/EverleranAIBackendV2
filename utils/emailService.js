const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const getSender = () => ({
  name: process.env.EMAIL_FROM_NAME || 'StudentApp',
  email: process.env.EMAIL_FROM || 'noreply@studentapp.com',
});

/**
 * Send an email via Brevo Transactional API.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} html - HTML body content
 * @returns {Promise<string>} Brevo messageId
 */
const sendEmail = async (to, subject, html) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  BREVO_API_KEY not set — skipping email send');
    return null;
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: getSender(),
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Brevo API error (${response.status}): ${err.message || 'Unknown error'}`);
  }

  const data = await response.json();
  console.log('✅ Email sent', { to, subject, messageId: data.messageId });
  return data.messageId;
};

// ─── Email Templates ─────────────────────────────────────────────────────────

const emailVerificationTemplate = (name, otp) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; }
      .header { background: linear-gradient(135deg, #064e3b 0%, #10b981 100%); color: white; padding: 28px 24px; text-align: center; }
      .header h1 { margin: 0 0 4px; font-size: 22px; }
      .header p  { margin: 0; opacity: 0.85; font-size: 14px; }
      .body { padding: 28px 32px; }
      .otp-box { background: #f0fdf4; border: 2px dashed #6ee7b7; border-radius: 10px; padding: 24px; text-align: center; margin: 20px 0; }
      .otp-code { font-size: 36px; font-weight: bold; color: #064e3b; letter-spacing: 8px; }
      .expires { color: #888; font-size: 12px; margin-top: 8px; }
      .footer { text-align: center; color: #aaa; font-size: 11px; padding: 16px 24px; border-top: 1px solid #f0f0f0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>StudentApp</h1>
        <p>Verify Your Email Address</p>
      </div>
      <div class="body">
        <p>Hi <strong>${name}</strong>,</p>
        <p>Welcome to StudentApp! Enter the code below to verify your email and activate your account.</p>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
          <p class="expires">This code expires in 10 minutes</p>
        </div>
        <p style="color:#555;font-size:13px;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
      <div class="footer">
        <p>© 2026 StudentApp. All rights reserved. · This is an automated message — do not reply.</p>
      </div>
    </div>
  </body>
</html>
`;

const passwordResetTemplate = (name, otp) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; }
      .header { background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%); color: white; padding: 28px 24px; text-align: center; }
      .header h1 { margin: 0 0 4px; font-size: 22px; }
      .header p  { margin: 0; opacity: 0.85; font-size: 14px; }
      .body { padding: 28px 32px; }
      .alert { background: #fef9c3; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin: 16px 0; font-size: 13px; }
      .otp-box { background: #fdf4ff; border: 2px dashed #d8b4fe; border-radius: 10px; padding: 24px; text-align: center; margin: 20px 0; }
      .otp-code { font-size: 36px; font-weight: bold; color: #7c3aed; letter-spacing: 8px; }
      .expires { color: #888; font-size: 12px; margin-top: 8px; }
      .footer { text-align: center; color: #aaa; font-size: 11px; padding: 16px 24px; border-top: 1px solid #f0f0f0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>StudentApp</h1>
        <p>Password Reset Request</p>
      </div>
      <div class="body">
        <p>Hi <strong>${name}</strong>,</p>
        <div class="alert">
          ⚠️ <strong>Security notice:</strong> We received a request to reset your password.
          If this wasn't you, you can safely ignore this email — your password will not change.
        </div>
        <p>Use the code below to reset your password:</p>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
          <p class="expires">Expires in 10 minutes</p>
        </div>
        <p style="color:#555;font-size:13px;">For your security, never share this code with anyone.</p>
      </div>
      <div class="footer">
        <p>© 2026 StudentApp. All rights reserved. · This is an automated message — do not reply.</p>
      </div>
    </div>
  </body>
</html>
`;

module.exports = { sendEmail, emailVerificationTemplate, passwordResetTemplate };
