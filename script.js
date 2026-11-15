/* ==========================================================
   JAWOM Workforce form (v2)
   1. Deploy Code.gs as a Web App (see instructions inside it)
   2. Paste the Web App URL below
   ========================================================== */
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzFusRSzLl8H16vVtsPUbILiYZwCbuxhi7lpwCJQcAqAvhvvUlt8EdJpJZZ42TXHuKThg/exec";
// Keep the rolling logo on screen at least this long so people see it
const MIN_LOADER_MS = 2500;

const UNITS =  [
  "Music and Choir Unit",
  "Multi-Media and Technical Unit",
  "Ushering Unit",
  "Protocol ",
  "Prayer and Intercessory Unit",
  "Evangelism and Outreach Unit",
  "Sanctuary and Maintenance (Sanitation) Unit",
  "Children Departments",
  "Counselling and Follow-up Unit",
  "Traffic  Unit",
  "Drama and Creative Arts Unit"
];

const OTHERS = "Others";
const NO_UNIT = "No unit";
const NONE = "None";

const form = document.getElementById("workforceForm");
const submitBtn = document.getElementById("submitBtn");
const formError = document.getElementById("formError");
const loadingOverlay = document.getElementById("loadingOverlay");
const successOverlay = document.getElementById("successOverlay");
const againBtn = document.getElementById("againBtn");
const unitHeadStar = document.getElementById("unitHeadStar");

const presentUnit = form.elements.presentUnit;
const alternativeUnit = form.elements.alternativeUnit;
const presentUnitOther = form.elements.presentUnitOther;
const alternativeUnitOther = form.elements.alternativeUnitOther;

/* ---------- Build the unit dropdowns ---------- */
function fillUnitSelect(select, extraLast) {
  select.innerHTML = "";
  const add = (value, label) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    select.appendChild(o);
  };
  add("", "Select a unit");
  UNITS.forEach((u) => add(u, u));
  add(OTHERS, "Others (type the unit name)");
  add(extraLast, extraLast);
}
fillUnitSelect(presentUnit, NO_UNIT);
fillUnitSelect(alternativeUnit, NONE);

/* Show the "type your unit" box when Others is picked */
function toggleOther(select, otherInput) {
  const show = select.value === OTHERS;
  otherInput.hidden = !show;
  if (!show) otherInput.value = "";
  else otherInput.focus();
}

presentUnit.addEventListener("change", () => {
  toggleOther(presentUnit, presentUnitOther);
  // Someone with no unit has no unit head to name
  const noUnit = presentUnit.value === NO_UNIT;
  unitHeadStar.hidden = noUnit;
  if (noUnit) setError("unitHead", "");
});
alternativeUnit.addEventListener("change", () => toggleOther(alternativeUnit, alternativeUnitOther));

/* ---------- Logo fallback (if logo.png is missing) ---------- */
document.querySelectorAll("[data-logo]").forEach((img) => {
  img.addEventListener("error", () => {
    const fallback = document.createElement("span");
    fallback.className = "logo-missing " + img.className;
    fallback.textContent = "J";
    img.replaceWith(fallback);
  });
});

/* ---------- Numbers only on phone, WhatsApp and prayer day ---------- */
["phoneNumber", "whatsappNumber", "prayerDay"].forEach((name) => {
  form.elements[name].addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });
});

/* ---------- Validation ---------- */
function setError(name, message) {
  const input = form.elements[name];
  const slot = form.querySelector(`[data-error-for="${name}"]`);
  if (input) input.classList.toggle("invalid", Boolean(message));
  if (slot) slot.textContent = message || "";
}

const val = (name) => form.elements[name].value.trim();

function validate() {
  let ok = true;
  const fail = (name, msg) => { setError(name, msg); ok = false; };
  const clear = (name) => setError(name, "");

  if (!val("title")) fail("title", "Select your title."); else clear("title");
  if (!val("firstName")) fail("firstName", "Enter your first name."); else clear("firstName");
  if (!val("surname")) fail("surname", "Enter your surname."); else clear("surname");
  if (!val("contactAddress")) fail("contactAddress", "Enter where you live."); else clear("contactAddress");
  if (!val("churchCentre")) fail("churchCentre", "Enter your church centre."); else clear("churchCentre");

  // Email is optional, but if typed it must be valid
  const email = val("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("email", "Enter a valid email address, like name@example.com.");
  } else clear("email");

  // Phone: required, exactly 11 digits
  if (!val("phoneNumber")) fail("phoneNumber", "Enter your phone number.");
  else if (!/^\d{11}$/.test(val("phoneNumber"))) fail("phoneNumber", "Phone number must be exactly 11 digits.");
  else clear("phoneNumber");

  // WhatsApp: optional, but if typed it must be 11 digits
  if (val("whatsappNumber") && !/^\d{11}$/.test(val("whatsappNumber"))) {
    fail("whatsappNumber", "WhatsApp number must be exactly 11 digits.");
  } else clear("whatsappNumber");

  // Prayer day: 1 to 31
  const day = Number(val("prayerDay"));
  if (!val("prayerDay")) fail("prayerDay", "Enter your prayer day.");
  else if (!Number.isInteger(day) || day < 1 || day > 31) fail("prayerDay", "Prayer day must be a number from 1 to 31.");
  else clear("prayerDay");

  // Present unit
  if (!presentUnit.value) fail("presentUnit", "Select your present unit.");
  else if (presentUnit.value === OTHERS && !presentUnitOther.value.trim()) fail("presentUnit", "Type the name of your unit.");
  else clear("presentUnit");

  // Alternative unit (mandatory)
  if (!alternativeUnit.value) fail("alternativeUnit", "Select an alternative unit, or choose None.");
  else if (alternativeUnit.value === OTHERS && !alternativeUnitOther.value.trim()) fail("alternativeUnit", "Type the name of your unit.");
  else clear("alternativeUnit");

  // Present and alternative unit should not be the same
  if (presentUnit.value && presentUnit.value === alternativeUnit.value &&
      ![OTHERS, NO_UNIT, NONE].includes(presentUnit.value)) {
    fail("alternativeUnit", "Your alternative unit must be different from your present unit.");
  }

  // Unit head: required unless the person has no unit
  if (presentUnit.value !== NO_UNIT && !val("unitHead")) {
    fail("unitHead", "Enter the name of your present unit head.");
  } else clear("unitHead");

  return ok;
}

// Clear an error as soon as the person fixes the field
form.addEventListener("input", (e) => {
  if (e.target.name) setError(e.target.name, "");
  formError.hidden = true;
});
form.addEventListener("change", (e) => {
  if (e.target.name) setError(e.target.name, "");
  // unit pair error can sit on the alternative unit when the present unit changes
  if (e.target === presentUnit) setError("alternativeUnit", "");
});

form.addEventListener("reset", () => {
  form.querySelectorAll("[data-error-for]").forEach((el) => {
    setError(el.dataset.errorFor, "");
  });
  presentUnitOther.hidden = true;
  alternativeUnitOther.hidden = true;
  unitHeadStar.hidden = false;
  formError.hidden = true;
});

/* ---------- Submit ---------- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function unitValue(select, otherInput) {
  return select.value === OTHERS ? `Others: ${otherInput.value.trim()}` : select.value;
}

function buildPayload() {
  return {
    website: form.elements.website.value,            // honeypot
    title: val("title"),
    firstName: val("firstName"),
    surname: val("surname"),
    contactAddress: val("contactAddress"),
    email: val("email"),
    phoneNumber: val("phoneNumber"),
    whatsappNumber: val("whatsappNumber"),
    churchCentre: val("churchCentre"),
    prayerDay: Number(val("prayerDay")),
    presentUnit: unitValue(presentUnit, presentUnitOther),
    alternativeUnit: unitValue(alternativeUnit, alternativeUnitOther),
    unitHead: val("unitHead")
  };
}

async function sendToSheet(payload) {
  // text/plain keeps this a "simple" request, so no CORS preflight is needed
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("NOT_JSON"); }
  if (!data.success) throw new Error(data.message || "Submission failed.");
  return data;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  if (!validate()) {
    const firstBad = form.querySelector(".invalid");
    if (firstBad) firstBad.focus();
    return;
  }

  // Only a real Apps Script Web App link (ending in /exec) is accepted
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(APPS_SCRIPT_URL)) {
    formError.textContent = "The form isn't connected yet. Add your Apps Script Web App URL in script.js.";
    formError.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  loadingOverlay.hidden = false;

  try {
    // Wait for the save AND the minimum loader time
    await Promise.all([sendToSheet(buildPayload()), wait(MIN_LOADER_MS)]);

    loadingOverlay.hidden = true;
    successOverlay.hidden = false;
    againBtn.focus();
    form.reset();
  } catch (err) {
    loadingOverlay.hidden = true;
    formError.textContent =
      err.message === "NOT_JSON"
        ? "The database link is not public or the URL is wrong. Check the Apps Script deployment settings."
        : err.message === "Failed to fetch"
        ? "Could not reach the database. Check your internet connection and try again."
        : err.message;
    formError.hidden = false;
    console.error(err);
  } finally {
    submitBtn.disabled = false;
  }
});

againBtn.addEventListener("click", () => {
  successOverlay.hidden = true;
  window.scrollTo({ top: 0 });
  form.elements.title.focus();
});
