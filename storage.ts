import { db } from "./db";
import { users, generations, promoCodes, promoCodeRedemptions, prepaidCustomers, bugReports, announcements, announcementResponses, type User, type InsertUser, type Generation, type InsertGeneration, type PromoCode, type InsertPromoCode, type PromoCodeRedemption, type PrepaidCustomer, type InsertPrepaidCustomer, type BugReport, type Announcement, type InsertAnnouncement, type UpdateAnnouncement, type AnnouncementResponse } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByStripeSubscriptionId(subscriptionId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserCredits(id: string, credits: number): Promise<User | undefined>;
  updateUserSubscription(id: string, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionTier?: string;
    subscriptionPrice?: number;
    subscriptionCredits?: number;
  }): Promise<User | undefined>;
  updateUserLifetime(id: string, data: {
    lifetimeTier: string;
    monthlyRefillAmount: number;
    lastRefillDate: Date;
  }): Promise<User | undefined>;
  updateLastViewedAnnouncements(id: string): Promise<User | undefined>;
  getUnreadAnnouncementCount(userId: string): Promise<number>;
  getAllUsers(): Promise<User[]>;
  
  // Generation methods
  createGeneration(generation: InsertGeneration & { userId: string }): Promise<Generation>;
  getGeneration(id: string): Promise<Generation | undefined>;
  getGenerationsByUser(userId: string): Promise<Generation[]>;
  updateGenerationStatus(id: string, status: string, fileUrl?: string): Promise<Generation | undefined>;
  
  // Promo code methods
  createPromoCode(promoCode: InsertPromoCode): Promise<PromoCode>;
  getPromoCode(code: string): Promise<PromoCode | undefined>;
  incrementPromoCodeUsage(code: string): Promise<PromoCode | undefined>;
  createPromoRedemption(userId: string, code: string): Promise<PromoCodeRedemption>;
  hasUserRedeemedPromo(userId: string, code: string): Promise<boolean>;
  getAllPromoCodes(): Promise<PromoCode[]>;
  
  // Prepaid customer methods
  createPrepaidCustomer(customer: InsertPrepaidCustomer): Promise<PrepaidCustomer>;
  getPrepaidCustomer(email: string): Promise<PrepaidCustomer | undefined>;
  markPrepaidCustomerClaimed(email: string): Promise<PrepaidCustomer | undefined>;
  getAllPrepaidCustomers(): Promise<PrepaidCustomer[]>;
  deletePrepaidCustomer(email: string): Promise<void>;
  
  // Bug report methods
  createBugReport(data: { userId: string; userEmail: string; type: string; message: string }): Promise<BugReport>;
  getUserBugReportsSince(userId: string, since: Date): Promise<BugReport[]>;
  submitBugReportWithReward(userId: string, userEmail: string, type: string, message: string): Promise<{
    newCreditBalance: number;
    creditsAwarded: number;
    error?: string;
  }>;
  
  // Announcement methods
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  getAnnouncements(): Promise<Announcement[]>;
  getAnnouncement(id: string): Promise<Announcement | undefined>;
  updateAnnouncement(id: string, data: UpdateAnnouncement): Promise<Announcement | undefined>;
  deleteAnnouncement(id: string): Promise<void>;
  
  // Announcement response methods
  createAnnouncementResponse(data: { announcementId: string; userId: string; userEmail: string; response: string }): Promise<AnnouncementResponse>;
  getAnnouncementResponses(announcementId: string): Promise<AnnouncementResponse[]>;
  getUserResponseForAnnouncement(announcementId: string, userId: string): Promise<AnnouncementResponse | undefined>;
  getAllAnnouncementResponsesWithDetails(): Promise<Array<AnnouncementResponse & { announcementTitle: string }>>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async getUserByStripeSubscriptionId(subscriptionId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeSubscriptionId, subscriptionId)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserCredits(id: string, credits: number): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ credits })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserSubscription(id: string, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionTier?: string;
    subscriptionPrice?: number;
    subscriptionCredits?: number;
  }): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserLifetime(id: string, data: {
    lifetimeTier: string;
    monthlyRefillAmount: number;
    lastRefillDate: Date;
  }): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateLastViewedAnnouncements(id: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ lastViewedAnnouncements: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUnreadAnnouncementCount(userId: string): Promise<number> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return 0;

    const allAnnouncements = await db.select().from(announcements);
    
    if (!user.lastViewedAnnouncements) {
      // User never viewed announcements, all are unread
      return allAnnouncements.length;
    }

    // Count announcements created after user's last view
    const unreadCount = allAnnouncements.filter(
      announcement => new Date(announcement.createdAt) > new Date(user.lastViewedAnnouncements!)
    ).length;

    return unreadCount;
  }

  // Generation methods
  async createGeneration(generation: InsertGeneration & { userId: string }): Promise<Generation> {
    const [gen] = await db.insert(generations).values(generation).returning();
    return gen;
  }

  async getGeneration(id: string): Promise<Generation | undefined> {
    const [gen] = await db.select().from(generations).where(eq(generations.id, id)).limit(1);
    return gen;
  }

  async getGenerationsByUser(userId: string): Promise<Generation[]> {
    // Limit to 50 most recent to avoid database storage limits
    return db.select().from(generations).where(eq(generations.userId, userId)).orderBy(desc(generations.createdAt)).limit(50);
  }

  async updateGenerationStatus(id: string, status: string, fileUrl?: string): Promise<Generation | undefined> {
    const updateData: any = { status };
    if (fileUrl) {
      updateData.fileUrl = fileUrl;
    }
    const [gen] = await db
      .update(generations)
      .set(updateData)
      .where(eq(generations.id, id))
      .returning();
    return gen;
  }

  // Promo code methods
  async createPromoCode(promoCode: InsertPromoCode): Promise<PromoCode> {
    const [code] = await db.insert(promoCodes).values(promoCode).returning();
    return code;
  }

  async getPromoCode(code: string): Promise<PromoCode | undefined> {
    const [promoCode] = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
    return promoCode;
  }

  async incrementPromoCodeUsage(code: string): Promise<PromoCode | undefined> {
    const [promoCode] = await db
      .update(promoCodes)
      .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
      .where(eq(promoCodes.code, code))
      .returning();
    return promoCode;
  }

  async createPromoRedemption(userId: string, code: string): Promise<PromoCodeRedemption> {
    const [redemption] = await db.insert(promoCodeRedemptions).values({
      userId,
      promoCode: code,
    }).returning();
    return redemption;
  }

  async hasUserRedeemedPromo(userId: string, code: string): Promise<boolean> {
    const [redemption] = await db
      .select()
      .from(promoCodeRedemptions)
      .where(and(
        eq(promoCodeRedemptions.userId, userId),
        eq(promoCodeRedemptions.promoCode, code)
      ))
      .limit(1);
    return !!redemption;
  }

  async getAllPromoCodes(): Promise<PromoCode[]> {
    return db.select().from(promoCodes);
  }

  // Prepaid customer methods
  async createPrepaidCustomer(customer: InsertPrepaidCustomer): Promise<PrepaidCustomer> {
    const [prepaid] = await db.insert(prepaidCustomers).values(customer).returning();
    return prepaid;
  }

  async getPrepaidCustomer(email: string): Promise<PrepaidCustomer | undefined> {
    const [customer] = await db.select().from(prepaidCustomers).where(eq(prepaidCustomers.email, email.toLowerCase())).limit(1);
    return customer;
  }

  async markPrepaidCustomerClaimed(email: string): Promise<PrepaidCustomer | undefined> {
    const [customer] = await db
      .update(prepaidCustomers)
      .set({ claimed: true })
      .where(eq(prepaidCustomers.email, email.toLowerCase()))
      .returning();
    return customer;
  }

  async getAllPrepaidCustomers(): Promise<PrepaidCustomer[]> {
    return db.select().from(prepaidCustomers);
  }

  async deletePrepaidCustomer(email: string): Promise<void> {
    await db.delete(prepaidCustomers).where(eq(prepaidCustomers.email, email.toLowerCase()));
  }

  // Bug report methods
  async createBugReport(data: { userId: string; userEmail: string; type: string; message: string }): Promise<BugReport> {
    const [report] = await db.insert(bugReports).values(data).returning();
    return report;
  }

  async getUserBugReportsSince(userId: string, since: Date): Promise<BugReport[]> {
    return db.select()
      .from(bugReports)
      .where(and(
        eq(bugReports.userId, userId),
        sql`${bugReports.createdAt} >= ${since}`
      ));
  }

  async submitBugReportWithReward(userId: string, userEmail: string, type: string, message: string): Promise<{
    newCreditBalance: number;
    creditsAwarded: number;
    error?: string;
  }> {
    // Use a transaction to make this operation atomic
    return await db.transaction(async (tx) => {
      // Lock the user row to prevent concurrent modifications
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!user) {
        return { newCreditBalance: 0, creditsAwarded: 0, error: 'USER_NOT_FOUND' };
      }

      // Check rate limits within the transaction
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentReports = await tx
        .select()
        .from(bugReports)
        .where(and(
          eq(bugReports.userId, userId),
          sql`${bugReports.createdAt} >= ${twentyFourHoursAgo}`
        ));

      // Enforce max 3 reports per day
      if (recentReports.length >= 3) {
        return { newCreditBalance: user.credits, creditsAwarded: 0, error: 'RATE_LIMIT' };
      }

      // Insert the bug report
      await tx.insert(bugReports).values({
        userId,
        userEmail,
        type,
        message,
      });

      // Award credits only for the first report of the day
      let creditsAwarded = 0;
      let newCreditBalance = user.credits;

      if (recentReports.length === 0) {
        // Use SQL atomic increment to prevent stale value issues
        const [updatedUser] = await tx
          .update(users)
          .set({ credits: sql`${users.credits} + 2` })
          .where(eq(users.id, userId))
          .returning();

        creditsAwarded = 2;
        newCreditBalance = updatedUser.credits;
      }

      return { newCreditBalance, creditsAwarded };
    });
  }

  // Announcement methods
  async createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement> {
    const [newAnnouncement] = await db.insert(announcements).values({
      ...announcement,
      updatedAt: new Date(),
    }).returning();
    return newAnnouncement;
  }

  async getAnnouncements(): Promise<Announcement[]> {
    return db.select().from(announcements).orderBy(
      desc(announcements.isPinned),
      desc(announcements.createdAt)
    );
  }

  async getAnnouncement(id: string): Promise<Announcement | undefined> {
    const [announcement] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    return announcement;
  }

  async updateAnnouncement(id: string, data: UpdateAnnouncement): Promise<Announcement | undefined> {
    const [announcement] = await db
      .update(announcements)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning();
    return announcement;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  // Announcement response methods
  async createAnnouncementResponse(data: {
    announcementId: string;
    userId: string;
    userEmail: string;
    response: string;
  }): Promise<AnnouncementResponse> {
    const [response] = await db.insert(announcementResponses).values(data).returning();
    return response;
  }

  async getAnnouncementResponses(announcementId: string): Promise<AnnouncementResponse[]> {
    return db
      .select()
      .from(announcementResponses)
      .where(eq(announcementResponses.announcementId, announcementId))
      .orderBy(desc(announcementResponses.createdAt));
  }

  async getUserResponseForAnnouncement(announcementId: string, userId: string): Promise<AnnouncementResponse | undefined> {
    const [response] = await db
      .select()
      .from(announcementResponses)
      .where(and(
        eq(announcementResponses.announcementId, announcementId),
        eq(announcementResponses.userId, userId)
      ))
      .limit(1);
    return response;
  }

  async getAllAnnouncementResponsesWithDetails(): Promise<Array<AnnouncementResponse & { announcementTitle: string }>> {
    const results = await db
      .select({
        id: announcementResponses.id,
        announcementId: announcementResponses.announcementId,
        userId: announcementResponses.userId,
        userEmail: announcementResponses.userEmail,
        response: announcementResponses.response,
        createdAt: announcementResponses.createdAt,
        announcementTitle: announcements.title,
      })
      .from(announcementResponses)
      .leftJoin(announcements, eq(announcementResponses.announcementId, announcements.id))
      .orderBy(desc(announcementResponses.createdAt));
    
    return results as Array<AnnouncementResponse & { announcementTitle: string }>;
  }
}

export const storage = new DatabaseStorage();
