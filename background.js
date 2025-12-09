// ===============================
// n8n Capture Extension
// background.js (service worker)
// ===============================

// IDs for context menu items
const ROOT_MENU_ID = "opal_pain_root";
const GENERIC_MENU_ID = "opal_pain_generic";
const CAMPAIGN_PREFIX = "opal_pain_campaign_";

// Rebuild context menus based on current campaigns
function rebuildContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // Parent "root" item (clicking this will act like generic)
    chrome.contextMenus.create({
      id: ROOT_MENU_ID,
      title: "Send to n8n",
      contexts: ["selection"]
    });

    // Generic child
    chrome.contextMenus.create({
      id: GENERIC_MENU_ID,
      parentId: ROOT_MENU_ID,
      title: "Generic (no campaign)",
      contexts: ["selection"]
    });

    // Load campaigns from storage and create one submenu item per campaign
    chrome.storage.sync.get(["campaigns"], (data) => {
      const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
      campaigns.forEach((c) => {
        if (!c || !c.id) return;
        chrome.contextMenus.create({
          id: CAMPAIGN_PREFIX + c.id,
          parentId: ROOT_MENU_ID,
          title: c.label || c.id,
          contexts: ["selection"]
        });
      });
    });
  });
}

// On install / update, create context menu
chrome.runtime.onInstalled.addListener(() => {
  rebuildContextMenus();
});

// On browser startup, rebuild menus (service worker can be killed/restarted)
chrome.runtime.onStartup.addListener(() => {
  rebuildContextMenus();
});

// When campaigns change in options, rebuild menus
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.campaigns) {
    rebuildContextMenus();
  }
});

// Right-click context menu handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Only care about our menu family
  if (
    info.menuItemId !== ROOT_MENU_ID &&
    info.menuItemId !== GENERIC_MENU_ID &&
    !String(info.menuItemId).startsWith(CAMPAIGN_PREFIX)
  ) {
    return;
  }

  const selectedText = info.selectionText || "";
  const pageUrl = info.pageUrl || (tab && tab.url) || "";
  const pageTitle = (tab && tab.title) || "";
  const source = guessSourceFromUrl(pageUrl);

  if (!selectedText.trim()) {
    showNotification("n8n Capture", "No text selected.");
    return;
  }

  let campaign = "unspecified";

  if (info.menuItemId === GENERIC_MENU_ID || info.menuItemId === ROOT_MENU_ID) {
    campaign = "unspecified";
  } else if (String(info.menuItemId).startsWith(CAMPAIGN_PREFIX)) {
    // Extract campaign id from menu item id
    campaign = String(info.menuItemId).substring(CAMPAIGN_PREFIX.length) || "unspecified";
  }

  const domain = getDomainFromUrl(pageUrl);
  const payload = {
    source,
    url: pageUrl,
    page_title: pageTitle,
    selected_text: selectedText,
    campaign,
    created_at: new Date().toISOString()
  };

  sendToN8nAndTrack(payload, domain, campaign, tab && tab.id);
});

// Messages from content script (HUD)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "sendSelection") {
    const { selection, url, title, source, campaign } = message;
    if (!selection || !selection.trim()) {
      sendResponse({ ok: false, error: "EMPTY_SELECTION" });
      return;
    }

    const domain = getDomainFromUrl(url);
    const payload = {
      source: source || guessSourceFromUrl(url),
      url,
      page_title: title || "",
      selected_text: selection,
      campaign: campaign || "unspecified",
      created_at: new Date().toISOString()
    };

    sendToN8nAndTrack(
      payload,
      domain,
      campaign,
      sender.tab && sender.tab.id,
      sendResponse
    );
    return true; // async response
  }

  if (message.type === "getStats") {
    const domain = getDomainFromUrl(message.url);
    getStatsForToday(domain).then((stats) => {
      sendResponse({ ok: true, stats, domain });
    });
    return true;
  }

  return false;
});

// ========== n8n & stats helpers ==========

// Core send function used by context menu + HUD
function sendToN8nAndTrack(payload, domain, campaign, tabId, sendResponse) {
  // Load n8n config from extension storage
  chrome.storage.sync.get(
    ["n8nWebhookUrl", "n8nAuthType", "n8nAuthToken", "n8nCustomHeaderName"],
    (config) => {
      const webhookUrl = config.n8nWebhookUrl;
      if (!webhookUrl) {
        showNotification(
          "n8n Capture",
          "No n8n webhook URL configured. Open extension options to set it."
        );
        if (sendResponse) {
          sendResponse({ ok: false, error: "NO_WEBHOOK" });
        }
        return;
      }

      const headers = { "Content-Type": "application/json" };

      // ==========================
      // n8n AUTH CONFIG (if used)
      // ==========================
      // Types:
      // - "none"
      // - "bearer"
      // - "custom_header"
      if (config.n8nAuthType === "bearer" && config.n8nAuthToken) {
        headers["Authorization"] = "Bearer " + config.n8nAuthToken;
      } else if (
        config.n8nAuthType === "custom_header" &&
        config.n8nCustomHeaderName &&
        config.n8nAuthToken
      ) {
        headers[config.n8nCustomHeaderName] = config.n8nAuthToken;
      }

      fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      })
        .then(async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(
              "HTTP " + res.status + " " + res.statusText + " - " + text
            );
          }
          // Update stats now that send succeeded
          incrementStats(domain, campaign).then((updatedDomStats) => {
            if (tabId) {
              chrome.tabs.sendMessage(tabId, {
                type: "statsUpdated",
                domain,
                stats: updatedDomStats
              });
            }
            if (sendResponse) {
              sendResponse({ ok: true, stats: updatedDomStats });
            } else {
              showNotification(
                "n8n Capture",
                "Selection sent to n8n successfully."
              );
            }
          });
        })
        .catch((err) => {
          console.error("Failed to send to n8n:", err);
          showNotification(
            "n8n Capture",
            "Error sending to n8n. Check console and options."
          );
          if (sendResponse) {
            sendResponse({ ok: false, error: "NETWORK_ERROR" });
          }
        });
    }
  );
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function incrementStats(domain, campaign) {
  const todayKey = getTodayKey();
  return new Promise((resolve) => {
    chrome.storage.local.get(["stats"], (data) => {
      const stats = data.stats || {};
      const dayStats = stats[todayKey] || {};
      const domStats = dayStats[domain] || {
        total: 0,
        byCampaign: {}
      };
      domStats.total += 1;
      if (campaign) {
        domStats.byCampaign[campaign] =
          (domStats.byCampaign[campaign] || 0) + 1;
      }
      dayStats[domain] = domStats;
      stats[todayKey] = dayStats;
      chrome.storage.local.set({ stats }, () => {
        resolve(domStats);
      });
    });
  });
}

function getStatsForToday(domain) {
  const todayKey = getTodayKey();
  return new Promise((resolve) => {
    chrome.storage.local.get(["stats"], (data) => {
      const stats = data.stats || {};
      const dayStats = stats[todayKey] || {};
      const domStats =
        dayStats[domain] || {
          total: 0,
          byCampaign: {}
        };
      resolve(domStats);
    });
  });
}

function guessSourceFromUrl(url) {
  if (!url) return "web";
  const lower = url.toLowerCase();
  if (lower.includes("reddit.com")) return "reddit";
  if (lower.includes("facebook.com")) return "facebook";
  if (lower.includes("mastodon")) return "mastodon";
  if (lower.includes("x.com") || lower.includes("twitter.com")) return "twitter";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("linkedin.com")) return "linkedin";
  return "web";
}

function getDomainFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return "unknown";
  }
}

// Small helper: show a basic notification
function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message
  });
}
