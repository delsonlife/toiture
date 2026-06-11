// api/lead.js — capture et stockage des leads avec support multi-provider email
const fs = require("fs");
const path = require("path");

function getLicenses() {
  const filePath = path.join(process.cwd(), "data", "licenses.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getLeads() {
  const filePath = path.join(process.cwd(), "data", "leads.json");
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

function saveLead(lead) {
  const filePath = path.join(process.cwd(), "data", "leads.json");
  const leads = getLeads();
  leads.push(lead);
  fs.writeFileSync(filePath, JSON.stringify(leads, null, 2), "utf-8");
}

function extractDomain(originOrReferer) {
  if (!originOrReferer) return null;
  try {
    const url = new URL(originOrReferer);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return originOrReferer.replace(/^www\./, "").split("/")[0];
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  return /^[\d\s\+\-\.]{8,20}$/.test(phone);
}

// --- Envoi email via Resend (activer en définissant RESEND_API_KEY) ---
async function sendViaResend(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "noreply@votre-domaine.fr",
      to: [to],
      subject,
      html,
    }),
  });

  return response.ok;
}

// --- Envoi email via Brevo (activer en définissant BREVO_API_KEY) ---
async function sendViaBrevo(to, subject, html, fromName = "Calculateur Toiture") {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return false;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: process.env.BREVO_FROM || "noreply@votre-domaine.fr" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  return response.ok;
}

async function sendNotification(config, lead) {
  if (!config.lead_email) return;

  const subject = `Nouveau devis toiture — ${lead.name} (${lead.postalCode || "?"})`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1a1a2e">Nouvelle demande de devis</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Nom</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${lead.name}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Téléphone</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${lead.phone}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${lead.email}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Code postal</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${lead.postalCode || "N/A"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Projet</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${lead.estimate?.details?.project || "N/A"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Matériau</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${lead.estimate?.details?.material || "N/A"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Surface</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${lead.estimate?.details?.surface || "N/A"} m²</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Estimation</strong></td><td style="padding:8px;border-bottom:1px solid #eee"><strong>${lead.estimate ? `${lead.estimate.estimateLow.toLocaleString("fr-FR")} € à ${lead.estimate.estimateHigh.toLocaleString("fr-FR")} €` : "N/A"}</strong></td></tr>
        <tr><td style="padding:8px"><strong>Date</strong></td><td style="padding:8px">${new Date(lead.createdAt).toLocaleString("fr-FR")}</td></tr>
      </table>
    </div>
  `;

  // Essayer Resend en premier, puis Brevo
  const sent = await sendViaResend(config.lead_email, subject, html);
  if (!sent) {
    await sendViaBrevo(config.lead_email, subject, html, config.branding?.companyName);
  }
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.referer || "";

  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

  const { license, lead } = req.body || {};

  if (!license || !lead) {
    return res.status(400).json({ error: "Missing license or lead data" });
  }

  const licenses = getLicenses();
  const config = licenses[license];

  if (!config || !config.active) {
    return res.status(403).json({ error: "Invalid or inactive license" });
  }

  // Vérification domaine
  const requestDomain = extractDomain(origin);
  const allowedDomain = config.domain.replace(/^www\./, "");
  const isLocalDev =
    !requestDomain ||
    requestDomain === "localhost" ||
    requestDomain === "127.0.0.1" ||
    requestDomain.endsWith(".vercel.app");

  if (!isLocalDev && requestDomain !== allowedDomain) {
    return res.status(403).json({ error: "Domain not authorized" });
  }

  // Validation des champs lead
  if (!lead.name || lead.name.trim().length < 2) {
    return res.status(400).json({ error: "Invalid name" });
  }
  if (!lead.phone || !validatePhone(lead.phone)) {
    return res.status(400).json({ error: "Invalid phone number" });
  }
  if (!lead.email || !validateEmail(lead.email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const sanitizedLead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    license,
    name: lead.name.trim().substring(0, 100),
    phone: lead.phone.trim().substring(0, 20),
    email: lead.email.trim().toLowerCase().substring(0, 150),
    postalCode: (lead.postalCode || "").trim().substring(0, 10),
    estimate: lead.estimate || null,
    source: requestDomain || "unknown",
    createdAt: new Date().toISOString(),
  };

  try {
    saveLead(sanitizedLead);
    // Notification email asynchrone (non bloquante)
    sendNotification(config, sanitizedLead).catch(console.error);

    return res.status(201).json({
      success: true,
      leadId: sanitizedLead.id,
      message: "Votre demande a bien été enregistrée.",
    });
  } catch (err) {
    console.error("Lead save error:", err);
    return res.status(500).json({ error: "Failed to save lead" });
  }
};
