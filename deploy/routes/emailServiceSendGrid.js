import sgMail from '@sendgrid/mail';

const { SENDGRID_API_KEY, SENDGRID_FROM } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

export async function sendEmail({ to, subject, text, html }) {
  const msg = {
    to,
    from: SENDGRID_FROM,
    subject,
    text,
    html
  };
  try {
    const result = await sgMail.send(msg);
    console.log('E-mail enviado (SendGrid):', result);
    return result;
  } catch (error) {
    console.error('Erro ao enviar e-mail (SendGrid):', error);
    throw error;
  }
}
