/**
 * JAWOM WORKFORCE DATABASE - Google Apps Script backend (v3, with admin access)
 *
 * WHAT THIS DOES
 *  - Saves form submissions from index.html into the "Workforce" tab.
 *  - Lets the admin page (admin.html) sign in and read the entries.
 *
 * SETUP
 * 1. Open your Sheet > Extensions > Apps Script. Replace ALL the code with this file. Save.
 * 2. SET THE ADMIN PASSWORD (do not type it in this code):
 *      Apps Script left menu > Project Settings (gear icon) > Script properties
 *      > Add script property
 *         Property: ADMIN_PASSWORD
 *         Value:    (a strong password of your choice)
 *      > Save script properties.
 * 3. Deploy > Manage deployments > pencil > Version: New version > Deploy.
 *    (The /exec link stays the same.)
 *
 * To change the admin password later, edit the ADMIN_PASSWORD script property.
 * You do not need to redeploy.
 */

const SHEET_NAME = "Workforce";
const TIME_ZONE = "Africa/Lagos";

const HEADERS = [
  "Timestamp",
  "Title",
  "First Name",
  "Surname",
  "Contact Address",
  "Email",
  "Phone Number",
  "WhatsApp Number",
  "Church Centre",
  "Prayer Day",
  "Present Unit",
  "Alternative Unit",
  "Name of Present Unit Head"
];

// Admin sign-in settings
const SESSION_SECONDS = 6 * 60 * 60; // stay signed in for 6 hours (the maximum the cache allows)
const MAX_FAILS = 8;                 // wrong passwords allowed...
const LOCK_SECONDS = 300;            // ...before sign-in is paused for 5 minutes

/** Run once to create the sheet and header row. */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight("bold")
    .setBackground("#007a43")
    .setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, HEADERS.length, 160);

  // Keep phone numbers as text so leading zeros (0801...) are not dropped
  sheet.getRange("G:H").setNumberFormat("@");
}

/** Every request from the website arrives here. */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ success: false, message: "Bad request." });
  }

  if (data.action === "adminLogin") return adminLogin(data);
  if (data.action === "adminList") return adminList(data);
  if (data.action === "adminLogout") return adminLogout(data);

  return handleSubmission(data); // normal form submission
}

/** Lets you open the Web App URL in a browser to confirm it is live. */
function doGet() {
  return json({ success: true, message: "JAWOM WORKFORCE DATABASE endpoint is live." });
}

/* ==========================================================
   FORM SUBMISSION
   ========================================================== */

function handleSubmission(data) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000); // stops rows overwriting each other when many people submit at once

    // Spam trap: real people never fill this hidden field
    if (data.website) return json({ success: true });

    // ---- Required fields ----
    const required = {
      title: "Title",
      firstName: "First Name",
      surname: "Surname",
      contactAddress: "Contact Address",
      phoneNumber: "Phone Number",
      churchCentre: "Church Centre",
      prayerDay: "Prayer Day",
      presentUnit: "Present Unit",
      alternativeUnit: "Alternative Unit"
    };
    for (const key in required) {
      if (data[key] === undefined || data[key] === null || !String(data[key]).trim()) {
        return json({ success: false, message: required[key] + " is required." });
      }
    }

    // Unit head is required unless the person has no unit
    const noUnit = String(data.presentUnit).trim() === "No unit";
    if (!noUnit && !String(data.unitHead || "").trim()) {
      return json({ success: false, message: "Name of Present Unit Head is required." });
    }

    // ---- Format checks ----
    // (Titles are controlled in index.html only, so they can be changed there freely.)
    if (!/^\d{11}$/.test(String(data.phoneNumber).trim())) {
      return json({ success: false, message: "Phone Number must be 11 digits." });
    }
    const wa = String(data.whatsappNumber || "").trim();
    if (wa && !/^\d{11}$/.test(wa)) {
      return json({ success: false, message: "WhatsApp Number must be 11 digits." });
    }
    const day = Number(data.prayerDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return json({ success: false, message: "Prayer Day must be from 1 to 31." });
    }
    const email = String(data.email || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, message: "Email is not valid." });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      setupSheet();                       // creates the Workforce tab and headers automatically
      sheet = ss.getSheetByName(SHEET_NAME);
    }

    sheet.appendRow([
      new Date(),
      clean(data.title),
      clean(data.firstName),
      clean(data.surname),
      clean(data.contactAddress),
      clean(email),
      String(data.phoneNumber).trim(),   // columns G:H are plain text, so 0801... keeps its zero
      wa,
      clean(data.churchCentre),
      day,
      clean(data.presentUnit),
      clean(data.alternativeUnit),
      clean(data.unitHead)
    ]);

    return json({ success: true });
  } catch (err) {
    return json({ success: false, message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================
   ADMIN ACCESS
   ========================================================== */

/** Checks the password and hands back a temporary session token. */
function adminLogin(data) {
  const cache = CacheService.getScriptCache();
  const stored = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");

  if (!stored) {
    return json({
      success: false,
      message: "The admin password has not been set. Add ADMIN_PASSWORD in Project Settings > Script properties."
    });
  }

  const fails = Number(cache.get("login_fails") || 0);
  if (fails >= MAX_FAILS) {
    return json({ success: false, message: "Too many wrong attempts. Try again in 5 minutes." });
  }

  if (String(data.password || "") !== stored) {
    cache.put("login_fails", String(fails + 1), LOCK_SECONDS);
    return json({ success: false, message: "Wrong password." });
  }

  cache.remove("login_fails");
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put("admin_" + token, "1", SESSION_SECONDS);
  return json({ success: true, token: token });
}

/** Returns all entries (newest first) to a signed-in admin. */
function adminList(data) {
  if (!validToken(data.token)) return json({ success: false, message: "SESSION_EXPIRED" });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return json({ success: true, headers: HEADERS, rows: [] });
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();

  const rows = values.map(function (r) {
    return r.map(function (cell, i) {
      if (i === 0 && cell instanceof Date) {
        return Utilities.formatDate(cell, TIME_ZONE, "dd MMM yyyy, HH:mm");
      }
      return cell === null || cell === undefined ? "" : String(cell);
    });
  });

  rows.reverse(); // newest first
  return json({ success: true, headers: HEADERS, rows: rows });
}

function adminLogout(data) {
  if (data.token) CacheService.getScriptCache().remove("admin_" + data.token);
  return json({ success: true });
}

function validToken(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get("admin_" + token) === "1";
}

/* ---------- helpers ---------- */

function clean(value) {
  let v = String(value == null ? "" : value).trim();
  // Stop spreadsheet formula injection (=, +, -, @ at the start of text)
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  return v;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
