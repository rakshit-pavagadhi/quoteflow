import { PrismaClient } from '@prisma/client';
import { validateTransition, QuoteStatus } from '../stateMachine';

const prisma = new PrismaClient();

// Helper to generate reference codes
const generateRefCode = () => `QF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

export const resolvers = {
  Query: {
    quote: async (_: any, { id }: { id: string }) => {
      return await prisma.quote.findUnique({ where: { id } });
    },
    quotes: async (_: any, { status, limit = 50, offset = 0 }: { status?: string, limit?: number, offset?: number }) => {
      return await prisma.quote.findMany({
        where: status ? { status } : undefined,
        take: limit,
        skip: offset,
        orderBy: { updated_at: 'desc' }
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
      // Validate initial creation (null -> draft)
      validateTransition(null, 'draft');

      // Create quote and initial transition atomically
      return await prisma.$transaction(async (tx:any) => {
        const quote = await tx.quote.create({
          data: {
            ...input,
            reference_code: generateRefCode(),
            status: 'draft',
          }
        });

        await tx.quoteTransition.create({
          data: {
            quote_id: quote.id,
            from_status: null,
            to_status: 'draft',
            actor: input.created_by,
            note: 'Quote created',
          }
        });

        return quote;
      });
    },

    transitionQuote: async (_: any, { id, toStatus, actor, note }: { id: string, toStatus: QuoteStatus, actor: string, note?: string }) => {
      return await prisma.$transaction(async (tx:any) => {
        const quote = await tx.quote.findUnique({ where: { id } });
        if (!quote) throw new Error(`Quote \${id} not found`);

        // Important: Use state machine to validate transition
        validateTransition(quote.status as QuoteStatus, toStatus);

        // Update status and insert audit log
        const updatedQuote = await tx.quote.update({
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

        return updatedQuote;
      });
    },

    expireStaleQuotes: async () => {
      // Find all quotes in submitted or under_review state older than 7 days
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
          
          const expired = await prisma.$transaction(async (tx:any) => {
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
          console.error(`Failed to expire quote \${quote.id}:`, e);
        }
      }

      return expiredQuotes;
    }
  }
};