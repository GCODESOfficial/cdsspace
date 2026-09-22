import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const sidebar = read("src/components/layout/Sidebar.tsx");
const page = read("src/app/(dashboard)/subscription/page.tsx");
const catalog = read("src/components/subscription/SubscriptionPlanCatalog.tsx");
const checkout = read("src/app/api/subscription/checkout/route.ts");
const plans = read("src/lib/subscription-plans.ts");
const adminApi = read("src/app/api/admin/pricing/route.ts");
const migration = read("glashdb/migrations/20260818_client_subscription_checkout.sql");

assert.match(sidebar, /\/dashboard\/subscription/, "Client navigation must include Subscription.");
assert.match(page, /SubscriptionPlanCatalog/, "The client subscription route must render the plan catalog.");
assert.match(catalog, /<Dialog/, "Plan selection must open an accessible popup.");
assert.match(catalog, /UniversalShareButton/, "Subscription plans must use the universal share flow.");
assert.match(catalog, /url="\/subscription\/start"/, "Subscription sharing must use the stable public entry route.");
assert.match(catalog, /Pay with Paystack/, "The popup must offer Paystack.");
assert.match(catalog, /Generate invoice/, "The popup must offer invoice generation.");
assert.doesNotMatch(catalog, /[⚡🚀👑✨✦✧]/u, "Subscription cards must use vector icons, not decorative emoji.");
assert.match(checkout, /SUBSCRIPTION_PRICE_COLUMNS/, "Checkout must resolve prices on the server.");
assert.match(checkout, /calculateSubscriptionAmount/, "Checkout must calculate Supreme quantity pricing server-side.");
assert.match(plans, /SUPREME_MAX_DESIGNS = 40/, "Supreme must be capped at 40 designs monthly.");
assert.match(plans, /Choose up to 40 designs monthly/, "Supreme must display its monthly design allowance.");
assert.match(checkout, /SUPREME_MAX_DESIGNS/, "Checkout must enforce the Supreme monthly design cap server-side.");
assert.match(catalog, /SUPREME_MAX_DESIGNS/, "The Supreme quantity control must enforce the monthly design cap.");
assert.match(checkout, /finance_invoices/, "Checkout must create a linked finance invoice.");
assert.match(adminApi, /pricing\.edit/, "Plan price writes must require the pricing edit permission.");
assert.match(migration, /finance_invoice_activate_subscription/, "Verified invoice payment must activate the linked subscription.");

console.log("Subscription checkout contract check passed.");
