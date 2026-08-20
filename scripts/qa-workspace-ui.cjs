const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

const outputDir = process.env.UI_QA_OUTPUT || "/tmp/cdsspace-ui-qa";
const baseUrl = process.env.UI_QA_BASE_URL || "http://127.0.0.1:3000";

fs.mkdirSync(outputDir, { recursive: true });

const adminSession = {
  authenticated: true,
  role: "super_admin",
  email: "admin@cdsspace.pro",
  name: "CDS Space Super Admin",
  permissions: ["all"],
  source: "admin_cookie",
};

const teamMember = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Ada Okon",
  email: "ada@cdsspace.pro",
  username: "ada",
  avatar_url: null,
  role_title: "Brand Designer",
  department: "Creative",
  is_sub_admin: true,
  permissions: ["all"],
  language: "en",
};

const taskboardPayload = {
  ok: true,
  portal: "team",
  viewer: {
    kind: "team",
    id: teamMember.id,
    name: teamMember.full_name,
    can_edit: true,
    can_manage: false,
    can_view_all_tasks: false,
  },
  boards: [{
    id: "22222222-2222-4222-8222-222222222222",
    title: "Creative Team",
    description: "Campaign priorities, production work and team reviews.",
    color: "#0A4FE8",
    created_by_kind: "admin",
    created_by_id: "system",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }],
  board: {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Creative Team",
    description: "Campaign priorities, production work and team reviews.",
    color: "#0A4FE8",
    created_by_kind: "admin",
    created_by_id: "system",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  lists: [],
  members: [{ ...teamMember, board_role: "editor", departments: ["Creative"] }],
  available_members: [{ ...teamMember, board_role: "editor", departments: ["Creative"] }],
  document_options: [],
  activity: [],
};

function jsonResponse(body) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

async function mockPage(page) {
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (url.origin !== baseUrl) {
      await request.abort();
      return;
    }
    if (url.pathname === "/api/admin-check") {
      await request.respond(jsonResponse(adminSession));
      return;
    }
    if (url.pathname === "/api/admin/dashboard-actions") {
      await request.respond(jsonResponse({
        ok: true,
        counts: { applications: 6, briefs: 6, team_chat: 2, consultations: 3 },
      }));
      return;
    }
    if (url.pathname === "/api/traffic-summary") {
      await request.respond(jsonResponse({
        total: 1284,
        countries: [{ name: "Nigeria", count: 1120 }, { name: "Ghana", count: 164 }],
        last7days: [{ date: "2026-07-28", count: 184 }],
      }));
      return;
    }
    if (url.pathname === "/api/notifications" || url.pathname === "/api/team/notifications") {
      await request.respond(jsonResponse({ notifications: [] }));
      return;
    }
    if (url.pathname === "/api/admin/finance/expenditures") {
      await request.respond(jsonResponse({ expenditures: [] }));
      return;
    }
    if (url.pathname === "/api/admin/activity") {
      await request.respond(jsonResponse({ activities: [] }));
      return;
    }
    if (url.pathname === "/api/team/session") {
      await request.respond(jsonResponse({ ok: true, member: teamMember }));
      return;
    }
    if (url.pathname === "/api/team/overview") {
      await request.respond(jsonResponse({
        ok: true,
        data: {
          member: teamMember,
          stats: { assigned_work: 7, unread_messages: 2, upcoming_meetings: 1 },
          recent_work: [],
          upcoming_meetings: [],
          resume_completion: 72,
        },
      }));
      return;
    }
    if (url.pathname === "/api/taskboard") {
      await request.respond(jsonResponse(taskboardPayload));
      return;
    }
    await request.continue();
  });
}

async function capture(browser, name, route, viewport, afterLoad) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await mockPage(page);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-app-shell]", { timeout: 15000 });
  if (afterLoad) await afterLoad(page);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: !name.includes("modal") && !name.includes("dialog"),
  });
  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector('[data-slot="dialog-content"]');
    const rect = dialog?.getBoundingClientRect();
    const style = dialog ? window.getComputedStyle(dialog) : null;
    return {
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      dialogs: document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"]').length,
      dialogRect: rect ? {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      } : null,
      dialogPosition: style ? {
        left: style.left,
        top: style.top,
        right: style.right,
        bottom: style.bottom,
        transform: style.transform,
        translate: style.translate,
      } : null,
    };
  });
  await page.close();
  return { name, ...metrics };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.UI_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const results = [];
  try {
    results.push(await capture(browser, "admin-dashboard-desktop", "/admin", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
    }));
    results.push(await capture(browser, "admin-dashboard-mobile", "/admin", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    }));
    results.push(await capture(browser, "team-overview-mobile", "/team", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    }));
    results.push(await capture(browser, "taskboard-mobile-empty", "/team/taskboard", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    }));
    results.push(await capture(browser, "taskboard-mobile-modal", "/team/taskboard", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    }, async (page) => {
      await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll("button"))
          .find((node) => node.textContent?.trim() === "New board");
        if (!(button instanceof HTMLButtonElement)) throw new Error("New board button not found.");
        button.click();
      });
      await page.waitForSelector('input[placeholder="e.g. Marketing team"]', { timeout: 10000 });
    }));
    results.push(await capture(browser, "shared-dialog-mobile", "/admin/finance/expenditures", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    }, async (page) => {
      await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll("button"))
          .find((node) => node.textContent?.trim() === "New Expenditure");
        if (!(button instanceof HTMLButtonElement)) throw new Error("New Expenditure button not found.");
        button.click();
      });
      await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 10000 });
    }));
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ outputDir, results }, null, 2));
})();
