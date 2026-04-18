import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import dotenv from "dotenv";
import PDFDocument from "pdfkit";
import { Writable } from "stream";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Helper to generate PDF in memory
async function generateGuidelinesPDF(name: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        },
        final(callback) {
          resolve(Buffer.concat(chunks));
          callback();
        }
      });

      doc.on('error', reject);
      doc.pipe(stream);

      // Header
      doc.fillColor("#0056B3").fontSize(20).text("THIAGARAJAR COLLEGE OF ENGINEERING", { align: "center" });
      doc.fillColor("#444").fontSize(12).text("Department of Civil Engineering - Madurai", { align: "center" });
      doc.moveDown();
      doc.rect(50, doc.y, 500, 2).fill("#0056B3");
      doc.moveDown(2);

      // Title
      doc.fillColor("#000").fontSize(16).text("TECHNICAL GUIDELINES: UPV REBAR INFLUENCE IN RCC", { underline: true });
      doc.moveDown();

      doc.fontSize(11).fillColor("#333");
      doc.text(`Prepared for: ${name}`);
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.moveDown();

      // Content
      doc.fillColor("#0056B3").fontSize(14).text("1. Evaluation Principle", { stroke: true });
      doc.fillColor("#333").fontSize(11).text("Rebar influence is evaluated by comparing the pulse velocity in Plain Cement Concrete (PCC) and Reinforced Cement Concrete (RCC). By testing across different rebar configurations, we quantify the 'steel-bridge' effect to ensure the diagnostic result reflects the true quality of the concrete matrix, not the reinforcement.", { lineGap: 4 });
      doc.moveDown(1.5);

      doc.fillColor("#0056B3").fontSize(14).text("2. Perpendicular Orientation", { stroke: true });
      doc.fillColor("#333").fontSize(11).text("- Correction Factor: A fundamental correction factor of 0.9 is utilized in the calculation logic.", { lineGap: 4 });
      doc.text("- K-Factor Integration: The influence is refined by the ratio of bar diameter to total path length, ensuring the traversal through steel is neutralized.", { lineGap: 4 });
      doc.moveDown(1.5);

      doc.fillColor("#0056B3").fontSize(14).text("3. Parallel Orientation", { stroke: true });
      doc.fillColor("#333").fontSize(11).text("- Influence Zone: The tool evaluates whether the rebar is within a critical proximity (a) to the signal path.", { lineGap: 4 });
      doc.text("- Comparative Logic: If influence is confirmed, the RCC measurement is adjusted back to its equivalent PCC velocity using standard deviation algorithms.", { lineGap: 4 });
      doc.moveDown(1.5);

      doc.fillColor("#0056B3").fontSize(14).text("4. Diagnostic Criteria (IS 516 : Part 5)", { stroke: true });
      doc.fillColor("#333").fontSize(11).text("- Excellent: > 4.5 km/sec", { lineGap: 2 });
      doc.text("- Good: 3.5 - 4.5 km/sec", { lineGap: 2 });
      doc.text("- Medium: 3.0 - 3.5 km/sec", { lineGap: 2 });
      doc.text("- Doubtful: < 3.0 km/sec (Requires investigative action)", { lineGap: 2 });
      doc.moveDown(3);

      // Footer / Support Section
      doc.rect(50, doc.y, 500, 1).fill("#EEEEEE");
      doc.moveDown(1.5);
      doc.fontSize(11).fillColor("#0056B3").text("LABORATORY SUPPORT CONTACTS", { align: "center", characterSpacing: 1 });
      doc.moveDown(0.8);
      doc.fontSize(10).fillColor("#555").text("Thiagarajar College of Engineering | Civil Engineering Lab", { align: "center" });
      doc.moveDown(0.5);
      doc.fillColor("#0056B3").text("anandarao242004@gmail.com", { align: "center", underline: true });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Health check endpoint
app.get("/api/health", async (req, res) => {
  let emailStatus = "unknown";
  const resendKey = process.env.RESEND_API_KEY;
  const gmailUser = process.env.EMAIL_USER;
  const gmailPass = process.env.EMAIL_PASS;

  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      // Basic check: list domains (validates key)
      await resend.domains.list();
      emailStatus = "resend-verified";
    } catch (err: any) {
      emailStatus = `resend-failed: ${err?.message || "unknown"}`;
    }
  } else if (gmailUser && gmailPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { 
          user: gmailUser.trim(), 
          pass: gmailPass.replace(/\s+/g, "") 
        },
        connectionTimeout: 5000,
      });
      await transporter.verify();
      emailStatus = "gmail-verified";
    } catch (err: any) {
      emailStatus = `gmail-failed: ${err?.message || "unknown"}`;
    }
  }

  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    secrets: {
      resend: !!resendKey,
      gmail: !!gmailUser,
      status: emailStatus
    }
  });
});

// API route to send welcome email with PDF guidelines
app.post("/api/welcome-email", async (req, res) => {
  const { name, email } = req.body;
  console.log(`[Server] Processing email request for: ${email}`);

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  // Credentials
  const resendKey = process.env.RESEND_API_KEY;
  const gmailUser = process.env.EMAIL_USER?.trim();
  const gmailPass = process.env.EMAIL_PASS?.replace(/\s+/g, "");

  if (!resendKey && (!gmailUser || !gmailPass)) {
    console.warn("[Server] Missing credentials. Sending 'success' but skipping email.");
    return res.json({ 
      success: true, 
      warning: "Environment variables RESEND_API_KEY or EMAIL config are missing." 
    });
  }

  try {
    const pdfBuffer = await generateGuidelinesPDF(name);
    console.log("[Server] PDF generated");

    if (resendKey) {
      // Use Resend
      const resend = new Resend(resendKey);
      const { data, error } = await resend.emails.send({
        from: 'UPV Lab Analysis <onboarding@resend.dev>',
        to: [email],
        subject: "Laboratory Guidelines: UPV Analysis for Reinforced Concrete",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee;">
            <h2 style="color: #0056B3; text-align: center;">Welcome to the UPV Analysis System</h2>
            <p>Hello <b>${name}</b>,</p>
            <p>Your access to the reinforced concrete analysis protocol at <b>Thiagarajar College of Engineering</b> has been verified. Attached are the official laboratory guidelines.</p>
            <div style="background: #f9f9f9; padding: 15px; border-left: 5px solid #0056B3; margin: 20px 0;">
              <p style="margin: 0;"><b>Key Coverage:</b></p>
              <ul style="margin: 10px 0;">
                <li>PCC vs RCC Comparative Analysis</li>
                <li>Rebar Interference Offset Calculations</li>
                <li>Correction Factor Implementation (0.9)</li>
              </ul>
            </div>
            <p>Please review these guidelines before performing your first analysis.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 11px; color: #777; text-align: center;">
              Laboratory Support: Anandarao | Thiagarajar College of Engineering<br/>
              Contact: anandarao242004@gmail.com
            </p>
          </div>
        `,
        attachments: [{ filename: "UPV_RCC_Guidelines.pdf", content: pdfBuffer }]
      });

      if (error) throw error;
      console.log(`[Server] Email sent via Resend to ${email}`);
    } else {
      // Use Nodemailer Fallback
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: gmailUser!, pass: gmailPass! },
        pool: true,
        maxConnections: 1,
        maxMessages: 1,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });

      const mailOptions = {
        from: `"UPV Lab Analysis" <${gmailUser}>`,
        to: email,
        subject: "Laboratory Guidelines: UPV Analysis for Reinforced Concrete",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee;">
            <h2 style="color: #0056B3; text-align: center;">Welcome to the UPV Analysis System</h2>
            <p>Hello <b>${name}</b>,</p>
            <p>Your access to the reinforced concrete analysis protocol at <b>Thiagarajar College of Engineering</b> has been verified. Attached are the official laboratory guidelines.</p>
            <div style="background: #f9f9f9; padding: 15px; border-left: 5px solid #0056B3; margin: 20px 0;">
              <p style="margin: 0;"><b>Key Coverage:</b></p>
              <ul style="margin: 10px 0;">
                <li>PCC vs RCC Comparative Analysis</li>
                <li>Rebar Interference Offset Calculations</li>
                <li>Correction Factor Implementation (0.9)</li>
              </ul>
            </div>
            <p>Please review these guidelines before performing your first analysis.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 11px; color: #777; text-align: center;">
              Laboratory Support: Anandarao | Thiagarajar College of Engineering<br/>
              Contact: anandarao242004@gmail.com
            </p>
          </div>
        `,
        attachments: [{ filename: "UPV_RCC_Guidelines.pdf", content: pdfBuffer }]
      };

      await transporter.sendMail(mailOptions);
      console.log(`[Server] Email sent via Gmail to ${email}`);
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Server] Error sending email:", error);
    
    let userMessage = "Internal error";
    if (resendKey) {
      userMessage = `Resend Error: ${error?.message || "Check API Key and Sending Domain"}`;
    } else if (error?.code === 'EAUTH') {
      userMessage = "Gmail login failed. Check your App Password.";
    }

    res.status(500).json({ 
      error: "Service Error", 
      message: error?.message || "Internal error",
      detail: userMessage
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
