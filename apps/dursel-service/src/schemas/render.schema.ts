import { gql } from 'graphql-tag';

export const renderTypeDefs = gql`
  enum RenderStatus {
    PENDING
    OK
    FAILED
  }

  """
  A render. The row exists from the moment one is requested, so a job still running and a job
  that failed are both visible — status says which, and it is what a client polls on.
  """
  type Render {
    id: ID!
    jobId: String!
    title: String!
    """
    Null until the render finishes. The address its video is served at.
    """
    url: String
    status: RenderStatus!
    """
    Why it failed, when it did. Null on every other status.
    """
    error: String
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

  """
  What the renderer reports back once manim has finished, or failed.
  """
  input CompleteRenderInput {
    url: String
    status: RenderStatus!
    error: String
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
    """
    Requests a render and returns immediately with a PENDING row. manim takes up to three
    minutes, far longer than a request should be held open, so the client polls getRender until
    status leaves PENDING rather than waiting on this call.
    """
    startRender(prompt: String!): Render!
    """
    Records the outcome. Called by the renderer, not by a browser: it runs after the request that
    started it is long gone, so it authenticates as the service.
    """
    completeRender(jobId: String!, input: CompleteRenderInput!): Render!
    updateRender(id: ID!, input: UpdateRenderInput!): Render!
    deleteRender(id: ID!): Response!
  }
`;
