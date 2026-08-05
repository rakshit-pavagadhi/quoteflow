import { PrismaClient } from '@prisma/client';
import { validateTransition, QuoteStatus } from '../stateMachine';
import { getOrSet, invalidatePattern } from '../cache';

const prisma = new PrismaClient();

const generateRefCode = () => `QF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

export const resolvers = {
  Query: {
    quote: async (_: any, { id }: { id: string }) => {
      return await getOrSet(`quote:${id}`, 30, async () => {
        return await prisma.quote.findUnique({ where: { id } });
      });
    },
    quotes: async (_: any, { status, limit = 50, offset = 0 }: { status?: string, limit?: number, offset?: number }) => {
      const cacheKey = `quotes:${status || 'all'}:${limit}:${offset}`;
      return await getOrSet(cacheKey, 30, async () => {
        return await prisma.quote.findMany({
          where: status ? { status } : undefined,
          take: limit,
          skip: offset,
          orderBy: { updated_at: 'desc' }
        });
      });
    },
    quoteHistory: async (_: any, { quoteId }: { quoteId: string }) => {
      return await prisma.quoteTransition.findMany({
        where: { quote_id: quoteId },
        orderBy: { transitioned_at: 'asc' }
      });
    }
  },
  
  Mutation: {
    createQuote: async (_: any, { input }: { input: any }) => {
      validateTransition(null, 'draft');

      const quote = await prisma.$transaction(async (tx: any) => {
        const q = await tx.quote.create({
          data: {
            ...input,
            reference_code: generateRefCode(),
            status: 'draft',
          }
        });

        await tx.quoteTransition.create({
          data: {
            quote_id: q.id,
            from_status: null,
            to_status: 'draft',
            actor: input.created_by,
            note: 'Quote created',
          }
        });

        return q;
      });

      // Invalidate list cache
      await invalidatePattern('quotes:*');

      return quote;
    },

    transitionQuote: async (_: any, { id, toStatus, actor, note }: { id: string, toStatus: QuoteStatus, actor: string, note?: string }) => {
      const updatedQuote = await prisma.$transaction(async (tx: any) => {
        const quote = await tx.quote.findUnique({ where: { id } });
        if (!quote) throw new Error(`Quote ${id} not found`);

        validateTransition(quote.status as QuoteStatus, toStatus);

        const updated = await tx.quote.update({
          where: { id },
          data: { status: toStatus }
        });

        await tx.quoteTransition.create({
          data: {
            quote_id: id,
            from_status: quote.status,
            to_status: toStatus,
            actor,
            note
          }
        });

        return updated;
      });

      // Invalidate list caches and specific quote cache
      await invalidatePattern('quotes:*');
      await invalidatePattern(`quote:${id}`);

      return updatedQuote;
    },

    expireStaleQuotes: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const staleQuotes = await prisma.quote.findMany({
        where: {
          status: { in: ['submitted', 'under_review'] },
          updated_at: { lt: sevenDaysAgo }
        }
      });

      const expiredQuotes = [];

      for (const quote of staleQuotes) {
        try {
          validateTransition(quote.status as QuoteStatus, 'expired');
          
          const expired = await prisma.$transaction(async (tx: any) => {
            const updated = await tx.quote.update({
              where: { id: quote.id },
              data: { status: 'expired' }
            });

            await tx.quoteTransition.create({
              data: {
                quote_id: quote.id,
                from_status: quote.status,
                to_status: 'expired',
                actor: 'SYSTEM',
                note: 'Automatically expired due to staleness'
              }
            });
            return updated;
          });
          expiredQuotes.push(expired);
        } catch (e) {
          console.error(`Failed to expire quote ${quote.id}:`, e);
        }
      }

      // Invalidate caches if any quotes expired
      if (expiredQuotes.length > 0) {
        await invalidatePattern('quotes:*');
        for (const q of expiredQuotes) {
          await invalidatePattern(`quote:${q.id}`);
        }
      }

      return expiredQuotes;
    }
  }
};