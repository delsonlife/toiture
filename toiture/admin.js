#!/usr/bin/env node
/**
 * CLI d'administration des licences RoofWidget
 * Usage:
 *   node admin.js list                        — lister toutes les licences
 *   node admin.js add <domaine> <email>       — créer une nouvelle licence
 *   node admin.js disable <clé>               — désactiver une licence
 *   node admin.js enable <clé>                — réactiver une licence
 *   node admin.js leads [clé]                 — afficher les leads
 *   node admin.js export-leads                — exporter leads en CSV
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LICENSES_PATH = path.join(__dirname, "data", "licenses.json");
const LEADS_PATH = path.join(__dirname, "data", "leads.json");

function loadLicenses() {
  return JSON.parse(fs.readFileSync(LICENSES_PATH, "utf-8"));
}

function saveLicenses(data) {
  fs.writeFileSync(LICENSES_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function loadLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function generateKey() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case "list": {
    const licenses = loadLicenses();
    console.log("\n📋 Licences actives :\n");
    Object.entries(licenses).forEach(([key, cfg]) => {
      const status = cfg.active ? "✅" : "❌";
      console.log(`  ${status} ${key} — ${cfg.domain} (${cfg.branding?.companyName})`);
    });
    console.log();
    break;
  }

  case "add": {
    const [domain, email] = args;
    if (!domain || !email) {
      console.error("Usage: node admin.js add <domaine> <email>");
      process.exit(1);
    }
    const key = generateKey();
    const licenses = loadLicenses();
    licenses[key] = {
      domain,
      active: true,
      branding: {
        companyName: domain,
        primaryColor: "#ff6b00",
        secondaryColor: "#1a1a2e",
        logo: null,
        phone: "",
      },
      services: {
        renovation: true,
        repair: true,
        cleaning: true,
        insulation: true,
      },
      pricing: {
        base: { tuile: 95, ardoise: 145, zinc: 180, bac_acier: 110 },
        project_multiplier: { renovation: 1.0, repair: 0.35, cleaning: 0.15, insulation: 0.45 },
        pan_multiplier: { "1": 0.9, "2": 1.0, "4": 1.15, more: 1.3 },
        floor_multiplier: { "plain-pied": 1.0, "1-etage": 1.1, "2-etages": 1.2, plus: 1.35 },
        options: { velux: 850, gouttieres: 45, isolation: 35, depose: 12, charpente: 28 },
        regional_coefficients: { default: 1.0 },
        margin_low: 0.92,
        margin_high: 1.18,
      },
      lead_email: email,
      created_at: new Date().toISOString(),
    };
    saveLicenses(licenses);
    console.log(`\n✅ Licence créée : ${key}`);
    console.log(`   Domaine : ${domain}`);
    console.log(`   Email   : ${email}`);
    console.log(`\n   Ligne d'intégration :`);
    console.log(`   <script src="https://votre-domaine.vercel.app/widget.js?license=${key}"></script>\n`);
    break;
  }

  case "disable": {
    const [key] = args;
    if (!key) { console.error("Clé manquante"); process.exit(1); }
    const licenses = loadLicenses();
    if (!licenses[key]) { console.error("Licence introuvable"); process.exit(1); }
    licenses[key].active = false;
    saveLicenses(licenses);
    console.log(`\n❌ Licence ${key} désactivée.\n`);
    break;
  }

  case "enable": {
    const [key] = args;
    if (!key) { console.error("Clé manquante"); process.exit(1); }
    const licenses = loadLicenses();
    if (!licenses[key]) { console.error("Licence introuvable"); process.exit(1); }
    licenses[key].active = true;
    saveLicenses(licenses);
    console.log(`\n✅ Licence ${key} réactivée.\n`);
    break;
  }

  case "leads": {
    const [filterKey] = args;
    const leads = loadLeads();
    const filtered = filterKey ? leads.filter((l) => l.license === filterKey) : leads;
    console.log(`\n📥 ${filtered.length} lead(s)${filterKey ? ` pour ${filterKey}` : ""} :\n`);
    filtered.forEach((l) => {
      const est = l.estimate
        ? `${l.estimate.estimateLow.toLocaleString("fr-FR")}€ – ${l.estimate.estimateHigh.toLocaleString("fr-FR")}€`
        : "N/A";
      console.log(`  • ${l.name} | ${l.phone} | ${l.email} | ${est} | ${new Date(l.createdAt).toLocaleString("fr-FR")}`);
    });
    console.log();
    break;
  }

  case "export-leads": {
    const leads = loadLeads();
    const rows = ["ID,Licence,Nom,Email,Téléphone,CP,Projet,Matériau,Surface,Estimation basse,Estimation haute,Date"];
    leads.forEach((l) => {
      rows.push([
        l.id, l.license, `"${l.name}"`, l.email, l.phone, l.postalCode || "",
        l.estimate?.details?.project || "",
        l.estimate?.details?.material || "",
        l.estimate?.details?.surface || "",
        l.estimate?.estimateLow || "",
        l.estimate?.estimateHigh || "",
        l.createdAt,
      ].join(","));
    });
    const outPath = path.join(__dirname, "leads_export.csv");
    fs.writeFileSync(outPath, rows.join("\n"), "utf-8");
    console.log(`\n📊 Export CSV : ${outPath} (${leads.length} leads)\n`);
    break;
  }

  default:
    console.log(`
Usage:
  node admin.js list                   — lister les licences
  node admin.js add <domaine> <email>  — créer une licence
  node admin.js disable <clé>          — désactiver
  node admin.js enable <clé>           — réactiver
  node admin.js leads [clé]            — voir les leads
  node admin.js export-leads           — exporter en CSV
`);
}
