// api/license.js — vérifie la validité d'une licence et retourne les données de branding
const fs = require("fs");
const path = require("path");

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

function getLicenses() {
  const filePath = path.join(process.cwd(), "data", "licenses.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.referer || "";

  // Preflight CORS
  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

  const { license } = req.query;
  if (!license) {
    return res.status(400).json({ error: "Missing license key" });
  }

  const licenses = getLicenses();
  const config = licenses[license];

  if (!config) {
    return res.status(403).json({ error: "Invalid license" });
  }

  if (!config.active) {
    return res.status(403).json({ error: "License inactive" });
  }

  // Vérification de domaine
  const requestDomain = extractDomain(origin);
  const allowedDomain = config.domain.replace(/^www\./, "");

  const isLocalDev =
    !requestDomain ||
    requestDomain === "localhost" ||
    requestDomain === "127.0.0.1" ||
    requestDomain.endsWith(".vercel.app");

  if (!isLocalDev && requestDomain !== allowedDomain) {
    console.warn(`Domain mismatch: expected ${allowedDomain}, got ${requestDomain}`);
    return res.status(403).json({ error: "Domain not authorized for this license" });
  }

  // Ne retourner QUE les infos de branding, jamais les tarifs
  return res.status(200).json({
    valid: true,
    branding: config.branding,
    services: config.services,
  });
};
