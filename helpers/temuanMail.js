import nodemailer from 'nodemailer';
import { dbDMS, dbHris } from '../config/db.js';
import { getFileDownloadURL } from './ftpUpload.js';
import { logger } from './logger.js';
import dayjs from 'dayjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Send temuan notification email
 */
export const sendTemuanMail = async (data) => {
  try {
    const {
      temuan_id,
      judul,
      periode_awal,
      periode_akhir,
      bu_id,
      div_id,
      requestee_ids,
      requestee_emails,
      points,
      approval_chain
    } = data;
    
    // Get BU and Division names
    const bu = await dbHris('master_bu_new')
      .select('bu_name')
      .where('bu_id', bu_id)
      .first();
    
    const div = await dbHris('master_div_new')
      .select('nama_div')
      .where('id_div', div_id)
      .first();
    
    // Get requestee names
    const requesteeNames = [];
    for (const emp_id of requestee_ids) {
      const emp = await dbHris('ptl_hris')
        .select('user_name')
        .where('Emp_Id', emp_id)
        .first();
      if (emp) {
        requesteeNames.push(emp.user_name);
      }
    }
    
    // Generate email HTML
    const emailHtml = generateEmailTemplate({
      requesteeNames: requesteeNames.join(', '),
      bu_name: bu ? bu.bu_name : '',
      div_name: div ? div.nama_div : '',
      judul,
      periode_awal: dayjs(periode_awal).format('DD MMM YYYY'),
      periode_akhir: dayjs(periode_akhir).format('DD MMM YYYY'),
      points
    });
    
    // Setup email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT),
      secure: false, // Use false for port 587 (STARTTLS)
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
      }
    });

    // Prepare TO recipients
    let toEmails = requestee_emails.split(',').map(email => ({
      address: email.trim()
    }));
    
    // Prepare CC recipients
    let ccEmails = [];
    
    // Add approval chain to CC
    if (approval_chain.divhead_email && approval_chain.divhead_email !== 'null') {
      ccEmails.push({ address: approval_chain.divhead_email });
    }
    
    if (approval_chain.chief_email && 
        approval_chain.chief_email !== 'null' && 
        approval_chain.chief_email !== approval_chain.divhead_email) {
      ccEmails.push({ address: approval_chain.chief_email });
    }
    
    // Get auditor team emails
    const auditorTeam = await dbDMS('master_user')
      .select('emp_id')
      .whereIn('account_type', [8]); // Auditor types
    
    for (const auditor of auditorTeam) {
      const auditorEmail = await dbHris('ptl_hris')
        .select('user_email')
        .where('Emp_Id', auditor.emp_id)
        .where('user_active', 'Active')
        .first();
      
      if (auditorEmail && auditorEmail.user_email) {
        ccEmails.push({ address: auditorEmail.user_email });
      }
    }
    
    // BCC
    let bccEmails = [];

    // Override emails for non-production environments
    if (process.env.ENVIRONMENT !== 'PRODUCTION') {
      toEmails = [
        { address: process.env.EMAILDUMMY }
      ];
      ccEmails = [];
    } else {
      bccEmails.push({ address: process.env.EMAILDUMMY });
    }
    
    // Read logo image
    const logoPath = path.join(__dirname, '../assets/images/dbc_logo.png');
    
    // Send email
    const mailOptions = {
      from: {
        name: 'LEGAL MONITORING SYSTEM',
        address: process.env.MAIL_FROM || 'legal@dbc.co.id'
      },
      to: toEmails,
      cc: ccEmails,
      bcc: bccEmails,
      subject: 'SUMMARY HASIL REQUEST',
      html: emailHtml,
      attachments: [
        {
          filename: 'dbc_logo.png',
          path: logoPath,
          cid: 'dbc' // Same as in HTML <img src="cid:dbc">
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    
    logger({ success: true, messageId: info.messageId }, 'Email sent successfully', { temuan_id });
    
    return true;
    
  } catch (error) {
    logger(error, 'Send Temuan Mail Error', data);
    throw error;
  }
};

/**
 * Generate email HTML template
 */
const generateEmailTemplate = (data) => {
  const { requesteeNames, bu_name, div_name, judul, periode_awal, periode_akhir, points } = data;
  
  // Generate table rows for points and lines
  let tableRows = '';
  let no = 1;
  
  for (const point of points) {
    // Point row with special styling
    tableRows += `
      <tr class="point-row">
        <td style="padding:12px 10px;">${no}</td>
        <td colspan="4" style="padding:12px 10px;"><strong>${point.judul}</strong></td>
      </tr>
    `;
    
    // Line rows for this point
    let subno = 1;
    for (const line of point.lines) {
      const emailNotifHtml = line.email_notif ? 
        line.email_notif.split(',').join('<br>') : '-';
      
      const attachmentHtml = line.files && line.files.length > 0 ?
        line.files.map(f => `<a href="${getFileDownloadURL(f)}" target="_blank">${f}</a>`).join('<br>') : '-';
      
      tableRows += `
        <tr>
          <td style="padding:12px 10px;">${no}.${subno}</td>
          <td style="padding:12px 10px;">${line.deskripsi}</td>
          <td style="padding:12px 10px;">${emailNotifHtml}</td>
          <td style="padding:12px 10px;">${dayjs(line.due_date).format('DD MMM YYYY')}</td>
          <td style="padding:12px 10px;">${attachmentHtml}</td>
        </tr>
      `;
      subno++;
    }
    
    no++;
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
        }
        .email-wrapper {
          max-width: 700px;
          margin: 20px auto;
          background-color: #ffffff;
        }
        .header { 
          background: linear-gradient(135deg, #2e5cb8 0%, #4a7dc9 100%);
          padding: 40px 20px;
          text-align: center;
          color: white;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 600;
          letter-spacing: 1px;
        }
        .header p {
          margin: 10px 0 0 0;
          font-size: 14px;
          opacity: 0.95;
        }
        .content {
          padding: 40px 30px;
          background-color: #ffffff;
        }
        .greeting {
          font-size: 15px;
          color: #333;
          line-height: 1.6;
          margin-bottom: 20px;
        }
        .greeting strong {
          color: #2e5cb8;
        }
        .info-message {
          font-size: 14px;
          color: #666;
          line-height: 1.8;
          margin-bottom: 30px;
        }
        .info-box {
          background-color: #f8f9fa;
          border-left: 4px solid #2e5cb8;
          padding: 25px;
          margin: 25px 0;
          border-radius: 4px;
        }
        .info-row {
          display: flex;
          padding: 8px 0;
          border-bottom: 1px solid #e9ecef;
        }
        .info-row:last-child {
          border-bottom: none;
        }
        .info-label {
          flex: 0 0 180px;
          font-weight: 600;
          color: #555;
          font-size: 14px;
        }
        .info-separator {
          flex: 0 0 20px;
          color: #999;
        }
        .info-value {
          flex: 1;
          color: #333;
          font-size: 14px;
        }
        .section-title {
          font-size: 18px;
          font-weight: 600;
          color: #2e5cb8;
          margin: 30px 0 15px 0;
          padding-bottom: 10px;
          border-bottom: 2px solid #e9ecef;
        }
        .details-table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 20px 0;
          font-size: 13px;
        }
        .details-table th { 
          background-color: #2e5cb8;
          color: white;
          padding: 12px 10px;
          text-align: left;
          font-weight: 600;
        }
        .details-table td { 
          border: 1px solid #dee2e6;
          padding: 12px 10px;
          vertical-align: top;
        }
        .details-table tr:nth-child(even) {
          background-color: #f8f9fa;
        }
        .details-table a {
          color: #2e5cb8;
          text-decoration: none;
        }
        .details-table a:hover {
          text-decoration: underline;
        }
        .point-row {
          background-color: #e7f1ff !important;
          font-weight: 600;
        }
        .button-container {
          text-align: center;
          margin: 35px 0;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #2e5cb8 0%, #4a7dc9 100%);
          color: white;
          padding: 15px 40px;
          text-decoration: none;
          border-radius: 30px;
          font-weight: 600;
          font-size: 15px;
          box-shadow: 0 4px 15px rgba(46, 92, 184, 0.3);
        }
        .closing-text {
          font-size: 14px;
          color: #666;
          line-height: 1.6;
          margin-top: 30px;
        }
        .footer {
          background-color: #2c3e50;
          color: #ffffff;
          padding: 25px 30px;
          text-align: center;
        }
        .footer p {
          margin: 5px 0;
          font-size: 13px;
          opacity: 0.9;
        }
        .footer-title {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 10px;
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <!-- Header -->
        <div class="header">
          <h1>LEGAL MONITORING SYSTEM</h1>
          <p>Permintaan Request Summary</p>
        </div>
        
        <!-- Content -->
        <div class="content">
          <!-- Greeting -->
          <div class="greeting">
            Kepada Yth. <strong>${requesteeNames}</strong>,
          </div>
          
          <!-- Info Message -->
          <div class="info-message">
            Email ini sebagai pemberitahuan pengajuan request summary oleh <strong>Auditor Team</strong>, 
            ${div_name}, ${bu_name}.
          </div>
          
          <!-- Info Box -->
          <div class="info-box">
            <div class="info-row">
              <div class="info-label">Judul Request</div>
              <div class="info-separator">:</div>
              <div class="info-value"><strong>${judul}</strong></div>
            </div>
            <div class="info-row">
              <div class="info-label">Periode</div>
              <div class="info-separator">:</div>
              <div class="info-value">${periode_awal} s/d ${periode_akhir}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Divisi</div>
              <div class="info-separator">:</div>
              <div class="info-value">${div_name}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Business Unit</div>
              <div class="info-separator">:</div>
              <div class="info-value">${bu_name}</div>
            </div>
          </div>
          
          <!-- Section Title -->
          <div class="section-title">Detail Request</div>
          
          <!-- Details Table -->
          <table class="details-table">
            <thead>
              <tr>
                <th width="5%">No</th>
                <th width="40%">Request</th>
                <th width="20%">Notifikasi Email</th>
                <th width="15%">Due Date</th>
                <th width="20%">Attachment</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          
          <!-- Instruction Message -->
          <div class="info-message">
            Setelah melakukan review atas request summary, silahkan dilanjutkan untuk 
            memberikan penolakan atau revisi atau persetujuan di Legal Monitoring System dengan klik link di bawah ini.
          </div>
          
          <!-- Button -->
          <div class="button-container">
            <a href="http://legal.dbc.co.id" class="button" target="_blank">
              Lihat Detail & Proses Approval
            </a>
          </div>
          
          <!-- Closing -->
          <div class="closing-text">
            Kami mengucapkan terima kasih atas perhatian dan kerjasama dari Bapak/Ibu dan Tim.
          </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
          <p class="footer-title">Legal Monitoring System - Document Management System</p>
          <p>Email ini dikirim secara otomatis oleh sistem.</p>
          <p>Mohon tidak membalas email ini.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};
