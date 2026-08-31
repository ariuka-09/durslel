import { gql } from 'graphql-tag';

export const renderTypeDefs = gql`
  """
  One finished render. jobId is the storage key its video and source live under; url is the
  address that video was served at.
  """
  type Render {
    id: ID!
    jobId: String!
    title: String!
    url: String!
    prompt: String!
    sceneClass: String
    attempts: Int!
    durationMs: Int
    creatorId: ID!
    """
    Resolved from creatorId. Being able to ask for the render and its author in one round trip is
    most of the reason this is GraphQL rather than two REST calls.
    """
    creator: User
    createdAt: Timestamp!
    updatedAt: Timestamp!
  }

  input CreateRenderInput {
    jobId: String!
    title: String!
    url: String!
    prompt: String!
    sceneClass: String
    attempts: Int
    durationMs: Int
  }

  input UpdateRenderInput {
    title: String
  }

  type Query {
    """
    The caller's own renders, newest first. Scoped to the session rather than taking a user
    argument, so one person cannot list another's by guessing an id.
    """
    getRenders: [Render!]!
    getRender(id: ID!): Render
    """
    Look up by storage key. What the app has in hand when reopening a render from its video URL.
    """
    getRenderByJobId(jobId: String!): Render
  }

  type Mutation {
    createRender(input: CreateRenderInput!): Render!
    updateRender(id: ID!, input: UpdateRenderInput!): Render!
    deleteRender(id: ID!): Response!
  }
`;
