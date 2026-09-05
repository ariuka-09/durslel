import { gql } from 'graphql-tag';

export const userTypeDefs = gql`
  """
  What a person is allowed to do. Clerk owns this — it lives in their public metadata and rides
  in on the session token — and the users table only mirrors it, so nothing here can grant it.
  """
  enum Role {
    USER
    ADMIN
  }

  """
  What a person is paying for. FREE is the default and the only tier nobody buys; the rest are
  granted by a confirmed Wire payment and last 30 days from it.

  Read from User.subscription, which reports FREE once the paid period has run out — the stored
  tier is not cleared on expiry, so a lapsed subscriber keeps their history and their old tier
  reappears if they pay again.
  """
  enum SubscriptionTier {
    FREE
    BASIC
    PRO
    STUDIO
  }

  """
  A signed-in person. The id is Clerk's, so it is the same value a session carries and needs no
  translation. Name, email and role are a cache of Clerk's copy and may lag it.
  """
  type User {
    id: ID!
    email: String
    firstName: String
    lastName: String
    role: Role!
    """
    The tier in force right now: FREE once subscriptionUntil has passed, whatever was bought
    until then.
    """
    subscription: SubscriptionTier!
    """When the paid period ends. Null for someone who has never paid."""
    subscriptionUntil: Timestamp
    createdAt: Timestamp!
    updatedAt: Timestamp!
  }

  """
  A payment Wire has confirmed. paymentIntent is the id of the intent that paid for it, and is
  what makes activation exactly-once: Wire can deliver the same event more than once, and each
  delivery must not buy another 30 days.
  """
  input ActivateSubscriptionInput {
    tier: SubscriptionTier!
    paymentIntent: String!
  }

  input UpsertUserInput {
    email: String
    firstName: String
    lastName: String
  }

  type Query {
    """
    The caller. Null when the request carries no valid session, which is how an anonymous
    visitor is reported rather than an error.
    """
    me: User
    """
    Everyone who has signed in, newest first — the admin dashboard's left-hand list. Admin only,
    checked against the session token rather than against the role stored on the row.
    """
    users: [User!]!
  }

  type Mutation {
    """
    Creates the caller's row or refreshes it from Clerk. Safe to call on every sign-in: the id
    and the role both come from the verified session, never from the input, so this can neither
    write another user nor promote one.
    """
    upsertUser(input: UpsertUserInput!): User!
    """
    Records a paid subscription for the user the caller is acting for, extending any period still
    running rather than replacing it.

    Callable only by the deployment itself, with the shared secret — never from a browser, where
    it would be a button that grants a paid tier for free. The webhook that calls it acts on a
    signature-verified Wire event, long after the buyer's own session has gone.
    """
    activateSubscription(input: ActivateSubscriptionInput!): User!
  }
`;
