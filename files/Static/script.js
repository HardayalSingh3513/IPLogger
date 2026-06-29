// Shared script for dashboard, homepage, and visitor consent interactions.
const targetsBody = document.getElementById("targetsBody");
const logsBody = document.getElementById("logsBody");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const clearBtn = document.getElementById("clearBtn");
const createdLinkInput = document.getElementById("createdLink");
const copyBtn = document.getElementById("copyBtn");
const locationPage = document.querySelector("[data-location-page]");
const locationStatus = document.getElementById("locationStatus");
const shareLocationBtn = document.getElementById("shareLocationBtn");
const skipLocationBtn = document.getElementById("skipLocationBtn");

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function setButtonLoading(isLoading) {
  if (shareLocationBtn) shareLocationBtn.disabled = isLoading;
  if (skipLocationBtn) skipLocationBtn.disabled = isLoading;
}

function goToTarget() {
  if (locationPage?.dataset.targetUrl) {
    window.location.href = locationPage.dataset.targetUrl;
  }
}

async function saveLocation(payload) {
  if (!locationPage?.dataset.logId) return;

  await fetch(`/api/location/${locationPage.dataset.logId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function continueWithoutLocation(permission = "denied") {
  setButtonLoading(true);
  if (locationStatus) locationStatus.textContent = "Continuing...";

  try {
    await saveLocation({ permission });
  } catch (err) {
    console.error(err);
  } finally {
    goToTarget();
  }
}

async function requestBrowserLocation() {
  if (!navigator.geolocation) {
    await continueWithoutLocation("unavailable");
    return;
  }

  setButtonLoading(true);
  if (locationStatus) locationStatus.textContent = "Waiting for browser permission...";

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      if (locationStatus) locationStatus.textContent = "Location saved. Continuing...";

      try {
        await saveLocation({
          permission: "granted",
          latitude,
          longitude,
          accuracy,
        });
      } catch (err) {
        console.error(err);
      } finally {
        goToTarget();
      }
    },
    async () => {
      await continueWithoutLocation("denied");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}

function makeCell(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function makeLinkCell(text, href) {
  const cell = document.createElement("td");
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = text;
  cell.appendChild(link);
  return cell;
}

function getBrowserLocationText(log) {
  if (log.location_permission === "granted" && log.latitude !== null && log.longitude !== null) {
    const accuracy = log.accuracy ? ` +/- ${Math.round(log.accuracy)}m` : "";
    return `${Number(log.latitude).toFixed(6)}, ${Number(log.longitude).toFixed(6)}${accuracy}`;
  }

  if (log.location_permission === "pending") return "Not answered yet";
  if (log.location_permission === "denied") return "Declined";
  if (log.location_permission === "unavailable") return "Unavailable";
  if (log.location_permission === "error") return "Error";
  return "Not requested";
}

if (copyBtn && createdLinkInput) {
  copyBtn.addEventListener("click", async () => {
    try {
      await copyToClipboard(createdLinkInput.value);
      copyBtn.textContent = "Copied";
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1500);
    } catch (err) {
      console.error(err);
      copyBtn.textContent = "Failed";
    }
  });
}

if (shareLocationBtn) {
  shareLocationBtn.addEventListener("click", requestBrowserLocation);
}

if (skipLocationBtn) {
  skipLocationBtn.addEventListener("click", () => continueWithoutLocation("denied"));
}

async function loadTargets() {
  if (!targetsBody) return;

  try {
    const res = await fetch("/api/targets");
    const targets = await res.json();

    targetsBody.innerHTML = "";

    if (targets.length === 0) {
      const row = document.createElement("tr");
      const cell = makeCell("No redirect links created yet.");
      cell.colSpan = 5;
      row.appendChild(cell);
      targetsBody.appendChild(row);
    } else {
      targets.forEach((target) => {
        const row = document.createElement("tr");
        row.appendChild(makeCell(target.id));
        row.appendChild(makeLinkCell(`/s/${target.slug}`, `/s/${target.slug}`));
        row.appendChild(makeLinkCell(target.target_url, target.target_url));
        row.appendChild(makeCell(target.created_at));
        row.appendChild(makeCell(target.visit_count));
        targetsBody.appendChild(row);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadLogs() {
  if (!logsBody) return;

  statusEl.textContent = "Loading logs...";
  try {
    const res = await fetch("/api/logs");
    const logs = await res.json();

    logsBody.innerHTML = "";

    if (logs.length === 0) {
      const row = document.createElement("tr");
      const cell = makeCell("No visits logged yet.");
      cell.colSpan = 11;
      row.appendChild(cell);
      logsBody.appendChild(row);
    } else {
      logs.forEach((log) => {
        const row = document.createElement("tr");
        row.appendChild(makeCell(log.id));
        row.appendChild(makeLinkCell(`/s/${log.slug}`, `/s/${log.slug}`));
        row.appendChild(makeLinkCell(log.target_url, log.target_url));
        row.appendChild(makeCell(log.ip_address || "Unknown"));
        row.appendChild(makeCell(log.country || "Unknown"));
        row.appendChild(makeCell(log.region || "Unknown"));
        row.appendChild(makeCell(log.city || "Unknown"));
        row.appendChild(makeCell(getBrowserLocationText(log)));
        row.appendChild(makeCell(log.isp || "Unknown"));
        row.appendChild(makeCell(log.visited_at));
        row.appendChild(makeCell(log.user_agent || "Unknown", "ua"));
        logsBody.appendChild(row);
      });
    }

    statusEl.textContent = `Last updated: ${new Date().toLocaleTimeString()} - ${logs.length} record(s)`;
  } catch (err) {
    statusEl.textContent = "Failed to load logs.";
    console.error(err);
  }
}

async function loadAll() {
  await Promise.all([loadTargets(), loadLogs()]);
}

async function clearLogs() {
  if (!confirm("Clear all logged visits? This cannot be undone.")) return;

  try {
    await fetch("/api/logs/clear", { method: "POST" });
    await loadLogs();
    await loadTargets();
  } catch (err) {
    statusEl.textContent = "Failed to clear logs.";
    console.error(err);
  }
}

if (refreshBtn) refreshBtn.addEventListener("click", loadAll);
if (clearBtn) clearBtn.addEventListener("click", clearLogs);

document.addEventListener("DOMContentLoaded", () => {
  loadAll();
  const newLinkBox = document.getElementById("newLinkBox");
  if (newLinkBox) {
    newLinkBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
