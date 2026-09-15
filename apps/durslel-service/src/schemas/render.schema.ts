import { gql } from 'graphql-tag';

export const renderTypeDefs = gql`
  enum RenderStatus {
    """
    Accepted, but waiting for a free render slot. The renderer runs a fixed number of manim
    processes at once because manim is single-threaded, so a burst queues rather than all
    starting at once and finishing later. Distinct from PENDING so a client can say why nothing
    is happening yet, and so it does not start counting a stall against a job that has not begun.
    """
    QUEUED
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
  What the renderer reports about a job it owns: the outcome once manim has finished or failed,
  and before that the move from QUEUED to PENDING as a slot frees. Every field except status is
  about an outcome and stays null on the intermediate writes.
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
    Renders newest first. Defaults to the caller's own; an admin may name another user, which is
    the admin dashboard's one query. Anyone else asking for someone else's is refused.
    """
    getRenders(creatorId: ID): [Render!]!
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

    lang is the language of the video's on-screen text: "mn" for Mongolian, anything else (or
    nothing) for English.
    """
    startRender(prompt: String!, lang: String): Render!
    """
    Records where a render has got to. Called by the renderer, not by a browser: it runs after the
    request that started it is long gone, so it authenticates as the service. Usually the final
    outcome, but also the QUEUED and PENDING transitions while a job waits for a slot.
    """
    completeRender(jobId: String!, input: CompleteRenderInput!): Render!
    updateRender(id: ID!, input: UpdateRenderInput!): Render!
    deleteRender(id: ID!): Response!
  }
`;
