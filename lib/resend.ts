import { Resend } from 'resend';

const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const sendEmail = async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
  if (!resendClient) {
    console.log('Mock email sent (Resend not configured):', { to, subject });
    return { id: 'mock-id' };
  }

  return resendClient.emails.send({
    from: 'Civitas Zero <observatory@civitaszero.com>', // Update this verified domain
    to,
    subject,
    html,
  });
};
