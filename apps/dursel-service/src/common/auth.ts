import { verifyToken } from '@clerk/backend';
import { GraphQLError } from 'graphql';

/**
 * Who is calling, according to Clerk.
 *
 * The token is verified here rather than trusted from a header. This endpoint is reachable from
 * the open internet, so a caller-supplied user id would let anyone read or write anyone's rows.
 *
 * Returns null instead of throwing: an anonymous caller is a normal state that `me` reports as
 * null, and only the resolvers that actually need a user turn it into an error.
 */
export const authenticate = async (request: Request, env: Env): Promise<string | null> => {
  // Service call from the container.
  //
  // A render outlives the browser request that started it: it streams for up to three minutes,
  // far past the ~60s life of the session token that kicked it off, and by the time it finishes
  // the Next request scope is gone so no fresh token can be minted. The container therefore
  // proves it is the container and names the user it is acting for.
  //
  // The proof is the Clerk secret key, which both sides already hold and which never reaches a
  // browser. Anyone able to present it can already impersonate any user through Clerk's own API,
  // so honouring it here grants nothing that holding it did not already grant.
  const service = request.headers.get('X-Dursel-Service');
  if (service) {
    return safeEqual(service, env.CLERK_SECRET_KEY) ? request.headers.get('X-Dursel-User') : null;
  }

  const header = request.headers.get('Authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer ?? readCookie(request, '__session');
  if (!token) return null;

  try {
    const { sub } = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    return sub ?? null;
  } catch {
    // Expired or malformed tokens are the anonymous case, not a server fault.
    return null;
  }
};

/** Constant-time compare, so a wrong secret cannot be recovered by timing the rejection. */
const safeEqual = (a: string, b: string): boolean => {
  if (typeof b !== 'string' || a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);

  return diff === 0;
};

const readCookie = (request: Request, name: string): string | null => {
  const cookies = request.headers.get('Cookie');
  if (!cookies) return null;

  for (const part of cookies.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || null;
  }
  return null;
};

/** For resolvers that cannot do anything useful without a user. */
export const requireUser = (userId: string | null): string => {
  if (!userId) throw new GraphQLError('Not signed in', { extensions: { code: 'UNAUTHENTICATED' } });
  return userId;
};
