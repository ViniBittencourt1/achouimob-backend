import nodemailer from 'nodemailer';

export async function sendEmail(to, subject, html) {



const Mailgun = require('mailgun.js');
const formData = require('form-data');

const {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM
} = process.env;

const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: MAILGUN_API_KEY
});

async function sendEmail({ to, subject, text, html }) {
  try {
    const data = {
      from: MAILGUN_FROM,
      to,
      subject,
      text,
      html
    };
    const result = await mg.messages.create(MAILGUN_DOMAIN, data);
    console.log('E-mail enviado:', result);
    return result;
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    throw error;
  }
}

module.exports = { sendEmail };
}
