import { gql } from 'graphql-tag';

export const commonTypeDefs = gql`
  # Scalars
  scalar Timestamp

  # Enums
  enum Response {
    SUCCESS
  }
`;
