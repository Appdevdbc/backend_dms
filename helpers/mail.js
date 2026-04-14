import {dbHris} from "../config/db.js";
import nodemailer from "nodemailer";
import * as dotenv from "dotenv";
dotenv.config();

export const sendMail = async (data) => {
	try {
		let mailSender = await dbHris("ptl_apps")
						.join("ptl_mail_sender", "ptl_mail_sender.id", "ptl_apps.apps_sender")
						.select("ms_name","ms_pass","ms_host","ms_name_alias")
						.where("apps_slug", process.env.APP_FLAG)
						.first();
		// console.log(mailSender);
		if (!mailSender) {
			throw {
				message: "Data mail sender tidak tersedia",
			};
		}
		
		const transporter = nodemailer.createTransport({
			port: 587,
			host: mailSender.ms_host,
			auth: {
				user: mailSender.ms_name,
				pass: mailSender.ms_pass,
			},
			secure: false,
		});	
		
		let mailData;
		console.log(mailData);
        if (process.env.ENVIRONMENT == 'LOCAL'){
			mailData = {
				//from: data.from,
				from: `${process.env.APP_ALIAS} "LOCAL" <${mailSender.ms_name_alias}>`,
				to: process.env.MAIL_TO?process.env.MAIL_TO:data.to,
				cc: process.env.MAIL_CC?process.env.MAIL_CC:data.cc,
				bcc: data.bcc ? data.bcc : "",
				subject: data.subject,
				html: data.html,
			};
		}
		else if (process.env.ENVIRONMENT == 'DEV'){
			mailData = {
				//from: data.from,
				from: `${process.env.APP_ALIAS} "DEV" <${mailSender.ms_name_alias}>`,
				to: process.env.MAIL_TO?process.env.MAIL_TO:data.to,
				cc: process.env.MAIL_CC?process.env.MAIL_CC:data.cc,
				bcc: data.bcc ? data.bcc : "",
				subject: data.subject,
				html: data.html,
			};
		}
		else if (process.env.ENVIRONMENT == 'TEST'){
			mailData = {
				//from: data.from,
				from: `${process.env.APP_ALIAS} "TEST" <${mailSender.ms_name_alias}>`,
				to: process.env.MAIL_TO?process.env.MAIL_TO:data.to,
				cc: process.env.MAIL_CC?process.env.MAIL_CC:data.cc,
				bcc: data.bcc ? data.bcc : "",
				subject: data.subject,
				html: data.html,
			};
		}
		else {
			mailData = {
				//from: data.from,
				from: `${process.env.APP_ALIAS} <${mailSender.ms_name_alias}>`,
				to: data.to,
				cc: data.cc ? data.cc : "",
				bcc: data.bcc ? data.bcc : "",
				subject: data.subject,
				html: data.html,
			};
		}

		await transporter.sendMail(mailData);
	} catch (error) {
		throw error;
	}
};

/**
 * Send cancellation notification email
 * @param {Object} data - Email data
 * @param {string} data.to - Recipient email
 * @param {string} data.doc_id - Document number
 * @param {Date} data.created_date - Creation date
 * @param {string} data.doc_judul - Document title
 * @param {string} data.account_name - PIC name
 * @param {string} data.doc_alasan_batal - Cancellation reason
 */
export const sendCancellationEmail = async (data) => {
	try {
		const ejs = await import('ejs');
		const path = await import('path');
		const { fileURLToPath } = await import('url');
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = path.dirname(__filename);
		
		// Format date to DD-MM-YYYY
		const formatDate = (date) => {
			if (!date) return '-';
			const d = new Date(date);
			const day = String(d.getDate()).padStart(2, '0');
			const month = String(d.getMonth() + 1).padStart(2, '0');
			const year = d.getFullYear();
			return `${day}-${month}-${year}`;
		};
		
		// Render email template
		const templatePath = path.join(__dirname, '../view/email/cancellation-notification.ejs');
		const html = await ejs.renderFile(templatePath, {
			doc_id: data.doc_id,
			created_date: formatDate(data.created_date),
			doc_judul: data.doc_judul || '-',
			account_name: data.account_name || '-',
			doc_alasan_batal: data.doc_alasan_batal || '-'
		});
		
		// Send email using existing sendMail function
		await sendMail({
			to: data.to,
			subject: 'NOTIFIKASI PEMBATALAN NOMOR DOKUMEN',
			html: html
		});
		
	} catch (error) {
		throw error;
	}
};
