/**
 * RoofWidget v1.0 — Calculateur de devis toiture
 * Charge la config via la licence, effectue les calculs côté serveur,
 * capture les leads et les envoie à l'API.
 *
 * Usage: <script src="https://votre-domaine.vercel.app/widget.js?license=XXXX"></script>
 */
(function (window, document) {
  "use strict";

  // -------------------------------------------------------
  // Config runtime
  // -------------------------------------------------------
  const _currentScript =
    document.currentScript ||
    (function () {
      const scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  const _scriptSrc = _currentScript ? _currentScript.src : "";
  const _baseUrl = _scriptSrc.split("/widget.js")[0];

  function _getParam(name) {
    const url = new URL(_scriptSrc);
    return url.searchParams.get(name);
  }

  const LICENSE_KEY = _getParam("license");
  const TRIGGER_TEXT = _getParam("text") || "Estimer mon toit gratuitement";

  if (!LICENSE_KEY) {
    console.error("[RoofWidget] Paramètre license manquant dans l'URL du script.");
    return;
  }

  // -------------------------------------------------------
  // State
  // -------------------------------------------------------
  const state = {
    step: 0,
    branding: null,
    services: null,
    estimate: null,
    form: {
      project: null,
      material: null,
      surface: 100,
      pans: null,
      accessibility: null,
      options: [],
      postalCode: "",
    },
  };

  const TOTAL_STEPS = 8; // étapes 0-7

  // -------------------------------------------------------
  // Helpers DOM
  // -------------------------------------------------------
  function el(id) { return document.getElementById(id); }
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function fmt(n) {
    return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  }

  // -------------------------------------------------------
  // API calls
  // -------------------------------------------------------
  async function fetchLicense() {
    const res = await fetch(`${_baseUrl}/api/license?license=${LICENSE_KEY}`, {
      credentials: "omit",
    });
    if (!res.ok) throw new Error("Licence invalide ou domaine non autorisé.");
    return res.json();
  }

  async function fetchCalculation(data) {
    const res = await fetch(`${_baseUrl}/api/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ license: LICENSE_KEY, data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erreur de calcul.");
    }
    return res.json();
  }

  async function submitLead(leadData) {
    const res = await fetch(`${_baseUrl}/api/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ license: LICENSE_KEY, lead: leadData }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erreur d'envoi.");
    }
    return res.json();
  }

  // -------------------------------------------------------
  // CSS injection
  // -------------------------------------------------------
  function injectCSS() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${_baseUrl}/widget.css`;
    document.head.appendChild(link);
  }

  function applyBranding(branding) {
    if (!branding) return;
    const root = document.documentElement;
    if (branding.primaryColor) {
      root.style.setProperty("--rw-primary", branding.primaryColor);
      // Calculer la variante sombre (+20% plus sombre)
      root.style.setProperty("--rw-primary-dark", darkenColor(branding.primaryColor, 20));
    }
    if (branding.secondaryColor) {
      root.style.setProperty("--rw-text", branding.secondaryColor);
    }
  }

  function darkenColor(hex, pct) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, (num >> 16) - Math.round(2.55 * pct));
    const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(2.55 * pct));
    const b = Math.max(0, (num & 0xff) - Math.round(2.55 * pct));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // -------------------------------------------------------
  // HTML structure
  // -------------------------------------------------------
  function buildHTML(branding, services) {
    const companyName = branding?.companyName || "Calculateur Toiture";
    const logoHtml = branding?.logo
      ? `<img src="${branding.logo}" class="rw-logo-img" alt="${companyName}">`
      : `<span class="rw-company-name">🏠 ${companyName}</span>`;

    const tpl = `
<div id="rw-overlay">
  <div id="rw-widget" role="dialog" aria-modal="true" aria-label="Calculateur de devis toiture">

    <!-- Header -->
    <div class="rw-header">
      <div class="rw-logo-wrap">${logoHtml}</div>
      <button class="rw-close-btn" id="rw-close" aria-label="Fermer">✕</button>
    </div>

    <!-- Progress -->
    <div class="rw-progress-wrap">
      <div class="rw-progress-label">
        <span id="rw-step-label">Étape 1 sur ${TOTAL_STEPS}</span>
        <span id="rw-step-pct">0 %</span>
      </div>
      <div class="rw-progress-bar">
        <div class="rw-progress-fill" id="rw-progress" style="width:0%"></div>
      </div>
    </div>

    <!-- Body -->
    <div class="rw-body" id="rw-body">

      <!-- Loading overlay -->
      <div class="rw-loading" id="rw-loading">
        <div class="rw-spinner"></div>
        <p class="rw-loading-text" id="rw-loading-text">Calcul en cours…</p>
      </div>

      <!-- Étape 0 : Projet -->
      <div class="rw-step rw-active" id="rw-step-0">
        <p class="rw-step-title">Quel est votre projet ?</p>
        <p class="rw-step-subtitle">Sélectionnez le type de travaux souhaité.</p>
        <div class="rw-cards">
          ${services.renovation !== false ? `<button class="rw-card" data-step="0" data-value="renovation">
            <span class="rw-card-icon">🏗️</span>
            <span class="rw-card-label">Réfection complète</span>
            <span class="rw-card-check">✓</span>
          </button>` : ""}
          ${services.repair !== false ? `<button class="rw-card" data-step="0" data-value="repair">
            <span class="rw-card-icon">🔧</span>
            <span class="rw-card-label">Réparation</span>
            <span class="rw-card-check">✓</span>
          </button>` : ""}
          ${services.cleaning !== false ? `<button class="rw-card" data-step="0" data-value="cleaning">
            <span class="rw-card-icon">🧹</span>
            <span class="rw-card-label">Démoussage</span>
            <span class="rw-card-check">✓</span>
          </button>` : ""}
          ${services.insulation !== false ? `<button class="rw-card" data-step="0" data-value="insulation">
            <span class="rw-card-icon">🧱</span>
            <span class="rw-card-label">Isolation toiture</span>
            <span class="rw-card-check">✓</span>
          </button>` : ""}
        </div>
      </div>

      <!-- Étape 1 : Matériau -->
      <div class="rw-step" id="rw-step-1">
        <p class="rw-step-title">Quel matériau ?</p>
        <p class="rw-step-subtitle">Choisissez le type de couverture de votre toit.</p>
        <div class="rw-cards rw-2col">
          <button class="rw-card" data-step="1" data-value="tuile">
            <span class="rw-card-icon">🍂</span>
            <span class="rw-card-label">Tuile</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card" data-step="1" data-value="ardoise">
            <span class="rw-card-icon">🪨</span>
            <span class="rw-card-label">Ardoise</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card" data-step="1" data-value="zinc">
            <span class="rw-card-icon">🔩</span>
            <span class="rw-card-label">Zinc</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card" data-step="1" data-value="bac_acier">
            <span class="rw-card-icon">🏭</span>
            <span class="rw-card-label">Bac acier</span>
            <span class="rw-card-check">✓</span>
          </button>
        </div>
      </div>

      <!-- Étape 2 : Surface -->
      <div class="rw-step" id="rw-step-2">
        <p class="rw-step-title">Surface estimée du toit</p>
        <p class="rw-step-subtitle">Déplacez le curseur pour ajuster la surface.</p>
        <div class="rw-slider-wrap">
          <div class="rw-slider-display">
            <span class="rw-slider-value" id="rw-surface-val">100</span>
            <span class="rw-slider-unit"> m²</span>
          </div>
          <input
            type="range"
            class="rw-slider"
            id="rw-surface-slider"
            min="20"
            max="500"
            step="5"
            value="100"
            aria-label="Surface du toit en m²"
          >
          <div class="rw-slider-hints">
            <span>20 m²</span>
            <span>500 m²</span>
          </div>
        </div>
      </div>

      <!-- Étape 3 : Pans -->
      <div class="rw-step" id="rw-step-3">
        <p class="rw-step-title">Nombre de pans</p>
        <p class="rw-step-subtitle">Un pan = une face inclinée du toit.</p>
        <div class="rw-cards rw-2col">
          <button class="rw-card" data-step="3" data-value="1">
            <span class="rw-card-icon">📐</span>
            <span class="rw-card-label">1 pan</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card" data-step="3" data-value="2">
            <span class="rw-card-icon">🏠</span>
            <span class="rw-card-label">2 pans</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card" data-step="3" data-value="4">
            <span class="rw-card-icon">⛪</span>
            <span class="rw-card-label">4 pans</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card" data-step="3" data-value="more">
            <span class="rw-card-icon">🏰</span>
            <span class="rw-card-label">Plus de 4</span>
            <span class="rw-card-check">✓</span>
          </button>
        </div>
      </div>

      <!-- Étape 4 : Accessibilité -->
      <div class="rw-step" id="rw-step-4">
        <p class="rw-step-title">Accessibilité du chantier</p>
        <p class="rw-step-subtitle">Le niveau influence le coût d'installation.</p>
        <div class="rw-cards">
          <button class="rw-card" data-step="4" data-value="plain-pied">
            <span class="rw-card-icon">🏡</span>
            <span class="rw-card-label">Plain-pied</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card" data-step="4" data-value="1-etage">
            <span class="rw-card-icon">🏘️</span>
            <span class="rw-card-label">1 étage</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card" data-step="4" data-value="2-etages">
            <span class="rw-card-icon">🏢</span>
            <span class="rw-card-label">2 étages</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card" data-step="4" data-value="plus">
            <span class="rw-card-icon">🏙️</span>
            <span class="rw-card-label">Plus de 2 étages</span>
            <span class="rw-card-check">✓</span>
          </button>
        </div>
      </div>

      <!-- Étape 5 : Options -->
      <div class="rw-step" id="rw-step-5">
        <p class="rw-step-title">Options souhaitées</p>
        <p class="rw-step-subtitle">Sélectionnez tout ce qui s'applique (optionnel).</p>
        <div class="rw-cards">
          <button class="rw-card rw-multi" data-step="5" data-value="velux">
            <span class="rw-card-icon">🔆</span>
            <span class="rw-card-label">Velux</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card rw-multi" data-step="5" data-value="gouttieres">
            <span class="rw-card-icon">💧</span>
            <span class="rw-card-label">Gouttières</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card rw-multi" data-step="5" data-value="isolation">
            <span class="rw-card-icon">🌡️</span>
            <span class="rw-card-label">Isolation</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card rw-multi" data-step="5" data-value="depose">
            <span class="rw-card-icon">🗑️</span>
            <span class="rw-card-label">Dépose ancienne toiture</span>
            <span class="rw-card-check">✓</span>
          </button>
          <button class="rw-card rw-multi" data-step="5" data-value="charpente">
            <span class="rw-card-icon">🪵</span>
            <span class="rw-card-label">Traitement charpente</span>
            <span class="rw-card-check">✓</span>
          </button>
        </div>
      </div>

      <!-- Étape 6 : Code postal -->
      <div class="rw-step" id="rw-step-6">
        <p class="rw-step-title">Votre code postal</p>
        <p class="rw-step-subtitle">Il nous permet d'appliquer les tarifs régionaux.</p>
        <div class="rw-input-wrap">
          <label class="rw-label" for="rw-postal">Code postal</label>
          <input
            type="text"
            id="rw-postal"
            class="rw-input"
            placeholder="75001"
            maxlength="5"
            inputmode="numeric"
            pattern="[0-9]{5}"
            autocomplete="postal-code"
          >
          <span class="rw-field-error" id="rw-postal-error">Veuillez entrer un code postal valide (5 chiffres).</span>
        </div>
      </div>

      <!-- Étape 7 : Résultat + Lead -->
      <div class="rw-step" id="rw-step-7">
        <!-- Résultat rempli dynamiquement -->
        <div id="rw-result-area"></div>

        <!-- Formulaire lead -->
        <div id="rw-lead-form">
          <p class="rw-step-title">Recevoir mon estimation détaillée</p>
          <p class="rw-step-subtitle">Gratuit et sans engagement. Votre couvreur vous recontacte sous 24h.</p>

          <div class="rw-input-wrap">
            <label class="rw-label" for="rw-name">Votre prénom et nom</label>
            <input type="text" id="rw-name" class="rw-input" placeholder="Jean Dupont" autocomplete="name">
            <span class="rw-field-error" id="rw-name-error">Veuillez entrer votre nom.</span>
          </div>
          <div class="rw-input-wrap">
            <label class="rw-label" for="rw-phone">Téléphone</label>
            <input type="tel" id="rw-phone" class="rw-input" placeholder="06 12 34 56 78" autocomplete="tel" inputmode="tel">
            <span class="rw-field-error" id="rw-phone-error">Numéro de téléphone invalide.</span>
          </div>
          <div class="rw-input-wrap">
            <label class="rw-label" for="rw-email">Email</label>
            <input type="email" id="rw-email" class="rw-input" placeholder="jean@exemple.fr" autocomplete="email" inputmode="email">
            <span class="rw-field-error" id="rw-email-error">Adresse email invalide.</span>
          </div>

          <div class="rw-error-msg" id="rw-submit-error"></div>
        </div>

        <!-- Succès -->
        <div id="rw-success-area" style="display:none">
          <div class="rw-success">
            <div class="rw-success-icon">✅</div>
            <p class="rw-success-title">Demande envoyée !</p>
            <p class="rw-success-text">Votre couvreur va vous contacter dans les meilleurs délais pour affiner votre devis.</p>
            <button class="rw-btn rw-btn-secondary" id="rw-restart-btn">Faire une nouvelle estimation</button>
          </div>
        </div>
      </div>

    </div>
    <!-- /rw-body -->

    <!-- Footer navigation -->
    <div class="rw-footer" id="rw-footer">
      <div class="rw-nav-btns">
        <button class="rw-btn-back" id="rw-btn-back" aria-label="Étape précédente" style="display:none">←</button>
        <button class="rw-btn-next" id="rw-btn-next">Continuer →</button>
      </div>
    </div>

  </div>
</div>`;

    const wrapper = document.createElement("div");
    wrapper.id = "rw-root";
    wrapper.innerHTML = tpl;
    document.body.appendChild(wrapper);
  }

  // -------------------------------------------------------
  // Trigger button
  // -------------------------------------------------------
  function buildTrigger() {
    const containers = document.querySelectorAll("[data-rw-trigger]");
    if (containers.length === 0) {
      // Injecter un bouton flottant par défaut
      const btn = document.createElement("button");
      btn.className = "rw-trigger-btn";
      btn.id = "rw-trigger-default";
      btn.innerHTML = `<span class="rw-trigger-icon">🏠</span> ${TRIGGER_TEXT}`;
      btn.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:99997;";
      btn.addEventListener("click", openWidget);
      document.body.appendChild(btn);
    } else {
      containers.forEach((c) => {
        const btn = document.createElement("button");
        btn.className = "rw-trigger-btn";
        btn.innerHTML = `<span class="rw-trigger-icon">🏠</span> ${c.dataset.rwText || TRIGGER_TEXT}`;
        btn.addEventListener("click", openWidget);
        c.appendChild(btn);
      });
    }
  }

  // -------------------------------------------------------
  // Widget open/close
  // -------------------------------------------------------
  function openWidget() {
    el("rw-overlay").classList.add("rw-open");
    document.body.style.overflow = "hidden";
  }

  function closeWidget() {
    el("rw-overlay").classList.remove("rw-open");
    document.body.style.overflow = "";
  }

  function resetWidget() {
    state.step = 0;
    state.estimate = null;
    state.form = {
      project: null, material: null, surface: 100,
      pans: null, accessibility: null, options: [], postalCode: "",
    };
    // Reset DOM
    qsa(".rw-card").forEach((c) => c.classList.remove("rw-selected"));
    el("rw-surface-slider").value = 100;
    el("rw-surface-val").textContent = "100";
    el("rw-postal").value = "";
    el("rw-name").value = "";
    el("rw-phone").value = "";
    el("rw-email").value = "";
    el("rw-result-area").innerHTML = "";
    el("rw-lead-form").style.display = "";
    el("rw-success-area").style.display = "none";
    goToStep(0);
  }

  // -------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------
  function goToStep(n) {
    qsa(".rw-step").forEach((s) => s.classList.remove("rw-active"));
    const target = el(`rw-step-${n}`);
    if (target) target.classList.add("rw-active");

    state.step = n;
    updateProgress();
    updateNav();
  }

  function updateProgress() {
    const pct = Math.round((state.step / (TOTAL_STEPS - 1)) * 100);
    el("rw-progress").style.width = pct + "%";
    el("rw-step-label").textContent = `Étape ${state.step + 1} sur ${TOTAL_STEPS}`;
    el("rw-step-pct").textContent = pct + " %";
  }

  function updateNav() {
    const back = el("rw-btn-back");
    const next = el("rw-btn-next");
    const footer = el("rw-footer");

    back.style.display = state.step > 0 ? "flex" : "none";

    if (state.step === TOTAL_STEPS - 1) {
      next.textContent = "Envoyer ma demande →";
    } else if (state.step === 5) {
      next.textContent = "Continuer (sans option) →";
    } else {
      next.textContent = "Continuer →";
    }

    // Cacher footer sur success
    const successVisible = el("rw-success-area").style.display !== "none";
    footer.style.display = successVisible ? "none" : "";
  }

  function canProceed() {
    switch (state.step) {
      case 0: return !!state.form.project;
      case 1: return !!state.form.material;
      case 2: return state.form.surface >= 20;
      case 3: return !!state.form.pans;
      case 4: return !!state.form.accessibility;
      case 5: return true; // options = optionnel
      case 6: return /^\d{5}$/.test(state.form.postalCode);
      case 7: return true;
      default: return false;
    }
  }

  // -------------------------------------------------------
  // Card interactions
  // -------------------------------------------------------
  function handleCardClick(card) {
    const stepIdx = parseInt(card.dataset.step, 10);
    const value = card.dataset.value;
    const isMulti = card.classList.contains("rw-multi");

    if (isMulti) {
      card.classList.toggle("rw-selected");
      const opts = state.form.options;
      const idx = opts.indexOf(value);
      if (idx === -1) opts.push(value);
      else opts.splice(idx, 1);
    } else {
      qsa(`.rw-card[data-step="${stepIdx}"]`).forEach((c) =>
        c.classList.remove("rw-selected")
      );
      card.classList.add("rw-selected");

      switch (stepIdx) {
        case 0: state.form.project = value; break;
        case 1: state.form.material = value; break;
        case 3: state.form.pans = value; break;
        case 4: state.form.accessibility = value; break;
      }

      // Auto-avance sur les étapes à sélection unique (sauf options)
      if (stepIdx !== 5) {
        setTimeout(() => handleNext(), 280);
      }
    }
  }

  // -------------------------------------------------------
  // Slider
  // -------------------------------------------------------
  function handleSliderInput(slider) {
    const val = parseInt(slider.value, 10);
    state.form.surface = val;
    el("rw-surface-val").textContent = val;
    // Mise à jour du fond dégradé du slider
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.setProperty("--slider-pct", pct + "%");
  }

  // -------------------------------------------------------
  // Calculation
  // -------------------------------------------------------
  async function runCalculation() {
    showLoading(true, "Calcul de votre estimation…");

    try {
      const result = await fetchCalculation({
        project: state.form.project,
        material: state.form.material,
        surface: state.form.surface,
        pans: state.form.pans,
        accessibility: state.form.accessibility,
        options: state.form.options,
        postalCode: state.form.postalCode,
      });

      state.estimate = result;
      renderResult(result);
    } catch (err) {
      renderError("Impossible de calculer l'estimation. Veuillez réessayer.");
      console.error("[RoofWidget] Calculation error:", err);
    } finally {
      showLoading(false);
    }
  }

  function renderResult(r) {
    const optionRows = (r.details.optionDetails || [])
      .map(
        (o) =>
          `<div class="rw-result-row">
            <span class="rw-result-row-label">${o.label}</span>
            <span class="rw-result-row-value">+${fmt(o.price)}</span>
          </div>`
      )
      .join("");

    el("rw-result-area").innerHTML = `
      <div class="rw-result-card">
        <p class="rw-result-label">Estimation de votre projet</p>
        <p class="rw-result-price">${fmt(r.estimateLow)} – ${fmt(r.estimateHigh)}</p>
        <p class="rw-result-delay">⏱ Durée estimée : ${r.delayLow} à ${r.delayHigh} jours</p>
      </div>
      <div class="rw-result-details">
        <div class="rw-result-row">
          <span class="rw-result-row-label">Type de projet</span>
          <span class="rw-result-row-value">${r.details.project}</span>
        </div>
        <div class="rw-result-row">
          <span class="rw-result-row-label">Matériau</span>
          <span class="rw-result-row-value">${r.details.material}</span>
        </div>
        <div class="rw-result-row">
          <span class="rw-result-row-label">Surface</span>
          <span class="rw-result-row-value">${r.details.surface} m²</span>
        </div>
        ${optionRows}
      </div>
    `;
  }

  function renderError(msg) {
    el("rw-result-area").innerHTML = `
      <div class="rw-error-msg rw-visible" style="display:block">${msg}</div>
    `;
  }

  // -------------------------------------------------------
  // Lead submission
  // -------------------------------------------------------
  function validateLeadForm() {
    let valid = true;

    const name = el("rw-name").value.trim();
    const phone = el("rw-phone").value.trim();
    const email = el("rw-email").value.trim();

    if (name.length < 2) {
      showFieldError("rw-name", "rw-name-error", true);
      valid = false;
    } else {
      showFieldError("rw-name", "rw-name-error", false);
    }

    if (!/^[\d\s\+\-\.]{8,20}$/.test(phone)) {
      showFieldError("rw-phone", "rw-phone-error", true);
      valid = false;
    } else {
      showFieldError("rw-phone", "rw-phone-error", false);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFieldError("rw-email", "rw-email-error", true);
      valid = false;
    } else {
      showFieldError("rw-email", "rw-email-error", false);
    }

    return valid;
  }

  function showFieldError(inputId, errorId, show) {
    el(inputId).classList.toggle("rw-error", show);
    el(errorId).classList.toggle("rw-visible", show);
  }

  async function handleLeadSubmit() {
    if (!validateLeadForm()) return;

    const btn = el("rw-btn-next");
    btn.disabled = true;
    btn.textContent = "Envoi en cours…";

    try {
      await submitLead({
        name: el("rw-name").value.trim(),
        phone: el("rw-phone").value.trim(),
        email: el("rw-email").value.trim(),
        postalCode: state.form.postalCode,
        estimate: state.estimate,
      });

      el("rw-lead-form").style.display = "none";
      el("rw-result-area").style.display = "none";
      el("rw-success-area").style.display = "block";
      updateNav();
    } catch (err) {
      const errEl = el("rw-submit-error");
      errEl.textContent = "Une erreur est survenue. Veuillez réessayer.";
      errEl.classList.add("rw-visible");
      btn.disabled = false;
      btn.textContent = "Envoyer ma demande →";
    }
  }

  // -------------------------------------------------------
  // Navigation Next / Back
  // -------------------------------------------------------
  async function handleNext() {
    if (state.step === TOTAL_STEPS - 1) {
      // Étape lead submit
      await handleLeadSubmit();
      return;
    }

    if (!canProceed()) {
      return; // bouton désactivé visuellement ou juste ignoré
    }

    // Étape 6 → 7 : lancer le calcul avant d'afficher la dernière étape
    if (state.step === 6) {
      const postal = el("rw-postal").value.trim();
      if (!/^\d{5}$/.test(postal)) {
        el("rw-postal").classList.add("rw-error");
        el("rw-postal-error").classList.add("rw-visible");
        return;
      }
      state.form.postalCode = postal;
      goToStep(7);
      await runCalculation();
      return;
    }

    goToStep(state.step + 1);
  }

  function handleBack() {
    if (state.step > 0) goToStep(state.step - 1);
  }

  // -------------------------------------------------------
  // Loading
  // -------------------------------------------------------
  function showLoading(show, text) {
    const loader = el("rw-loading");
    if (show) {
      loader.classList.add("rw-visible");
      el("rw-loading-text").textContent = text || "Chargement…";
    } else {
      loader.classList.remove("rw-visible");
    }
  }

  // -------------------------------------------------------
  // Init
  // -------------------------------------------------------
  async function init() {
    injectCSS();

    let branding = {};
    let services = {};

    try {
      showLoading(true, "Vérification de la licence…");
      const data = await fetchLicense();
      branding = data.branding || {};
      services = data.services || {};
      state.branding = branding;
      state.services = services;
    } catch (err) {
      console.error("[RoofWidget]", err.message);
      return; // Arrêt si licence invalide
    }

    buildHTML(branding, services);
    applyBranding(branding);
    buildTrigger();
    attachEvents();

    showLoading(false);
    goToStep(0);
  }

  // -------------------------------------------------------
  // Events
  // -------------------------------------------------------
  function attachEvents() {
    // Close
    el("rw-close").addEventListener("click", closeWidget);
    el("rw-overlay").addEventListener("click", function (e) {
      if (e.target === this) closeWidget();
    });

    // Keyboard
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeWidget();
    });

    // Cards
    document.addEventListener("click", function (e) {
      const card = e.target.closest(".rw-card");
      if (card && el("rw-overlay").classList.contains("rw-open")) {
        handleCardClick(card);
      }
    });

    // Slider
    el("rw-surface-slider").addEventListener("input", function () {
      handleSliderInput(this);
    });

    // Code postal — validation en temps réel
    el("rw-postal").addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").substring(0, 5);
      state.form.postalCode = this.value;
      if (/^\d{5}$/.test(this.value)) {
        this.classList.remove("rw-error");
        el("rw-postal-error").classList.remove("rw-visible");
      }
    });

    // Nav buttons
    el("rw-btn-next").addEventListener("click", handleNext);
    el("rw-btn-back").addEventListener("click", handleBack);

    // Restart
    document.addEventListener("click", function (e) {
      if (e.target && e.target.id === "rw-restart-btn") {
        resetWidget();
      }
    });
  }

  // -------------------------------------------------------
  // Boot
  // -------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
