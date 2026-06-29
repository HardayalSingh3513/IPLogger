// Shared script for dashboard and homepage interactions.
const targetsBody = document.getElementById("targetsBody");
const logsBody = document.getElementById("logsBody");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const clearBtn = document.getElementById("clearBtn");
const createdLinkInput = document.getElementById("createdLink");
const copyBtn = document.getElementById("copyBtn");

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

async function loadTargets() {
  if (!targetsBody) return;

  try {
    const res = await fetch("/api/targets");
    const targets = await res.json();

    targetsBody.innerHTML = "";

    if (targets.length === 0) {
      targetsBody.innerHTML = `<tr><td colspan="5">No tracking links created yet.</td></tr>`;
    } else {
      targets.forEach((target) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${target.id}</td>
          <td><a href="/s/${target.slug}" target="_blank">/s/${target.slug}</a></td>
          <td><a href="${target.target_url}" target="_blank">${target.target_url}</a></td>
          <td>${target.created_at}</td>
          <td>${target.visit_count}</td>
        `;
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
      logsBody.innerHTML = `<tr><td colspan="10">No visits logged yet.</td></tr>`;
    } else {
      logs.forEach((log) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${log.id}</td>
          <td><a href="/s/${log.slug}" target="_blank">/s/${log.slug}</a></td>
          <td><a href="${log.target_url}" target="_blank">${log.target_url}</a></td>
          <td>${log.ip_address || "Unknown"}</td>
          <td>${log.country || "Unknown"}</td>
          <td>${log.region || "Unknown"}</td>
          <td>${log.city || "Unknown"}</td>
          <td>${log.isp || "Unknown"}</td>
          <td>${log.visited_at}</td>
          <td class="ua">${log.user_agent}</td>
        `;
        logsBody.appendChild(row);
      });
    }

    statusEl.textContent = `Last updated: ${new Date().toLocaleTimeString()} • ${logs.length} record(s)`;
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
