import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  enum QuoteStatus {
    draft
    submitted
    under_review
    approved
    rejected
    expired
  }

  type Quote {
    id: ID!
    reference_code: String!
    origin: String!
    destination: String!
    cargo_description: String!
    weight_kg: Float!
    proposed_rate: Float!
    currency: String!
    status: QuoteStatus!
    created_by: String!
    created_at: String!
    updated_at: String!
  }

  type QuoteTransition {
    id: ID!
    quote_id: ID!
    from_status: QuoteStatus
    to_status: QuoteStatus!
    actor: String!
    note: String
    transitioned_at: String!
  }

  input CreateQuoteInput {
    origin: String!
    destination: String!
    cargo_description: String!
    weight_kg: Float!
    proposed_rate: Float!
    currency: String!
    created_by: String!
  }

  type Query {
    quote(id: ID!): Quote
    quotes(status: QuoteStatus, limit: Int, offset: Int): [Quote!]!
    quoteHistory(quoteId: ID!): [QuoteTransition!]!
  }

  type Mutation {
    createQuote(input: CreateQuoteInput!): Quote!
    transitionQuote(id: ID!, toStatus: QuoteStatus!, actor: String!, note: String): Quote!
    expireStaleQuotes: [Quote!]!
  }
`;