import { env } from "../config/keys.js";
import logger from "../config/logger.js";

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

interface BrevoResponse {
  messageId?: string;
}

export const sendEmail = async (
  options: SendEmailOptions,
): Promise<boolean> => {
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: "Agrokeep Support",
          email: env.EMAIL_OWNER,
        },
        to: [
          {
            email: options.to,
            name: options.toName || options.to,
          },
        ],
        subject: options.subject,
        htmlContent: options.htmlContent,
        textContent: options.textContent,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error({ error }, "Brevo email send failed");
      return false;
    }

    const data = (await response.json()) as BrevoResponse;
    logger.info(
      { messageId: data.messageId, to: options.to },
      "Email sent successfully",
    );
    return true;
  } catch (error) {
    logger.error({ error }, "Email service error");
    return false;
  }
};

export const sendOtpEmail = async (
  to: string,
  toName: string,
  otp: string,
  verificationLink: string,
): Promise<boolean> => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Password Reset OTP</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.03);border:1px solid #e2e8f0;">
                <tr>
                  <td style="background-color:#15803D;padding:36px 40px;text-align:center;">
                    <h1 style="color:#ffffff;margin:0;font-size:28px;letter-spacing:1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Agro<span style="color:#F59E0B;">Keep</span></h1>
                    <p style="color:#dcfce7;margin:6px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Optimal Harvest Management</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px;background-color:#ffffff;">
                    <h2 style="color:#1e293b;margin:0 0 16px;font-size:20px;font-weight:700;">Password Reset Request</h2>
                    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
                      Hi ${toName}, we received a request to reset your password for your Agrokeep account. Use the verification OTP code displayed below. This safety token expires automatically in <strong>10 minutes</strong>.
                    </p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:16px 0 28px;">
                          <div style="display:inline-block;background-color:#f0fdf4;border:2px dashed #15803D;border-radius:12px;padding:18px 44px;">
                            <span style="font-size:40px;font-weight:bold;color:#15803D;letter-spacing:10px;font-family:Courier,monospace;">${otp}</span>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <p style="color:#475569;font-size:14px;margin-bottom:18px;">Or click the button below to complete validation on our platform:</p>
                          <table border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td align="center" style="border-radius:8px;" bgcolor="#15803D">
                                <a href="${verificationLink}" 
                                   target="_blank" 
                                   style="font-size:15px; font-family:Arial,sans-serif; color:#ffffff; text-decoration:none; border-radius:8px; padding:14px 32px; border:1px solid #15803D; display:inline-block; font-weight:bold;box-shadow:0 2px 4px rgba(21,128,61,0.15);">
                                  Verify OTP Code
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="color:#94a3b8;font-size:13px;margin:32px 0 0;line-height:1.5;text-align:center;">
                      If you did not issue this verification inquiry, your account information remains completely secure and you can safely disregard this message.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #f1f5f9;">
                    <p style="color:#94a3b8;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} AgroKeep Ecosystems. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    toName,
    subject: "Agrokeep Password Reset Security Code",
    htmlContent,
    textContent: `Your Agrokeep verification code is: ${otp}. Use this link to verify: ${verificationLink}`,
  });
};

export const sendWelcomeEmail = async (
  to: string,
  toName: string,
  otp: string,
  verificationLink: string,
): Promise<boolean> => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Welcome to AgroKeep</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.03);border:1px solid #e2e8f0;">
                <tr>
                  <td style="background-color:#15803D;padding:36px 40px;text-align:center;">
                    <h1 style="color:#ffffff;margin:0;font-size:28px;letter-spacing:1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Agro<span style="color:#F59E0B;">Keep</span></h1>
                    <p style="color:#dcfce7;margin:6px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Optimal Harvest Management</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px;background-color:#ffffff;">
                    <h2 style="color:#1e293b;margin:0 0 16px;font-size:20px;font-weight:700;">Welcome to AgroKeep, ${toName}! 🎉</h2>
                    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
                      We're excited to partner with you in managing and optimizing your agricultural preservation assets. To activate your operational account profile, please verify your credentials using the activation code below within <strong>10 minutes</strong>.
                    </p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:16px 0 28px;">
                          <div style="display:inline-block;background-color:#f0fdf4;border:2px dashed #15803D;border-radius:12px;padding:18px 44px;">
                            <span style="font-size:40px;font-weight:bold;color:#15803D;letter-spacing:10px;font-family:Courier,monospace;">${otp}</span>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center">
                          <p style="color:#475569;font-size:14px;margin-bottom:18px;">Click here to automatically authorize your system initialization:</p>
                          <table border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td align="center" style="border-radius:8px;" bgcolor="#15803D">
                                <a href="${verificationLink}" 
                                   target="_blank" 
                                   style="font-size:15px; font-family:Arial,sans-serif; color:#ffffff; text-decoration:none; border-radius:8px; padding:14px 32px; border:1px solid #15803D; display:inline-block; font-weight:bold;box-shadow:0 2px 4px rgba(21,128,61,0.15);">
                                  Confirm & Activate Account
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="color:#94a3b8;font-size:13px;margin:32px 0 0;line-height:1.5;text-align:center;">
                      If you did not execute an account registration on our service portal, please disregard this automated payload.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #f1f5f9;">
                    <p style="color:#94a3b8;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} AgroKeep Ecosystems. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    toName,
    subject: "Activate Your AgroKeep Account",
    htmlContent,
    textContent: `Welcome to AgroKeep! Your verification code is: ${otp}. Initialize profile here: ${verificationLink}`,
  });
};

export const sendContactInquiry = async (
  fullName: string,
  clientEmail: string,
  phone: string,
  message: string,
): Promise<boolean> => {
  const htmlContent = `
    <div style="font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
      <!-- Header Banner matching AgroKeep Theme -->
      <div style="background-color: #1E5631; padding: 24px; text-align: center;">
        <h2 style="color: #FFFFFF; margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 0.5px;">AgroKeep Support Hub</h2>
        <p style="color: #D1FAE5; margin: 4px 0 0 0; font-size: 14px;">New Customer Contact Inquiry</p>
      </div>

      <!-- Content Body -->
      <div style="padding: 24px; background-color: #FFFFFF;">
        <h3 style="color: #1E5631; margin-top: 0; font-size: 18px; border-bottom: 2px solid #F3F4F6; padding-bottom: 8px;">Inquiry Overview</h3>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #4B5563; width: 30%;">Sender Name:</td>
            <td style="padding: 6px 0; color: #1F2937;">${fullName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #4B5563;">Email Address:</td>
            <td style="padding: 6px 0; color: #1F2937;"><a href="mailto:${clientEmail}" style="color: #1E5631; text-decoration: underline;">${clientEmail}</a></td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #4B5563;">Phone:</td>
            <td style="padding: 6px 0; color: #1F2937;">${phone || "Not Provided"}</td>
          </tr>
        </table>

        <h3 style="color: #1E5631; font-size: 16px; margin-bottom: 8px;">Customer Message:</h3>
        <div style="background-color: #F9FAFB; border-left: 4px solid #1E5631; padding: 16px; border-radius: 4px; color: #374151; font-size: 15px; white-space: pre-wrap;">${message}</div>
      </div>

      <!-- Footer -->
      <div style="background-color: #F3F4F6; padding: 16px; text-align: center; font-size: 12px; color: #6B7280; border-top: 1px solid #E5E7EB;">
        This operational email was generated automatically from the AgroKeep platform contact form.
      </div>
    </div>
  `;

  return sendEmail({
    to: env.EMAIL_OWNER,
    toName: "AgroKeep Admin",
    // 💡 Using a fallback, clean subject line since the form doesn't provide one
    subject: `[Contact Form] New Support Inquiry from ${fullName}`,
    htmlContent,
    textContent: `New message from ${fullName} (${clientEmail}): ${message}`,
  });
};