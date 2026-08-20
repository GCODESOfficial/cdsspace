import type { ClientBillingCurrency } from "@/lib/client-billing";

export const SUBSCRIPTION_PLAN_IDS = ["startup", "scaleup", "supreme"] as const;

export type SubscriptionPlanId = (typeof SUBSCRIPTION_PLAN_IDS)[number];

export interface SubscriptionPlanDefinition {
  id: SubscriptionPlanId;
  name: string;
  description: string;
  features: readonly string[];
  billingUnit: "month" | "design";
  includedDesigns: number;
  popular?: boolean;
}

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlanDefinition[] = [
  {
    id: "startup",
    name: "Startup",
    description: "A focused monthly design plan for early-stage brands.",
    features: [
      "5 design requests each month",
      "36-hour standard turnaround",
      "Unlimited revisions",
      "One brand profile",
      "Email support",
    ],
    billingUnit: "month",
    includedDesigns: 5,
  },
  {
    id: "scaleup",
    name: "Scaleup",
    description: "Priority design support for brands with a growing workload.",
    features: [
      "10 design requests each month",
      "24-hour standard turnaround",
      "Unlimited revisions",
      "Three brand profiles",
      "Priority support and source files",
    ],
    billingUnit: "month",
    includedDesigns: 10,
    popular: true,
  },
  {
    id: "supreme",
    name: "Supreme",
    description: "Flexible design capacity purchased by the quantity you need.",
    features: [
      "Choose the exact design quantity",
      "12-hour priority turnaround",
      "Unlimited revisions",
      "Dedicated designer",
      "Priority queue and custom integrations",
    ],
    billingUnit: "design",
    includedDesigns: 1,
  },
] as const;

export const SUBSCRIPTION_PRICE_COLUMNS: Record<ClientBillingCurrency, string> = {
  NGN: "price_ngn",
  USD: "price_usd",
  GBP: "price_gbp",
  EUR: "price_eur",
  RWF: "price_rwf",
  CNY: "price_cny",
  AED: "price_aed",
};

export const PAYSTACK_SUBSCRIPTION_CURRENCIES = new Set<ClientBillingCurrency>(["NGN", "USD"]);

export function isSubscriptionPlanId(value: unknown): value is SubscriptionPlanId {
  return typeof value === "string" && SUBSCRIPTION_PLAN_IDS.includes(value as SubscriptionPlanId);
}

export function subscriptionPlan(planId: SubscriptionPlanId) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId)!;
}

export function normalizedDesignQuantity(planId: SubscriptionPlanId, value: unknown) {
  if (planId !== "supreme") return 1;
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000 ? quantity : null;
}

export function calculateSubscriptionAmount(
  planId: SubscriptionPlanId,
  unitPrice: number,
  quantity: number,
) {
  return planId === "supreme" ? unitPrice * quantity : unitPrice;
}
