// api/calculate.js — moteur de calcul côté serveur uniquement
// Les formules et tarifs ne transitent JAMAIS vers le navigateur.
const fs = require("fs");
const path = require("path");

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

function getRegionalCoefficient(postalCode, regionalCoefficients) {
  if (!postalCode) return regionalCoefficients["default"] || 1.0;
  const prefix2 = postalCode.substring(0, 2);
  return (
    regionalCoefficients[prefix2] ||
    regionalCoefficients["default"] ||
    1.0
  );
}

function calculate(data, pricing) {
  const {
    project,
    material,
    surface,
    pans,
    accessibility,
    options = [],
    postalCode,
  } = data;

  // Prix de base au m²
  const basePrice = pricing.base[material] || 100;

  // Multiplicateur type de projet
  const projectMult = pricing.project_multiplier[project] || 1.0;

  // Multiplicateur pans
  const panMult = pricing.pan_multiplier[pans] || 1.0;

  // Multiplicateur étages
  const floorMult = pricing.floor_multiplier[accessibility] || 1.0;

  // Coefficient régional
  const regionalCoeff = getRegionalCoefficient(
    postalCode,
    pricing.regional_coefficients
  );

  // Calcul surface de base
  const surfaceNum = parseFloat(surface) || 100;

  // Prix matériaux + pose
  let total = basePrice * surfaceNum * projectMult * panMult * floorMult * regionalCoeff;

  // Options
  let optionsTotal = 0;
  const optionDetails = [];

  if (options.includes("velux")) {
    const cost = pricing.options.velux;
    optionsTotal += cost;
    optionDetails.push({ label: "Velux", price: cost });
  }
  if (options.includes("gouttieres")) {
    // Gouttières au mètre linéaire estimé (périmètre ≈ surface^0.5 * 4)
    const linearMeters = Math.round(Math.sqrt(surfaceNum) * 4);
    const cost = pricing.options.gouttieres * linearMeters;
    optionsTotal += cost;
    optionDetails.push({ label: "Gouttières", price: cost });
  }
  if (options.includes("isolation")) {
    const cost = pricing.options.isolation * surfaceNum;
    optionsTotal += cost;
    optionDetails.push({ label: "Isolation", price: cost });
  }
  if (options.includes("depose")) {
    const cost = pricing.options.depose * surfaceNum;
    optionsTotal += cost;
    optionDetails.push({ label: "Dépose ancienne toiture", price: cost });
  }
  if (options.includes("charpente")) {
    const cost = pricing.options.charpente * surfaceNum;
    optionsTotal += cost;
    optionDetails.push({ label: "Traitement charpente", price: cost });
  }

  total += optionsTotal;

  // Marges basse / haute
  const low = Math.round((total * pricing.margin_low) / 100) * 100;
  const high = Math.round((total * pricing.margin_high) / 100) * 100;

  // Délai estimatif (jours)
  const baseDays = Math.max(1, Math.round(surfaceNum / 40));
  const delayLow = Math.max(1, baseDays);
  const delayHigh = Math.max(2, Math.round(baseDays * 1.5));

  // Détail simplifié (sans révéler les tarifs unitaires)
  const materialLabels = {
    tuile: "Tuile",
    ardoise: "Ardoise",
    zinc: "Zinc",
    bac_acier: "Bac acier",
  };

  const projectLabels = {
    renovation: "Réfection complète",
    repair: "Réparation",
    cleaning: "Démoussage",
    insulation: "Isolation",
  };

  return {
    estimateLow: low,
    estimateHigh: high,
    delayLow,
    delayHigh,
    details: {
      project: projectLabels[project] || project,
      material: materialLabels[material] || material,
      surface: surfaceNum,
      optionDetails,
    },
  };
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

  const { license, data } = req.body || {};

  if (!license || !data) {
    return res.status(400).json({ error: "Missing license or data" });
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

  // Validation des inputs
  const allowedProjects = ["renovation", "repair", "cleaning", "insulation"];
  const allowedMaterials = ["tuile", "ardoise", "zinc", "bac_acier"];
  const allowedPans = ["1", "2", "4", "more"];
  const allowedAccess = ["plain-pied", "1-etage", "2-etages", "plus"];

  if (!allowedProjects.includes(data.project)) {
    return res.status(400).json({ error: "Invalid project type" });
  }
  if (!allowedMaterials.includes(data.material)) {
    return res.status(400).json({ error: "Invalid material" });
  }

  const surface = parseFloat(data.surface);
  if (isNaN(surface) || surface < 10 || surface > 2000) {
    return res.status(400).json({ error: "Invalid surface area" });
  }

  // Vérifier que le service est activé pour cette licence
  const serviceMap = {
    renovation: "renovation",
    repair: "repair",
    cleaning: "cleaning",
    insulation: "insulation",
  };
  if (!config.services[serviceMap[data.project]]) {
    return res.status(400).json({ error: "Service not available for this license" });
  }

  try {
    const result = calculate(data, config.pricing);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Calculation error:", err);
    return res.status(500).json({ error: "Calculation failed" });
  }
};
