import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Create reusable transporter using cPanel SMTP
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
    },
    tls: {
        rejectUnauthorized: false // Allow self-signed certs on shared hosting
    }
});

const FROM_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@yourdomain.com';
const APP_NAME = process.env.APP_NAME || 'ChatFlow';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
    try {
        await transporter.sendMail({
            from: `"${APP_NAME}" <${FROM_EMAIL}>`,
            to,
            subject,
            html,
        });
        return true;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
};

// Email templates
export const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<boolean> => {
    const resetUrl = `${FRONTEND_URL}?reset=${resetToken}`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Reset Your Password</h2>
      <p>You requested a password reset for your ${APP_NAME} account.</p>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" 
           style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Reset Password
        </a>
      </div>
      <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">This email was sent by ${APP_NAME}.</p>
    </div>
  `;
    return sendEmail(email, `${APP_NAME} - Password Reset`, html);
};

export const sendEmailVerification = async (email: string, verificationToken: string): Promise<boolean> => {
    const verifyUrl = `${FRONTEND_URL}?verify=${verificationToken}`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Verify Your Email</h2>
      <p>Welcome to ${APP_NAME}! Please verify your email address to get started.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" 
           style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Verify Email
        </a>
      </div>
      <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">This email was sent by ${APP_NAME}.</p>
    </div>
  `;
    return sendEmail(email, `${APP_NAME} - Verify Your Email`, html);
};

export default { sendEmail, sendPasswordResetEmail, sendEmailVerification };
