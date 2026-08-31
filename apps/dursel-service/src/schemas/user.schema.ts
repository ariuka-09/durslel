import { gql } from 'graphql-tag';

export const userTypeDefs = gql`
  """
  A signed-in person. The id is Clerk's, so it is the same value a session carries and needs no
  translation. Name and email are a cache of Clerk's copy and may lag it.
  """
  type User {
    id: ID!
    email: String
    firstName: String
    lastName: String
    createdAt: Timestamp!
    updatedAt: Timestamp!
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
  }

  type Mutation {
    """
    Creates the caller's row or refreshes it from Clerk. Safe to call on every sign-in: the id
    comes from the verified session, never from the input, so this cannot write another user.
    """
    upsertUser(input: UpsertUserInput!): User!
  }
`;
