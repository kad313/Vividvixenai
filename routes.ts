import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { insertUserSchema, redeemPromoCodeSchema, insertPromoCodeSchema, insertPrepaidCustomerSchema, insertBugReportSchema, insertAnnouncementSchema, updateAnnouncementSchema, insertAnnouncementResponseSchema } from "@shared/schema";
import Stripe from "stripe";
import { stripe, priceIds, stripeConfig } from "./config/stripe";
import crypto from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Authentication routes
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password } = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Check if this email is a prepaid customer
      const prepaidCustomer = await storage.getPrepaidCustomer(email);

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user with 10 free credits (or prepaid credits if applicable)
      // User has accepted terms via frontend modal, so set acceptedTerms to true
      const baseCredits = prepaidCustomer ? prepaidCustomer.initialCredits : 10;
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        acceptedTerms: true,
      });

      // If prepaid customer, grant access automatically
      if (prepaidCustomer && !prepaidCustomer.claimed) {
        // Handle Pro tier as a 3-month subscription (PayPal customers)
        if (prepaidCustomer.tier === 'pro') {
          await storage.updateUserSubscription(user.id, {
            subscriptionTier: 'Pro',
            subscriptionPrice: 7497, // $74.97 in cents
            subscriptionCredits: 500,
          });
          
          await storage.updateUserCredits(user.id, baseCredits);
          await storage.markPrepaidCustomerClaimed(email);
          
          console.log(`[SIGNUP] Auto-granted Pro subscription (3mo) to ${email}`);
        } 
        // Handle standard/vip tiers as lifetime access
        else {
          await storage.updateUserLifetime(user.id, {
            lifetimeTier: prepaidCustomer.tier,
            monthlyRefillAmount: prepaidCustomer.monthlyRefill,
            lastRefillDate: new Date(),
          });
          
          await storage.updateUserCredits(user.id, baseCredits);
          await storage.markPrepaidCustomerClaimed(email);
          
          console.log(`[SIGNUP] Auto-granted lifetime ${prepaidCustomer.tier} to ${email}`);
        }
      }

      // Get updated user
      const updatedUser = await storage.getUser(user.id);

      // Set session
      req.login(updatedUser || user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Error creating session" });
        }
        const finalUser = updatedUser || user;
        return res.json({
          id: finalUser.id,
          email: finalUser.email,
          credits: finalUser.credits,
          subscription: finalUser.subscriptionTier ? {
            tier: finalUser.subscriptionTier,
            price: finalUser.subscriptionPrice,
            credits: finalUser.subscriptionCredits,
          } : null,
          lifetime: finalUser.lifetimeTier ? {
            tier: finalUser.lifetimeTier,
            monthlyRefill: finalUser.monthlyRefillAmount,
          } : null,
        });
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.login(user, (err) => {
        if (err) {
          console.error('[LOGIN ERROR]', err);
          return res.status(500).json({ message: "Error creating session" });
        }
        
        // Explicitly regenerate and save session
        req.session.regenerate((regenerateErr) => {
          if (regenerateErr) {
            console.error('[SESSION REGENERATE ERROR]', regenerateErr);
            return res.status(500).json({ message: "Error regenerating session" });
          }
          
          // Store user in session
          (req.session as any).passport = { user: user.id };
          
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error('[SESSION SAVE ERROR]', saveErr);
              return res.status(500).json({ message: "Error saving session" });
            }
            
            console.log('[LOGIN SUCCESS] Session saved, ID:', req.sessionID);
            console.log('[LOGIN SUCCESS] Set-Cookie header:', res.getHeader('Set-Cookie'));
            return res.json({
              id: user.id,
              email: user.email,
              credits: user.credits,
              subscription: user.subscriptionTier ? {
                tier: user.subscriptionTier,
                price: user.subscriptionPrice,
                credits: user.subscriptionCredits,
              } : null,
              lifetime: user.lifetimeTier ? {
                tier: user.lifetimeTier,
                monthlyRefill: user.monthlyRefillAmount,
                lastRefill: user.lastRefillDate,
              } : null,
            });
          });
        });
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Error logging out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = req.user as any;
    res.json({
      id: user.id,
      email: user.email,
      credits: user.credits,
      subscription: user.subscriptionTier ? {
        tier: user.subscriptionTier,
        price: user.subscriptionPrice,
        credits: user.subscriptionCredits,
      } : null,
      lifetime: user.lifetimeTier ? {
        tier: user.lifetimeTier,
        monthlyRefill: user.monthlyRefillAmount,
        lastRefill: user.lastRefillDate,
      } : null,
    });
  });

  // Stripe payment routes
  app.post("/api/payments/create-payment-intent", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { amount } = req.body;
      const user = req.user as any;

      console.log(`[STRIPE] Creating payment intent for user ${user.email}, amount: $${amount}`);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          userId: user.id,
          userEmail: user.email,
          type: "credit_purchase",
          credits: "100", // $10 for 100 credits
        },
      });

      console.log(`[STRIPE] Payment intent created: ${paymentIntent.id}`);
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error(`[STRIPE ERROR] Failed to create payment intent:`, {
        message: error.message,
        type: error.type,
        code: error.code,
        decline_code: error.decline_code,
        user: req.user ? (req.user as any).email : 'unknown'
      });
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  app.post("/api/payments/create-lifetime-payment", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { tier } = req.body;
      const user = req.user as any;

      // Lifetime tier configurations
      const LIFETIME_CONFIGS: Record<string, { price: number; credits: number; monthlyRefill: number; name: string }> = {
        standard: {
          name: 'Standard Lifetime',
          price: 19700, // $197
          credits: 1000,
          monthlyRefill: 200,
        },
        vip: {
          name: 'VIP Lifetime',
          price: 69700, // $697
          credits: 5000,
          monthlyRefill: 500,
        },
      };

      const config = LIFETIME_CONFIGS[tier];
      if (!config) {
        return res.status(400).json({ message: "Invalid tier" });
      }

      console.log(`[STRIPE] Creating lifetime payment for user ${user.email}, tier: ${tier}, amount: $${config.price / 100}`);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: config.price,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          userId: user.id,
          userEmail: user.email,
          type: "lifetime_purchase",
          tier: tier,
          initialCredits: config.credits.toString(),
          monthlyRefill: config.monthlyRefill.toString(),
        },
      });

      console.log(`[STRIPE] Lifetime payment intent created: ${paymentIntent.id}`);
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error(`[STRIPE ERROR] Failed to create lifetime payment:`, {
        message: error.message,
        type: error.type,
        code: error.code,
        decline_code: error.decline_code,
        user: req.user ? (req.user as any).email : 'unknown',
        tier: req.body.tier
      });
      res.status(500).json({ message: "Error creating lifetime payment: " + error.message });
    }
  });

  // Credit Pack Purchase with Stripe Checkout Sessions
  app.post("/api/payments/buy-pack", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { credits } = req.body;
      const user = req.user as any;

      // Map credits to Stripe Price IDs (environment-aware from config)
      const PRICE_IDS: Record<number, string> = {
        20: priceIds.starter,   // Starter - $9.99
        100: priceIds.pro,      // Pro - $39.99
        300: priceIds.elite,    // Elite - $99.99
        1000: priceIds.vip,     // VIP - $299.99
      };

      const priceId = PRICE_IDS[credits];
      if (!priceId) {
        return res.status(400).json({ message: "Invalid credit pack" });
      }

      console.log(`[STRIPE CHECKOUT] Creating checkout session for user ${user.email}, credits: ${credits}`);

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id.toString() },
        });
        customerId = customer.id;
        await storage.updateUserSubscription(user.id, {
          stripeCustomerId: customerId,
        });
        console.log(`[STRIPE] Created customer: ${customerId}`);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/payment-cancel`,
        metadata: {
          userId: user.id.toString(),
          userEmail: user.email,
          type: 'credit_pack',
          credits: credits.toString(),
        },
      });

      console.log(`[STRIPE CHECKOUT] Session created: ${session.id}`);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error(`[STRIPE CHECKOUT ERROR]`, {
        message: error.message,
        type: error.type,
        code: error.code,
        user: req.user ? (req.user as any).email : 'unknown'
      });
      res.status(500).json({ message: "Error creating checkout session: " + error.message });
    }
  });

  // Unlimited Subscription with Stripe Checkout Sessions
  app.post("/api/payments/subscribe-unlimited", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;

      console.log(`[STRIPE CHECKOUT] Creating unlimited subscription for user ${user.email}`);

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id.toString() },
        });
        customerId = customer.id;
        await storage.updateUserSubscription(user.id, {
          stripeCustomerId: customerId,
        });
        console.log(`[STRIPE] Created customer: ${customerId}`);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: 'price_1SP8WpIUeudGFkNmK7ktomSS', // Unlimited $199.99/month (LIVE MODE)
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/payment-cancel`,
        metadata: {
          userId: user.id.toString(),
          userEmail: user.email,
          type: 'unlimited_subscription',
        },
      });

      console.log(`[STRIPE CHECKOUT] Unlimited subscription session created: ${session.id}`);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error(`[STRIPE CHECKOUT ERROR]`, {
        message: error.message,
        type: error.type,
        code: error.code,
        user: req.user ? (req.user as any).email : 'unknown'
      });
      res.status(500).json({ message: "Error creating subscription session: " + error.message });
    }
  });

  // Subscription with Stripe Checkout Sessions (Basic/Pro/Elite)
  app.post("/api/payments/create-subscription", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      const { tier } = req.body;

      console.log(`[STRIPE CHECKOUT] Creating subscription for user ${user.email}, tier: ${tier}`);
      console.log(`[STRIPE CONFIG] Mode: ${stripeConfig.mode}, IsLive: ${stripeConfig.isLive}`);
      console.log(`[STRIPE CONFIG] Available priceIds:`, priceIds);

      // Map tiers to Stripe Price IDs (environment-aware from config)
      const SUB_PRICE_IDS: Record<string, string> = {
        basic: priceIds.basic,
        pro: priceIds.proSubscription,
        elite: priceIds.eliteSubscription,
        unlimited: priceIds.unlimited,
      };

      const priceId = SUB_PRICE_IDS[tier];
      console.log(`[STRIPE CHECKOUT] Selected price ID for tier "${tier}": ${priceId}`);
      
      if (!priceId) {
        return res.status(400).json({ message: "Invalid subscription tier" });
      }

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id.toString() },
        });
        customerId = customer.id;
        await storage.updateUserSubscription(user.id, {
          stripeCustomerId: customerId,
        });
        console.log(`[STRIPE] Created customer: ${customerId}`);
      }

      // Create Checkout Session for subscription
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/payment-cancel`,
        metadata: {
          userId: user.id.toString(),
          userEmail: user.email,
          type: 'subscription',
          tier: tier,
        },
      });

      console.log(`[STRIPE CHECKOUT] Subscription session created: ${session.id}`);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[STRIPE CHECKOUT ERROR]', {
        message: error.message,
        type: error.type,
        code: error.code,
        user: req.user ? (req.user as any).email : 'unknown'
      });
      res.status(500).json({ message: "Error creating subscription session: " + error.message });
    }
  });

  // PayPal webhook - MUST verify signature for security
  app.post("/api/webhooks/paypal", async (req, res) => {
    const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
    const PAYPAL_APP_SECRET = process.env.PAYPAL_APP_SECRET;
    const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;
    
    if (!PAYPAL_CLIENT_ID || !PAYPAL_APP_SECRET || !PAYPAL_WEBHOOK_ID) {
      console.error("PayPal credentials not configured - webhooks disabled for security");
      return res.status(500).json({ message: "PayPal webhook not configured" });
    }

    try {
      // Step 1: Extract webhook headers
      const headers = {
        'paypal-auth-algo': req.headers['paypal-auth-algo'],
        'paypal-cert-url': req.headers['paypal-cert-url'],
        'paypal-transmission-id': req.headers['paypal-transmission-id'],
        'paypal-transmission-sig': req.headers['paypal-transmission-sig'],
        'paypal-transmission-time': req.headers['paypal-transmission-time']
      };

      // Step 2: Parse the webhook event body
      const rawBodyString = req.rawBody ? req.rawBody.toString() : '{}';
      const webhookEvent = JSON.parse(rawBodyString);
      
      console.log(`[PAYPAL WEBHOOK] Received event: ${webhookEvent.event_type}, ID: ${webhookEvent.id}`);

      // Step 3: Get OAuth access token
      const baseURL = process.env.NODE_ENV === 'production' 
        ? 'https://api-m.paypal.com' 
        : 'https://api-m.sandbox.paypal.com';
      
      const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_APP_SECRET}`).toString('base64');
      
      const tokenResponse = await fetch(`${baseURL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });
      
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Step 4: Verify the signature with PayPal
      const verificationPayload = {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: PAYPAL_WEBHOOK_ID,
        webhook_event: webhookEvent
      };
      
      const verifyResponse = await fetch(
        `${baseURL}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(verificationPayload)
        }
      );
      
      const verifyResult = await verifyResponse.json();
      
      if (verifyResult.verification_status !== 'SUCCESS') {
        console.error('[PAYPAL WEBHOOK] Signature verification failed:', verifyResult);
        return res.status(401).json({ message: 'Unauthorized - invalid signature' });
      }

      console.log('[PAYPAL WEBHOOK] Signature verified successfully');

      // Step 5: Process the verified webhook event
      switch (webhookEvent.event_type) {
        case 'PAYMENT.SALE.COMPLETED':
          // One-time credit pack purchase completed
          const sale = webhookEvent.resource;
          const customId = sale.custom_id; // We'll use this to identify the user
          const amount = parseFloat(sale.amount.total);
          
          console.log(`[PAYPAL] Payment completed: ${sale.id}, amount: $${amount}, custom_id: ${customId}`);
          
          // Map amount to credit packs
          const CREDIT_PACK_AMOUNTS: Record<string, number> = {
            '9.99': 20,    // Starter
            '39.99': 100,  // Pro
            '99.99': 300,  // Elite
            '299.99': 1000 // VIP
          };
          
          const credits = CREDIT_PACK_AMOUNTS[amount.toFixed(2)];
          
          if (credits && customId) {
            // Custom ID should be the user's email
            const user = await storage.getUserByEmail(customId);
            if (user) {
              await storage.updateUserCredits(user.id, user.credits + credits);
              console.log(`[PAYPAL] Added ${credits} credits to user ${customId}`);
            } else {
              console.error(`[PAYPAL] User not found for email: ${customId}`);
            }
          }
          break;

        case 'BILLING.SUBSCRIPTION.CREATED':
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
          // Monthly subscription created/activated
          const subscription = webhookEvent.resource;
          const subscriberEmail = subscription.subscriber?.email_address;
          const planId = subscription.plan_id;
          
          console.log(`[PAYPAL] Subscription ${webhookEvent.event_type}: ${subscription.id}, plan: ${planId}, email: ${subscriberEmail}`);
          
          // Map plan IDs to subscription tiers
          const SUBSCRIPTION_PLANS: Record<string, { tier: string; price: number; credits: number }> = {
            'P-5CF320113T8461232NEEENFQ': { tier: 'Basic', price: 1499, credits: 100 },
            'P-39439555GN873560ENEEEPFI': { tier: 'Pro', price: 4999, credits: 500 },
            'P-66X245631L3498159NEEEP5A': { tier: 'Elite', price: 14999, credits: 1500 },
            'P-866599911D545115TNEEEQSA': { tier: 'Unlimited', price: 19999, credits: 999999 }
          };
          
          const planConfig = SUBSCRIPTION_PLANS[planId];
          
          if (planConfig && subscriberEmail) {
            const user = await storage.getUserByEmail(subscriberEmail);
            if (user) {
              // Update user with subscription info
              await storage.updateUserSubscription(user.id, {
                subscriptionTier: planConfig.tier,
                subscriptionPrice: planConfig.price,
                subscriptionCredits: planConfig.credits,
              });
              
              // Add monthly credits
              await storage.updateUserCredits(user.id, user.credits + planConfig.credits);
              
              console.log(`[PAYPAL] Activated ${planConfig.tier} subscription for ${subscriberEmail}, added ${planConfig.credits} credits`);
            } else {
              console.error(`[PAYPAL] User not found for email: ${subscriberEmail}`);
            }
          }
          break;

        case 'BILLING.SUBSCRIPTION.CANCELLED':
          // Subscription cancelled
          const cancelledSub = webhookEvent.resource;
          const cancelledEmail = cancelledSub.subscriber?.email_address;
          
          console.log(`[PAYPAL] Subscription cancelled: ${cancelledSub.id}, email: ${cancelledEmail}`);
          
          if (cancelledEmail) {
            const user = await storage.getUserByEmail(cancelledEmail);
            if (user) {
              // Clear subscription info but keep existing credits
              await storage.updateUserSubscription(user.id, {
                subscriptionTier: undefined,
                subscriptionPrice: undefined,
                subscriptionCredits: undefined,
              });
              
              console.log(`[PAYPAL] Cleared subscription for ${cancelledEmail}`);
            }
          }
          break;
      }

      // Step 6: Always return 200 to prevent retries
      res.status(200).json({ received: true });
      
    } catch (error: any) {
      console.error('[PAYPAL WEBHOOK ERROR]', error.message);
      res.status(500).json({ message: 'Webhook processing error' });
    }
  });

  // Create PayPal order endpoint with custom_id
  app.post("/api/paypal/create-order", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      const { type, tier } = req.body; // type: 'credit_pack' or 'subscription', tier: 'starter', 'pro', etc.
      
      const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
      const PAYPAL_APP_SECRET = process.env.PAYPAL_APP_SECRET;
      
      if (!PAYPAL_CLIENT_ID || !PAYPAL_APP_SECRET) {
        return res.status(500).json({ message: "PayPal not configured" });
      }

      const baseURL = process.env.NODE_ENV === 'production' 
        ? 'https://api-m.paypal.com' 
        : 'https://api-m.sandbox.paypal.com';
      
      // Get access token
      const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_APP_SECRET}`).toString('base64');
      const tokenResponse = await fetch(`${baseURL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });
      
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Define credit packs and subscription plans
      const CREDIT_PACKS: Record<string, { amount: string; credits: number; description: string }> = {
        starter: { amount: '9.99', credits: 20, description: 'Starter Pack - 20 Credits' },
        pro: { amount: '39.99', credits: 100, description: 'Pro Pack - 100 Credits' },
        elite: { amount: '99.99', credits: 300, description: 'Elite Pack - 300 Credits' },
        vip: { amount: '299.99', credits: 1000, description: 'VIP Pack - 1,000 Credits' }
      };

      if (type === 'credit_pack') {
        const pack = CREDIT_PACKS[tier];
        if (!pack) {
          return res.status(400).json({ message: "Invalid credit pack" });
        }

        // Create order with custom_id
        const orderData = {
          intent: 'CAPTURE',
          purchase_units: [{
            custom_id: user.email, // User email for identification
            amount: {
              currency_code: 'USD',
              value: pack.amount
            },
            description: pack.description
          }],
          application_context: {
            return_url: `${req.protocol}://${req.get('host')}/payment-success`,
            cancel_url: `${req.protocol}://${req.get('host')}/subscribe`
          }
        };

        const orderResponse = await fetch(`${baseURL}/v2/checkout/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(orderData)
        });

        const order = await orderResponse.json();
        
        // Extract approval URL
        const approvalUrl = order.links?.find((link: any) => link.rel === 'approve')?.href;
        
        if (!approvalUrl) {
          console.error('[PAYPAL] No approval URL in order response:', order);
          return res.status(500).json({ message: 'Failed to create PayPal order' });
        }

        console.log(`[PAYPAL] Created order for ${user.email}: ${pack.description}, order ID: ${order.id}`);
        
        res.json({ approvalUrl });
      } else {
        return res.status(400).json({ message: 'Subscription orders not yet implemented via API' });
      }
    } catch (error: any) {
      console.error('[PAYPAL ORDER ERROR]', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Download proxy endpoint for external video files
  app.get("/api/download/:generationId", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      const generationId = req.params.generationId;

      // Get generation from database
      const generation = await storage.getGeneration(generationId);
      
      if (!generation) {
        return res.status(404).json({ message: "Generation not found" });
      }

      // Verify user owns this generation
      if (generation.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to download this file" });
      }

      if (!generation.fileUrl) {
        return res.status(400).json({ message: "No file available for download" });
      }

      console.log(`[DOWNLOAD] User ${user.email} downloading generation ${generationId} from ${generation.fileUrl}`);

      // Fetch the file from external URL
      const fileResponse = await fetch(generation.fileUrl);
      
      if (!fileResponse.ok) {
        console.error(`[DOWNLOAD] External file fetch failed: ${fileResponse.status} ${fileResponse.statusText} for URL: ${generation.fileUrl}`);
        return res.status(502).json({ 
          message: 'The file is no longer available on the external server',
          details: `External server returned: ${fileResponse.status} ${fileResponse.statusText}`
        });
      }

      // Determine file extension based on generation type
      const fileExtension = generation.type === 'image-to-video' ? 'mp4' : 'png';
      const filename = `vivid-vixen-${generation.type}-${generationId}.${fileExtension}`;

      // Set appropriate headers
      res.setHeader('Content-Type', fileResponse.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Stream the file to the client
      const buffer = await fileResponse.arrayBuffer();
      res.send(Buffer.from(buffer));
      
    } catch (error: any) {
      console.error('[DOWNLOAD ERROR]', error);
      res.status(500).json({ message: 'Download failed', error: error.message });
    }
  });

  // Stripe webhook - MUST verify signature for security
  app.post("/api/webhooks/stripe", async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured - webhooks disabled for security");
      return res.status(500).json({ message: "Webhook secret not configured" });
    }

    try {
      // Verify webhook signature using raw body
      const event = stripe.webhooks.constructEvent(
        req.rawBody as Buffer,
        sig,
        webhookSecret
      );

      console.log(`[STRIPE WEBHOOK] Received event: ${event.type}, ID: ${event.id}`);

      switch (event.type) {
        case "payment_intent.succeeded":
          const paymentIntent = event.data.object as any;
          console.log(`[STRIPE] Payment succeeded: ${paymentIntent.id}, amount: $${paymentIntent.amount / 100}, type: ${paymentIntent.metadata.type}`);
          
          if (paymentIntent.metadata.type === "credit_purchase") {
            const userId = paymentIntent.metadata.userId;
            const credits = parseInt(paymentIntent.metadata.credits);
            const user = await storage.getUser(userId);
            if (user) {
              await storage.updateUserCredits(userId, user.credits + credits);
              console.log(`[STRIPE] Added ${credits} credits to user ${paymentIntent.metadata.userEmail}`);
            }
          } else if (paymentIntent.metadata.type === "lifetime_purchase") {
            const userId = paymentIntent.metadata.userId;
            const tier = paymentIntent.metadata.tier;
            const initialCredits = parseInt(paymentIntent.metadata.initialCredits);
            const monthlyRefill = parseInt(paymentIntent.metadata.monthlyRefill);
            
            const user = await storage.getUser(userId);
            if (user) {
              // Update user with lifetime tier info
              await storage.updateUserLifetime(userId, {
                lifetimeTier: tier,
                monthlyRefillAmount: monthlyRefill,
                lastRefillDate: new Date(),
              });
              
              // Add initial credits
              await storage.updateUserCredits(userId, user.credits + initialCredits);
              
              console.log(`[LIFETIME PURCHASE] User ${paymentIntent.metadata.userEmail} purchased ${tier} tier with ${initialCredits} credits and ${monthlyRefill} monthly refill`);
            }
          }
          break;

        case "checkout.session.completed":
          const session = event.data.object as any;
          console.log(`[STRIPE CHECKOUT] Session completed: ${session.id}, type: ${session.metadata.type}`);
          
          if (session.metadata.type === "credit_pack") {
            const userId = session.metadata.userId;
            const credits = parseInt(session.metadata.credits);
            const user = await storage.getUser(userId);
            
            if (user) {
              await storage.updateUserCredits(userId, user.credits + credits);
              console.log(`[STRIPE CHECKOUT] Added ${credits} credits to user ${session.metadata.userEmail}`);
            }
          } else if (session.metadata.type === "unlimited_subscription") {
            const userId = session.metadata.userId;
            const user = await storage.getUser(userId);
            
            if (user) {
              // Update user with unlimited subscription (can be tracked via subscription ID)
              await storage.updateUserSubscription(userId, {
                stripeSubscriptionId: session.subscription,
                subscriptionTier: 'Unlimited',
                subscriptionPrice: 19999, // $199.99
                subscriptionCredits: 999999, // Effectively unlimited
              });
              
              // Give them a huge credit boost
              await storage.updateUserCredits(userId, user.credits + 10000);
              console.log(`[STRIPE CHECKOUT] Activated unlimited subscription for ${session.metadata.userEmail}`);
            }
          }
          break;

        case "payment_intent.payment_failed":
          const failedPayment = event.data.object as any;
          const lastError = failedPayment.last_payment_error;
          console.error(`[STRIPE PAYMENT FAILED]`, {
            payment_intent_id: failedPayment.id,
            user_email: failedPayment.metadata.userEmail,
            amount: `$${failedPayment.amount / 100}`,
            type: failedPayment.metadata.type,
            decline_code: lastError?.decline_code,
            error_code: lastError?.code,
            error_message: lastError?.message,
            payment_method_type: lastError?.payment_method?.type,
            card_brand: lastError?.payment_method?.card?.brand,
            card_last4: lastError?.payment_method?.card?.last4,
          });
          // Send email notification or log for manual review
          break;

        case "invoice.payment_succeeded":
          const invoice = event.data.object as any;
          const subscriptionId = invoice.subscription;
          console.log(`[STRIPE] Invoice payment succeeded: ${invoice.id}, subscription: ${subscriptionId}`);
          
          if (subscriptionId) {
            // Find user by subscription ID (reliable regardless of payment method)
            const user = await storage.getUserByStripeSubscriptionId(subscriptionId);
            if (user) {
              // Get subscription metadata to determine tier
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              const tier = subscription.metadata.tier || 'basic';
              const credits = parseInt(subscription.metadata.credits) || 100;
              
              // Tier configurations for credit assignment
              const TIER_CONFIGS: Record<string, { tier: string; price: number; credits: number; bonusCredits?: number }> = {
                basic: { tier: 'Basic', price: 999, credits: 100 },
                pro: { tier: 'Pro', price: 7497, credits: 500, bonusCredits: 100 },
                elite: { tier: 'Elite', price: 47994, credits: 2000 },
              };
              
              const tierConfig = TIER_CONFIGS[tier] || TIER_CONFIGS.basic;
              
              // Activate subscription with metadata on first successful payment
              if (!user.subscriptionTier) {
                await storage.updateUserSubscription(user.id, {
                  subscriptionTier: tierConfig.tier,
                  subscriptionPrice: tierConfig.price,
                  subscriptionCredits: tierConfig.credits,
                });
                // Add initial monthly credits + bonus for Pro tier
                const totalCredits = tierConfig.credits + (tierConfig.bonusCredits || 0);
                await storage.updateUserCredits(user.id, user.credits + totalCredits);
                console.log(`[STRIPE] New subscription activated for ${user.email}: ${tierConfig.tier} tier, ${totalCredits} credits`);
              } else {
                // Renewal: just add monthly credits (no bonus on renewal)
                await storage.updateUserCredits(user.id, user.credits + tierConfig.credits);
                console.log(`[STRIPE] Subscription renewed for ${user.email}: ${tierConfig.credits} credits added`);
              }
            }
          }
          break;

        case "invoice.payment_failed":
          const failedInvoice = event.data.object as any;
          const failedSubscriptionId = failedInvoice.subscription;
          const invoiceError = failedInvoice.last_payment_error;
          
          console.error(`[STRIPE INVOICE PAYMENT FAILED]`, {
            invoice_id: failedInvoice.id,
            subscription_id: failedSubscriptionId,
            customer: failedInvoice.customer,
            amount: `$${failedInvoice.amount_due / 100}`,
            attempt_count: failedInvoice.attempt_count,
            decline_code: invoiceError?.decline_code,
            error_code: invoiceError?.code,
            error_message: invoiceError?.message,
            payment_method_type: invoiceError?.payment_method?.type,
            card_brand: invoiceError?.payment_method?.card?.brand,
            card_last4: invoiceError?.payment_method?.card?.last4,
          });
          // Optionally notify user about failed payment
          break;
          
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          // Handle subscription changes/cancellations
          const subscription = event.data.object as any;
          // Find user by customer ID and update subscription status
          break;
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook signature verification failed:', error.message);
      res.status(400).json({ message: `Webhook Error: ${error.message}` });
    }
  });

  // Credit management routes
  app.post("/api/credits/deduct", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      if (user.credits < 1) {
        return res.status(400).json({ message: "Insufficient credits" });
      }

      const updatedUser = await storage.updateUserCredits(user.id, user.credits - 1);
      res.json({ credits: updatedUser?.credits });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/credits/add", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { amount } = req.body;
      const user = req.user as any;
      
      const updatedUser = await storage.updateUserCredits(user.id, user.credits + amount);
      res.json({ credits: updatedUser?.credits });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Bug report submission endpoint
  app.post("/api/bug-report", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;

      // Validate request body with Zod
      const validation = insertBugReportSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Invalid request data" 
        });
      }

      const { type, message } = validation.data;

      // Use atomic transaction to prevent race conditions
      const result = await storage.submitBugReportWithReward(
        user.id,
        user.email,
        type,
        message
      );

      if (result.error) {
        if (result.error === 'RATE_LIMIT') {
          return res.status(429).json({ 
            message: "You can only submit up to 3 bug reports per day. Please try again tomorrow." 
          });
        }
        throw new Error(result.error);
      }

      const responseMessage = result.creditsAwarded > 0
        ? "Thank you for your feedback! 2 credits have been added to your account."
        : "Thank you for your feedback! Your report has been submitted.";

      console.log(`[BUG REPORT] User ${user.email} submitted ${type} report${result.creditsAwarded > 0 ? ' and received 2 credits' : ' (no credits - daily limit)'}`);
      
      res.json({ 
        credits: result.newCreditBalance,
        message: responseMessage 
      });
    } catch (error: any) {
      console.error('[BUG REPORT] Error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Admin routes
  const isAdmin = (req: any) => {
    return req.isAuthenticated() && req.user?.email === 'kyleeann@thevixenai.com';
  };

  app.get("/api/admin/users", async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const allUsers = await storage.getAllUsers();
      // Remove password from response
      const sanitizedUsers = allUsers.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      res.json(sanitizedUsers);
    } catch (error: any) {
      console.error('[ADMIN] Error fetching users:', error);
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  app.post("/api/admin/users/:id/credits", async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { id } = req.params;
      const { credits } = req.body;

      if (typeof credits !== 'number' || credits < 0) {
        return res.status(400).json({ message: "Invalid credit amount" });
      }

      const updatedUser = await storage.updateUserCredits(id, credits);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error('[ADMIN] Error updating user credits:', error);
      res.status(500).json({ message: "Error updating credits" });
    }
  });

  // Announcement routes (admin)
  app.post("/api/announcements", async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const announcementData = insertAnnouncementSchema.parse(req.body);
      const announcement = await storage.createAnnouncement(announcementData);
      res.json(announcement);
    } catch (error: any) {
      console.error('[ANNOUNCEMENT CREATE ERROR]', error);
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/announcements/:id", async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { id } = req.params;
      const updateData = updateAnnouncementSchema.parse(req.body);
      const announcement = await storage.updateAnnouncement(id, updateData);
      
      if (!announcement) {
        return res.status(404).json({ message: "Announcement not found" });
      }
      
      res.json(announcement);
    } catch (error: any) {
      console.error('[ANNOUNCEMENT UPDATE ERROR]', error);
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/announcements/:id", async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { id } = req.params;
      await storage.deleteAnnouncement(id);
      res.json({ message: "Announcement deleted successfully" });
    } catch (error: any) {
      console.error('[ANNOUNCEMENT DELETE ERROR]', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/announcements/:id/responses", async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { id } = req.params;
      const responses = await storage.getAnnouncementResponses(id);
      res.json(responses);
    } catch (error: any) {
      console.error('[ANNOUNCEMENT RESPONSES ERROR]', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/announcements/all-responses", async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const responses = await storage.getAllAnnouncementResponsesWithDetails();
      res.json(responses);
    } catch (error: any) {
      console.error('[ALL ANNOUNCEMENT RESPONSES ERROR]', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Announcement routes (public, authenticated users)
  app.get("/api/announcements", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const announcements = await storage.getAnnouncements();
      res.json(announcements);
    } catch (error: any) {
      console.error('[ANNOUNCEMENTS ERROR]', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/announcements/count", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      if (!user.id) {
        return res.status(400).json({ message: "Invalid user session" });
      }

      const count = await storage.getUnreadAnnouncementCount(user.id);
      res.json({ count });
    } catch (error: any) {
      console.error('[ANNOUNCEMENTS COUNT ERROR]', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/announcements/mark-viewed", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      await storage.updateLastViewedAnnouncements(user.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[MARK ANNOUNCEMENTS VIEWED ERROR]', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/announcements/:id/respond", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      const { id } = req.params;
      const responseData = insertAnnouncementResponseSchema.parse(req.body);

      // Check if user already responded
      const existingResponse = await storage.getUserResponseForAnnouncement(id, user.id);
      if (existingResponse) {
        return res.status(400).json({ message: "You have already responded to this announcement" });
      }

      // Verify announcement exists
      const announcement = await storage.getAnnouncement(id);
      if (!announcement) {
        return res.status(404).json({ message: "Announcement not found" });
      }

      const response = await storage.createAnnouncementResponse({
        announcementId: id,
        userId: user.id,
        userEmail: user.email,
        response: responseData.response,
      });

      res.json(response);
    } catch (error: any) {
      console.error('[ANNOUNCEMENT RESPONSE ERROR]', error);
      res.status(400).json({ message: error.message });
    }
  });

  // Generation routes
  app.post("/api/generate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      
      // Server-side enforcement: Verify user has accepted terms before allowing generation
      if (!user.acceptedTerms) {
        return res.status(403).json({ 
          message: "You must accept the Terms of Service to use this feature" 
        });
      }

      const { type, prompt, fileUrl, modelId } = req.body;

      // Determine credit cost based on generation type
      const creditCost = type === "video" ? 5 : type === "upscale" ? 2 : 1;

      // Check credits
      if (user.credits < creditCost) {
        return res.status(400).json({ message: "Insufficient credits" });
      }

      // Deduct credits
      await storage.updateUserCredits(user.id, user.credits - creditCost);

      // Create generation record
      const generation = await storage.createGeneration({
        userId: user.id,
        type,
        prompt,
        fileUrl,
      });

      // Process generation asynchronously
      console.log(`[Gen ${generation.id}] Starting background processing for type=${type}, hasFileUrl=${!!fileUrl}`);
      processGeneration(generation.id, user.id, type, prompt, fileUrl, modelId).catch(async (error) => {
        console.error(`[Gen ${generation.id}] Generation error:`, error);
        console.error(`[Gen ${generation.id}] Error stack:`, error.stack);
        await storage.updateGenerationStatus(
          generation.id,
          "failed",
          undefined
        );
        // Refund credits on failure
        const currentUser = await storage.getUser(user.id.toString());
        if (currentUser) {
          await storage.updateUserCredits(user.id, currentUser.credits + creditCost);
          console.log(`[Gen ${generation.id}] ${creditCost} credit(s) refunded to user ${user.id}`);
        }
      });

      res.json({ 
        id: generation.id,
        status: "processing",
        credits: user.credits - creditCost,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Chat endpoint with streaming SSE
  app.post("/api/chat", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      const ETERNALAI_API_KEY = process.env.ETERNALAI_API_KEY;
      if (!ETERNALAI_API_KEY) {
        return res.status(500).json({ message: "Chat service not configured" });
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const payload = {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: message
              }
            ]
          }
        ],
        agent: "uncensored-chat",
        stream: true
      };

      const chatResponse = await fetch("https://agentic.eternalai.org/prompt", {
        method: "POST",
        headers: {
          "accept": "text/event-stream",
          "x-api-key": ETERNALAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        console.error(`Chat API error: ${chatResponse.status} - ${errorText}`);
        return res.status(500).json({ message: "Chat service error" });
      }

      // Stream the response to the client
      const reader = chatResponse.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        return res.status(500).json({ message: "Failed to read chat response" });
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        res.end();
      } catch (streamError) {
        console.error("Error streaming chat response:", streamError);
        res.end();
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: error.message });
      } else {
        res.end();
      }
    }
  });

  // Helper function to convert image URL to base64 for EternalAI
  async function imageUrlToBase64(imageUrl: string): Promise<string> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      
      // Determine MIME type from content-type header or URL extension
      const contentType = response.headers.get('content-type') || 'image/png';
      
      return `data:${contentType};base64,${base64}`;
    } catch (error: any) {
      throw new Error(`Failed to convert image to base64: ${error.message}`);
    }
  }

  // Helper function to call Replicate PONY XL for ultra-realistic NSFW img2img generation
  async function callHiggsfieldImg2Img(
    generationId: string,
    prompt: string,
    inputImageUrl: string
  ): Promise<string> {
    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN?.trim();
    if (!REPLICATE_API_TOKEN) {
      throw new Error("REPLICATE_API_TOKEN not configured");
    }

    console.log(`[Gen ${generationId}] Starting Replicate PONY XL NSFW img2img generation`);
    console.log(`[Gen ${generationId}] API Key prefix: ${REPLICATE_API_TOKEN.substring(0, 15)}...`);
    console.log(`[Gen ${generationId}] Input prompt: ${prompt}`);

    // Ultra-realistic anatomy prompt with micro-details
    const fullPrompt = `
      photorealistic portrait of ${prompt}, 
      (masterpiece, ultra-detailed, hyper-realistic:1.3), 8k resolution, sharp focus, cinematic lighting with natural shadows under breasts and between legs, 
      detailed skin texture with pores, freckles, and subtle stretch marks on hips and thighs, light sweat on collarbone, 
      natural sagging breasts with realistic weight and slight asymmetry, erect nipples with textured pink-brown areolas, detailed veins and goosebumps, 
      light natural pubic hair trimmed short, realistic labia majora and minora with natural folds and color variation, clitoris visible, no perfect symmetry, 
      micro-details like skin imperfections, stray hair strands, and fabric creases
    `.trim();

    const negativePrompt = `
      plastic skin, shiny doll skin, barbie anatomy, perfect symmetrical breasts, fake erect nipples, smooth airbrushed crotch, 
      no pubic hair or overly smooth vulva, deformed labia, fused folds, extra limbs or fingers on groin, 
      low detail skin, blurry anatomy, overexposed highlights, cartoonish proportions, mutated hands or feet, 
      jpeg artifacts, watermark, text, ugly, disfigured, morbid, extra limbs, poorly drawn face, bad hands, 
      score_6, score_5, score_4
    `.trim();
    
    console.log(`[Gen ${generationId}] Enhanced NSFW prompt: ${fullPrompt.substring(0, 150)}...`);

    try {
      // Import Replicate SDK
      const Replicate = require('replicate');
      const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

      // Run PONY XL model
      console.log(`[Gen ${generationId}] Starting PONY XL prediction...`);
      const output = await replicate.run("fofr/pony:3c4a8a1d0e0a4a4b9c4d5e6f7g8h9i0j", {
        input: {
          image: inputImageUrl,
          prompt: fullPrompt,
          negative_prompt: negativePrompt,
          strength: 0.7, // Good balance for img2img transformation
          num_inference_steps: 50, // High quality
          guidance_scale: 7.5, // Strong prompt adherence
          width: 1024,
          height: 1536
        }
      });

      if (!output || !Array.isArray(output) || output.length === 0) {
        console.error(`[Gen ${generationId}] No output from PONY XL:`, output);
        throw new Error('PONY XL did not return any images');
      }

      const imageUrl = output[0];
      console.log(`[Gen ${generationId}] PONY XL img2img generation complete: ${imageUrl}`);
      return imageUrl;

    } catch (error: any) {
      console.error(`[Gen ${generationId}] PONY XL img2img error:`, error);
      throw new Error(`PONY XL img2img generation failed: ${error.message}`);
    }
  }

  // Helper function to upload image to Runware for img2img
  async function uploadImageToRunware(imageUrl: string): Promise<string> {
    const RUNWARE_API_KEY = process.env.RUNWARE_API_KEY;
    if (!RUNWARE_API_KEY) {
      throw new Error("RUNWARE_API_KEY not configured");
    }

    try {
      // Fetch the image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
      }
      
      const arrayBuffer = await imageResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString('base64');
      
      // Upload to Runware
      const uploadPayload = {
        taskType: "imageUpload",
        taskUUID: crypto.randomUUID(),
        image: base64Image
      };

      const uploadResponse = await fetch("https://api.runware.ai/v1", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RUNWARE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify([uploadPayload])
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(`Runware upload error: ${error}`);
      }

      const uploadData = await uploadResponse.json();
      console.log('[Runware] Image upload response:', JSON.stringify(uploadData));
      
      if (!uploadData.data || !uploadData.data[0] || !uploadData.data[0].imageUUID) {
        throw new Error("Runware did not return imageUUID");
      }
      
      return uploadData.data[0].imageUUID;
    } catch (error: any) {
      throw new Error(`Failed to upload image to Runware: ${error.message}`);
    }
  }

  // Helper function to call Runware FLUX API with enhanced prompts
  async function callRunwareFlux(
    generationId: string,
    prompt: string,
    seedImageUUID?: string
  ): Promise<string> {
    const RUNWARE_API_KEY = process.env.RUNWARE_API_KEY;
    if (!RUNWARE_API_KEY) {
      throw new Error("RUNWARE_API_KEY not configured");
    }

    // Enhanced prompt system with FLUX-optimized quality boosters
    const qualityEnhancers = [
      "masterpiece quality",
      "ultra detailed",
      "photorealistic",
      "8k resolution",
      "professional photography",
      "sharp focus",
      "perfect lighting"
    ];

    // Build base enhanced prompt
    let enhancedPrompt = `${prompt}, ${qualityEnhancers.join(", ")}`;
    let negativePrompt = "blurry, low quality, distorted, deformed, ugly, bad anatomy, extra limbs, watermark, signature, text";

    // Add nudity and anatomical enhancements if nude/naked keywords detected
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes("nude") || lowerPrompt.includes("naked") || 
        lowerPrompt.includes("topless") || lowerPrompt.includes("bare")) {
      
      // Enhanced NSFW anatomical details for fully uncensored photorealistic results
      const naturalBodyEnhancers = [
        // Lighting and atmosphere
        "golden hour lighting", "soft natural light", "warm sunlight on skin",
        // Body physics and proportions
        "natural body proportions", "realistic weight distribution",
        "natural breast sagging with gravity", "realistic breast physics",
        // Skin texture and details
        "detailed skin pores", "natural skin texture", "micro skin details",
        "subtle stretch marks", "natural skin folds", "sweat on skin",
        // Explicit breast anatomy
        "fully exposed breasts", "natural breast shape", "realistic areola texture",
        "erect nipples", "detailed nipples", "textured areola", 
        "natural pink-brown nipple color", "no censorship on nipples",
        // Explicit genital anatomy
        "fully visible vulva", "detailed labia majora and minora",
        "realistic vulva anatomy", "natural genital details",
        "light natural pubic hair trimmed short", "no censorship on genitals",
        "detailed clitoris", "natural skin folds between legs",
        // Realism enhancers
        "photorealistic anatomy", "organic features", "natural imperfections",
        "realistic shadows", "anatomically accurate", "uncensored"
      ];
      
      enhancedPrompt += `, ${naturalBodyEnhancers.join(", ")}`;
      
      // Enhanced negative prompts for NSFW realism - prevent censorship
      negativePrompt += ", plastic skin, shiny skin, doll-like, barbie anatomy, perfect symmetry, fake nipples, smooth crotch, censored, blurred genitals, blurred nipples, airbrushed, cartoon, anime, 3d render, artificial, clothing covering breasts, clothing covering genitals, underwear, bra, panties";
    }

    // Build Runware request with safety checker disabled
    const requestPayload: any = {
      taskType: "imageInference",
      taskUUID: crypto.randomUUID(),
      model: "runware:101@1", // FLUX.1 [dev] - high quality uncensored model
      positivePrompt: enhancedPrompt,
      negativePrompt: negativePrompt,
      width: 1024,
      height: 1024,
      steps: 30,
      CFGScale: 4.0,
      numberResults: 1,
      checkNSFW: false  // DISABLE SAFETY CHECKER for fully uncensored NSFW content
    };

    // Add seed image if provided (img2img)
    if (seedImageUUID) {
      requestPayload["seedImage"] = seedImageUUID;
    }

    console.log(`[Gen ${generationId}] Calling Runware FLUX with prompt: ${enhancedPrompt.substring(0, 150)}...`);

    const response = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RUNWARE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([requestPayload])
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Runware API error: ${error}`);
    }

    const data = await response.json();
    console.log(`[Gen ${generationId}] Runware response:`, JSON.stringify(data));
    
    if (!data.data || !data.data[0] || !data.data[0].imageURL) {
      throw new Error("Runware did not return imageURL");
    }

    return data.data[0].imageURL;
  }

  // Helper function to call EternalAI uncensored-image API with enhanced prompts
  async function callEternalAIImage(
    generationId: string,
    prompt: string,
    type: "new" | "edit",
    imageBase64?: string
  ): Promise<string> {
    const ETERNALAI_API_KEY = process.env.ETERNALAI_API_KEY;
    if (!ETERNALAI_API_KEY) {
      throw new Error("ETERNALAI_API_KEY not configured");
    }

    const endpoint = "https://agentic.eternalai.org/uncensored-image";
    
    // Enhanced prompt system with hyper-realism and quality boosters
    const qualityEnhancers = [
      "(masterpiece, best quality, ultra-detailed, photorealistic:1.3)",
      "(8k, RAW photo, hyper-realistic, intricate details:1.2)",
      "perfect body proportions, anatomically correct",
      "sharp focus, cinematic lighting, soft shadows",
      "detailed skin texture, pores, micro-details"
    ];

    // Build base enhanced prompt
    let enhancedPrompt = `${prompt}, ${qualityEnhancers.join(", ")}`;
    let negativePrompt = "";

    // Add nudity and anatomical enhancements if nude/naked keywords detected
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes("nude") || lowerPrompt.includes("naked") || 
        lowerPrompt.includes("topless") || lowerPrompt.includes("bare")) {
      
      // Natural body enhancements for realistic anatomy
      const naturalBodyEnhancers = [
        // Lighting and texture
        "sunlight from side", "golden hour lighting",
        // Natural breast physics
        "natural sagging breasts with realistic weight",
        "natural breast shape with gravity",
        // Skin details
        "detailed skin pores", "subtle stretch marks on hips",
        "sweat on skin", "natural skin folds",
        "micro skin details",
        // Nipple details
        "erect nipples with textured areola",
        "natural pink-brown nipple color",
        "realistic areola texture",
        "no blur on nipples", "no censorship",
        // Pubic region details
        "light natural pubic hair trimmed short",
        "detailed labia majora and minora",
        "realistic vulva anatomy",
        "natural skin folds between legs",
        "no plastic shine on skin",
        "no perfect symmetry",
        // Shadows and depth
        "natural shadows under breasts",
        "natural shadows between legs",
        "sharp focus on chest and groin"
      ];
      
      enhancedPrompt += `, full frontal nudity, ${naturalBodyEnhancers.join(", ")}`;
      
      // Positive realism constraints (converted from negatives to work with chat-style API)
      const realismConstraints = [
        "realistic skin not plastic",
        "natural matte skin not shiny",
        "human skin not doll-like",
        "anatomically accurate not stylized",
        "asymmetric natural breasts",
        "organic nipples not artificial",
        "uncensored natural pubic area",
        "detailed vulva not smooth",
        "realistic proportions not deformed",
        "high detail skin not airbrushed",
        "natural lighting not overexposed",
        "photorealistic not cartoon",
        "not anime style",
        "not 3d render",
        "not wax figure"
      ];
      
      enhancedPrompt += `, ${realismConstraints.join(", ")}`;
    }

    // Build messages array
    const content: any[] = [];
    
    if (type === "edit" && imageBase64) {
      content.push({
        type: "image_url",
        image_url: {
          url: imageBase64,
          filename: "input.png"
        }
      });
    }
    
    content.push({
      type: "text",
      text: enhancedPrompt
    });

    const payload = {
      messages: [
        {
          role: "user",
          content
        }
      ],
      type
    };

    console.log(`[Gen ${generationId}] Calling EternalAI ${type} with enhanced prompt: ${enhancedPrompt.substring(0, 150)}...`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "x-api-key": ETERNALAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`EternalAI API error: ${error}`);
    }

    const data = await response.json();
    console.log(`[Gen ${generationId}] EternalAI response:`, JSON.stringify(data));
    
    const requestId = data.request_id;
    if (!requestId) {
      throw new Error("EternalAI did not return a request_id");
    }

    return requestId;
  }

  // Helper function to call EternalAI uncensored-image-to-video API
  async function callEternalAIVideo(
    generationId: string,
    prompt: string,
    imageBase64: string
  ): Promise<string> {
    const ETERNALAI_API_KEY = process.env.ETERNALAI_API_KEY;
    if (!ETERNALAI_API_KEY) {
      throw new Error("ETERNALAI_API_KEY not configured");
    }

    // Use the correct endpoint from Python reference code
    const endpoint = "https://agentic.eternalai.org/prompt";
    
    const payload = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: imageBase64,
                filename: "input.png"
              }
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }
      ],
      agent: "uncensored-image-to-video"  // Specify the agent instead of type
    };

    console.log(`[Gen ${generationId}] Calling EternalAI video generation with prompt: ${prompt}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "x-api-key": ETERNALAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`EternalAI Video API error: ${error}`);
    }

    const data = await response.json();
    console.log(`[Gen ${generationId}] EternalAI Video response:`, JSON.stringify(data));
    
    const requestId = data.request_id;
    if (!requestId) {
      throw new Error("EternalAI did not return a request_id for video");
    }

    return requestId;
  }

  // Helper function to poll EternalAI for completion
  async function pollEternalAIResult(
    generationId: string,
    requestId: string,
    resultEndpoint: string,
    isVideo: boolean = false,
    agent?: string
  ): Promise<string> {
    const ETERNALAI_API_KEY = process.env.ETERNALAI_API_KEY;
    if (!ETERNALAI_API_KEY) {
      throw new Error("ETERNALAI_API_KEY not configured");
    }

    console.log(`[Gen ${generationId}] Polling EternalAI for request_id: ${requestId}, isVideo: ${isVideo}, agent: ${agent}`);

    let attempts = 0;
    // Video takes longer: 5 minutes with 5-second intervals = 60 attempts
    // Image: 2 minutes with 2-second intervals = 60 attempts
    const maxAttempts = isVideo ? 60 : 60;
    const pollInterval = isVideo ? 5000 : 2000;
    const timeoutMinutes = isVideo ? 5 : 2;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      // Construct poll URL with proper query parameters
      const pollUrl = agent 
        ? `${resultEndpoint}?agent=${agent}&request_id=${requestId}`
        : `${resultEndpoint}?request_id=${requestId}`;
      
      const pollResponse = await fetch(pollUrl, {
        method: "GET",
        headers: {
          "accept": "application/json",
          "x-api-key": ETERNALAI_API_KEY
        }
      });

      if (!pollResponse.ok) {
        console.log(`[Gen ${generationId}] Poll attempt ${attempts + 1}/${maxAttempts} failed: ${pollResponse.statusText}`);
        attempts++;
        continue;
      }

      const pollData = await pollResponse.json();
      console.log(`[Gen ${generationId}] Poll ${attempts + 1}/${maxAttempts}:`, JSON.stringify(pollData));

      // Check for terminal failure states first
      if (pollData.status === "failed" || pollData.status === "error" || pollData.status === "rejected") {
        const errorMsg = pollData.error || pollData.message || pollData.error_message || 'Unknown error';
        console.error(`[Gen ${generationId}] EternalAI generation failed with status ${pollData.status}: ${errorMsg}`);
        throw new Error(`EternalAI generation failed: ${errorMsg}`);
      }

      // Check for completion
      if (pollData.status === "completed" || pollData.status === "success") {
        const resultUrl = pollData.result_url || pollData.result_image_url || pollData.result_video_url || pollData.output_url || pollData.url || pollData.result;
        if (resultUrl) {
          console.log(`[Gen ${generationId}] EternalAI generation completed: ${resultUrl}`);
          return resultUrl;
        }
      }
      
      // Still processing - continue polling
      attempts++;
    }
    
    throw new Error(`EternalAI generation timed out after ${timeoutMinutes} minutes`);
  }

  // Helper function to process generation with EternalAI API
  async function processGeneration(
    generationId: string,
    userId: number,
    type: string,
    prompt: string,
    inputFileUrl?: string,
    modelId?: string
  ) {
    console.log(`[Gen ${generationId}] processGeneration CALLED - type=${type}, hasFileUrl=${!!inputFileUrl}, modelId=${modelId}`);
    
    const ETERNALAI_API_KEY = process.env.ETERNALAI_API_KEY;
    if (!ETERNALAI_API_KEY) {
      throw new Error("ETERNALAI_API_KEY not configured");
    }
    console.log(`[Gen ${generationId}] Using EternalAI key (first 10 chars): ${ETERNALAI_API_KEY.substring(0, 10)}...`);

    try {
      // Update status to processing before starting API calls
      await storage.updateGenerationStatus(generationId, "processing", undefined);
      console.log(`[Gen ${generationId}] Status updated to processing`);

      if (type === "image") {
        // Higgsfield img2img REQUIRES an input image
        if (!inputFileUrl) {
          throw new Error("NSFW image generation requires an input image. Please upload a reference image first.");
        }
        
        console.log(`[Gen ${generationId}] Using Higgsfield/VidGen NSFW img2img`);
        
        // Call Higgsfield API with input image and prompt
        const imageUrl = await callHiggsfieldImg2Img(generationId, prompt, inputFileUrl);
        
        await storage.updateGenerationStatus(generationId, "completed", imageUrl);
        console.log(`[Gen ${generationId}] Higgsfield img2img completed: ${imageUrl}`);
        return;

      } else if (type === "video") {
        // Video generation with fal.ai wan-25-preview/image-to-video (requires reference image)
        console.log(`[Gen ${generationId}] Starting fal.ai WAN 2.5 image-to-video generation`);
        
        if (!inputFileUrl) {
          throw new Error("Video generation requires a reference image. Please upload an image first.");
        }

        const FAL_API_KEY = process.env.FAL_AI_API_KEY;
        if (!FAL_API_KEY) {
          throw new Error("FAL_AI_API_KEY not configured for video generation");
        }

        // Submit to fal.ai queue
        const submitRes = await fetch("https://queue.fal.run/fal-ai/wan-25-preview/image-to-video", {
          method: "POST",
          headers: {
            "Authorization": `Key ${FAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            prompt: prompt,
            image_url: inputFileUrl,
            enable_safety_checker: false,
          }),
        });

        if (!submitRes.ok) {
          const error = await submitRes.text();
          throw new Error(`fal.ai WAN 2.5 queue submission error: ${error}`);
        }

        const submitData = await submitRes.json();
        const requestId = submitData.request_id;
        if (!requestId) {
          throw new Error("fal.ai did not return a request_id");
        }
        console.log(`[Gen ${generationId}] fal.ai request submitted, request_id: ${requestId}`);

        // Poll for completion (max 5 minutes for video generation)
        const maxAttempts = 60;
        const pollInterval = 5000;
        let attempts = 0;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          attempts++;

          const statusRes = await fetch(
            `https://queue.fal.run/fal-ai/wan-25-preview/requests/${requestId}/status`,
            {
              headers: {
                "Authorization": `Key ${FAL_API_KEY}`,
              },
            }
          );

          if (!statusRes.ok) {
            const errorText = await statusRes.text();
            console.error(`[Gen ${generationId}] Status check failed: ${statusRes.status} - ${errorText}`);
            continue;
          }

          const statusData = await statusRes.json();
          console.log(`[Gen ${generationId}] Status: ${statusData.status} (attempt ${attempts}/${maxAttempts})`);

          if (statusData.status === "COMPLETED") {
            // Status endpoint only confirms completion - need to fetch actual result from response_url
            console.log(`[Gen ${generationId}] Video generation complete, fetching result...`);
            
            const resultRes = await fetch(statusData.response_url, {
              headers: {
                "Authorization": `Key ${FAL_API_KEY}`,
              },
            });
            
            if (!resultRes.ok) {
              const errorText = await resultRes.text();
              throw new Error(`Failed to fetch video result: ${resultRes.status} - ${errorText}`);
            }
            
            const resultData = await resultRes.json();
            console.log(`[Gen ${generationId}] Full result data:`, JSON.stringify(resultData, null, 2));
            
            const videoUrl = resultData.video?.url;
            if (!videoUrl) {
              throw new Error("fal.ai completed but did not return a video URL");
            }
            console.log(`[Gen ${generationId}] fal.ai WAN 2.5 video generation complete: ${videoUrl}`);
            await storage.updateGenerationStatus(generationId, "completed", videoUrl);
            return;
          } else if (statusData.status === "FAILED") {
            throw new Error(`fal.ai video generation failed: ${JSON.stringify(statusData.error || "Unknown error")}`);
          }
        }

        throw new Error("fal.ai video generation timed out after 5 minutes");

      } else if (type === "upscale") {
        // Keep ESRGAN upscaling from fal.ai for now
        console.log(`[Gen ${generationId}] Starting upscale with ESRGAN`);
        
        if (!inputFileUrl) {
          throw new Error("Input file required for upscaling");
        }

        const FAL_API_KEY = process.env.FAL_AI_API_KEY;
        if (!FAL_API_KEY) {
          throw new Error("FAL_AI_API_KEY not configured for upscaling");
        }

        const upscaleRes = await fetch("https://fal.run/fal-ai/esrgan", {
          method: "POST",
          headers: {
            "Authorization": `Key ${FAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            image_url: inputFileUrl,
            scale: 4,
            model: "RealESRGAN_x4plus",
            output_format: "png",
          }),
        });

        if (!upscaleRes.ok) {
          const error = await upscaleRes.text();
          throw new Error(`ESRGAN API error: ${error}`);
        }

        const upscaleData = await upscaleRes.json();
        const upscaledUrl = upscaleData.image?.url;
        if (!upscaledUrl) {
          throw new Error("ESRGAN API did not return a valid image URL");
        }
        console.log(`[Gen ${generationId}] ESRGAN upscale complete: ${upscaledUrl}`);

        await storage.updateGenerationStatus(generationId, "completed", upscaledUrl);
      }
    } catch (error: any) {
      console.error(`[Gen ${generationId}] Error:`, error.message);
      throw error;
    }
  }

  app.get("/api/generations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      const generations = await storage.getGenerationsByUser(user.id);
      res.json(generations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Promo code routes
  app.post("/api/promo/redeem", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      const { code } = redeemPromoCodeSchema.parse(req.body);

      // Normalize the code (trim whitespace and uppercase)
      const normalizedCode = code.trim().toUpperCase();

      // Check if promo code exists
      const promoCode = await storage.getPromoCode(normalizedCode);
      if (!promoCode) {
        return res.status(404).json({ message: "Invalid promo code" });
      }

      // Check if expired
      if (promoCode.expiresAt && new Date(promoCode.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Promo code has expired" });
      }

      // Check if user already redeemed
      const alreadyRedeemed = await storage.hasUserRedeemedPromo(user.id, normalizedCode);
      if (alreadyRedeemed) {
        return res.status(400).json({ message: "You have already redeemed this promo code" });
      }

      // Check usage limit (null maxUses = unlimited)
      if (promoCode.maxUses !== null && promoCode.usedCount >= promoCode.maxUses) {
        return res.status(400).json({ message: "Promo code usage limit reached" });
      }

      // Get current user
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Apply promo code
      await storage.updateUserLifetime(user.id, {
        lifetimeTier: promoCode.tier,
        monthlyRefillAmount: promoCode.monthlyRefill,
        lastRefillDate: new Date(),
      });

      // Add initial credits
      await storage.updateUserCredits(user.id, currentUser.credits + promoCode.initialCredits);

      // Increment usage and record redemption
      await storage.incrementPromoCodeUsage(normalizedCode);
      await storage.createPromoRedemption(user.id, normalizedCode);

      // Get updated user
      const updatedUser = await storage.getUser(user.id);
      
      res.json({ 
        message: "Promo code redeemed successfully",
        tier: promoCode.tier,
        credits: updatedUser?.credits,
        monthlyRefill: promoCode.monthlyRefill,
      });
    } catch (error: any) {
      console.error("[PROMO REDEEM ERROR]", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/promo/create", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Admin check - you can add admin field to users table later
      // For now, only specific email can create promo codes
      const user = req.user as any;
      if (user.email !== 'kyleeann@thevixenai.com') {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const promoData = insertPromoCodeSchema.parse(req.body);
      
      // Convert code to uppercase for consistency
      const codeToCreate = {
        ...promoData,
        code: promoData.code.toUpperCase(),
      };

      const promoCode = await storage.createPromoCode(codeToCreate);
      res.json(promoCode);
    } catch (error: any) {
      console.error("[PROMO CREATE ERROR]", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/promo/list", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Admin check
      const user = req.user as any;
      if (user.email !== 'kyleeann@thevixenai.com') {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const promoCodes = await storage.getAllPromoCodes();
      res.json(promoCodes);
    } catch (error: any) {
      console.error("[PROMO LIST ERROR]", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Prepaid customer admin routes
  app.post("/api/prepaid/add", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      if (user.email !== 'kyleeann@thevixenai.com') {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const customerData = insertPrepaidCustomerSchema.parse(req.body);
      const customer = await storage.createPrepaidCustomer({
        ...customerData,
        email: customerData.email.toLowerCase(),
      });
      
      res.json(customer);
    } catch (error: any) {
      console.error("[PREPAID ADD ERROR]", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/prepaid/list", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      if (user.email !== 'kyleeann@thevixenai.com') {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const customers = await storage.getAllPrepaidCustomers();
      res.json(customers);
    } catch (error: any) {
      console.error("[PREPAID LIST ERROR]", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/prepaid/:email", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = req.user as any;
      if (user.email !== 'kyleeann@thevixenai.com') {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.deletePrepaidCustomer(req.params.email);
      res.json({ message: "Prepaid customer deleted" });
    } catch (error: any) {
      console.error("[PREPAID DELETE ERROR]", error);
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
