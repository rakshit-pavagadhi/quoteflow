import { gql } from '@apollo/client';

export const GET_QUOTES = gql`
  query GetQuotes {
    quotes { id reference_code origin destination cargo_description weight_kg proposed_rate currency status }
  }
`;

export const GET_QUOTE_HISTORY = gql`
  query GetQuoteHistory($quoteId: ID!) {
    quoteHistory(quoteId: $quoteId) { id from_status to_status actor note transitioned_at }
  }
`;

export const TRANSITION_QUOTE = gql`
  mutation TransitionQuote($id: ID!, $toStatus: QuoteStatus!, $actor: String!) {
    transitionQuote(id: $id, toStatus: $toStatus, actor: $actor) { id status }
  }
`;