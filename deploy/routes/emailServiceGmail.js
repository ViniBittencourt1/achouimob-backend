import nodemailer from 'nodemailer';

const {
  GMAIL_USER,
  GMAIL_PASS
} = process.env;

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS
  }
});

export async function sendEmail({ to, subject, text, html }) {
  try {
    const info = await transporter.sendMail({
      from: GMAIL_USER,
      to,
      subject,
      text,
      html
    });
    console.log('E-mail enviado:', info);
    return info;
  } catch (error) {
    console.error('Erro ao enviar e-mail (Gmail):', error);
    throw error;
  }
}
