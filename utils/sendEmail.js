const nodemailer = require('nodemailer');

const getTransporter = () => nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const baseStyle = `font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;`;
const headerStyle = `background:#1e40af;color:#fff;padding:20px 32px;border-radius:10px 10px 0 0;`;
const bodyStyle = `background:#fff;padding:24px 32px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0;border-top:none;`;

const sendOtpEmail = async (to, otp) => {
  await getTransporter().sendMail({
    from: `"Room4Rent" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your Room4Rent OTP Code',
    html: `
      <div style="${baseStyle}">
        <div style="${headerStyle}"><h2 style="margin:0;">Room4Rent Verification</h2></div>
        <div style="${bodyStyle}">
          <p style="color:#475569;margin-bottom:24px;">Use the code below to sign in. It expires in <strong>10 minutes</strong>.</p>
          <div style="background:#1e40af;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;text-align:center;padding:20px;border-radius:10px;">${otp}</div>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
};

const sendBookingStatusEmail = async (to, { bookingType, status, propertyTitle, reason, seekerName }) => {
  const statusColors = { approved: '#16a34a', rejected: '#dc2626', rescheduled: '#d97706', cancelled: '#6b7280' };
  const statusLabels = { approved: 'Approved ✓', rejected: 'Not Approved', rescheduled: 'Rescheduled', cancelled: 'Cancelled' };
  const color = statusColors[status] || '#1e40af';
  const label = statusLabels[status] || status;

  const subjectMap = {
    approved: `Your ${bookingType} request has been approved`,
    rejected: `Update on your ${bookingType} request`,
    rescheduled: `Your visit has been rescheduled`,
    cancelled: `Your ${bookingType} has been cancelled`,
  };

  await getTransporter().sendMail({
    from: `"Room4Rent" <${process.env.EMAIL_USER}>`,
    to,
    subject: subjectMap[status] || `Booking update — ${propertyTitle}`,
    html: `
      <div style="${baseStyle}">
        <div style="background:${color};color:#fff;padding:20px 32px;border-radius:10px 10px 0 0;">
          <h2 style="margin:0;">Booking ${label}</h2>
        </div>
        <div style="${bodyStyle}">
          <p style="color:#334155;">Hi${seekerName ? ` ${seekerName}` : ''},</p>
          <p style="color:#475569;">Your <strong>${bookingType}</strong> request for <strong>${propertyTitle}</strong> has been <strong style="color:${color};">${label.toLowerCase()}</strong>.</p>
          ${reason ? `<div style="background:#fef9c3;border-left:4px solid #eab308;padding:12px 16px;border-radius:6px;margin-top:16px;"><p style="margin:0;color:#713f12;"><strong>Reason:</strong> ${reason}</p></div>` : ''}
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;">Log in to Room4Rent to view your bookings and next steps.</p>
        </div>
      </div>
    `,
  });
};

const sendNewBookingEmail = async (to, { bookingType, propertyTitle, seekerName }) => {
  await getTransporter().sendMail({
    from: `"Room4Rent" <${process.env.EMAIL_USER}>`,
    to,
    subject: `New ${bookingType} request for ${propertyTitle}`,
    html: `
      <div style="${baseStyle}">
        <div style="${headerStyle}"><h2 style="margin:0;">New Booking Request</h2></div>
        <div style="${bodyStyle}">
          <p style="color:#334155;">You have a new <strong>${bookingType}</strong> request for <strong>${propertyTitle}</strong>${seekerName ? ` from <strong>${seekerName}</strong>` : ''}.</p>
          <p style="color:#475569;">Log in to Room4Rent to review and respond to this request.</p>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;">This is an automated notification from Room4Rent.</p>
        </div>
      </div>
    `,
  });
};

module.exports = { sendOtpEmail, sendBookingStatusEmail, sendNewBookingEmail };
