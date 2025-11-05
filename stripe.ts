import Stripe from "stripe";

// Determine which environment we're in
const isProduction = process.env.NODE_ENV === "production";
const appEnv = process.env.APP_ENV || (isProduction ? "production" : "development");

// Validate Stripe secret key is present
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing required Stripe secret: STRIPE_SECRET_KEY");
}

// Detect which mode the Stripe key is for
const stripeKey = process.env.STRIPE_SECRET_KEY;
const isLiveKey = stripeKey.startsWith("sk_live_");
const stripeMode = isLiveKey ? "live" : "test";

// Initialize Stripe
export const stripe = new Stripe(stripeKey, {
  apiVersion: "2025-10-29.clover",
});

// Price ID configuration
// IMPORTANT: Price IDs must match the Stripe key mode (test key = test prices, live key = live prices)
const LIVE_PRICE_IDS = {
  // One-time credit packs
  starter: "price_1SPD2qIUeudGFkNmhdZxakWP",  // $9.99 - 20 credits
  pro: "price_1SPD4RIUeudGFkNm4F23gNKs",      // $39.99 - 100 credits
  elite: "price_1SPD6KIUeudGFkNmt2nwlHdn",    // $99.99 - 300 credits
  vip: "price_1SPD7aIUeudGFkNm4HfMlNsz",      // $299.99 - 1000 credits
  
  // Subscriptions
  basic: "price_1SPD8wIUeudGFkNmO5y2fWyT",           // $14.99/month - 100 credits/month
  proSubscription: "price_1SPDD9IUeudGFkNmKA7UKcGG",   // $49.99/month - 500 credits/month
  eliteSubscription: "price_1SPDGdIUeudGFkNmnjMwn5xJ", // $149.99/month - 1500 credits/month
  unlimited: "price_1SP8WpIUeudGFkNmK7ktomSS",  // $199.99/month - unlimited credits
};

// TEST MODE PRICE IDS - Create these in your Stripe Dashboard (Test Mode)
// Instructions: https://dashboard.stripe.com/test/products
// 1. Switch to Test Mode (toggle in upper right)
// 2. Create products matching your live products
// 3. Copy the price IDs here
const TEST_PRICE_IDS = {
  // One-time credit packs - REPLACE WITH YOUR TEST PRICE IDs
  starter: "price_test_starter_placeholder",
  pro: "price_test_pro_placeholder",
  elite: "price_test_elite_placeholder",
  vip: "price_test_vip_placeholder",
  
  // Subscriptions - REPLACE WITH YOUR TEST PRICE IDs
  basic: "price_test_basic_14_99_placeholder",
  proSubscription: "price_test_pro_49_99_placeholder",
  eliteSubscription: "price_test_elite_149_99_placeholder",
  unlimited: "price_test_unlimited_199_99_placeholder",
};

// Select price IDs based on Stripe key mode
export const priceIds = stripeMode === "live" ? LIVE_PRICE_IDS : TEST_PRICE_IDS;

// Startup diagnostics
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🔧 STRIPE CONFIGURATION");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Environment:     ${appEnv}`);
console.log(`Stripe Key:      ${stripeKey.substring(0, 12)}...`);
console.log(`Stripe Mode:     ${stripeMode.toUpperCase()}`);
console.log(`Using Price IDs: ${stripeMode === "live" ? "LIVE" : "TEST"}`);
console.log(`Sample Price:    ${priceIds.basic}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Export configuration for verification
export const stripeConfig = {
  mode: stripeMode,
  isLive: isLiveKey,
  environment: appEnv,
  priceIds,
};
