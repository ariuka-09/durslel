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
  A signed-in person. The id is Clerk's, so it is the same value a session carries and needs no
  translation. Name, email and role are a cache of Clerk's copy and may lag it.
  """
  type User {
    id: ID!
    email: String
    firstName: String
    lastName: String
    role: Role!
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
  }
`;
