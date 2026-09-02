import { verifyToken } from '@clerk/backend';
import { GraphQLError } from 'graphql';

import { Role } from '@/types/generated';

/** Who is calling and what they may do. Both are read off the verified token, never a header. */
export interface Session {
  userId: string | null;
  role: Role;
}

const anonymous: Session = { userId: null, role: Role.User };

/**
 * Who is calling, according to Clerk.
 *
 * The token is verified here rather than trusted from a header. This endpoint is reachable from
 * the open internet, so a caller-supplied user id would let anyone read or write anyone's rows.
 *
 * Returns a null userId instead of throwing: an anonymous caller is a normal state that `me`
 * reports as null, and only the resolvers that actually need a user turn it into an error.
 */
export const authenticate = async (request: Request, env: Env): Promise<Session> => {
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
  //
  // Always a plain user: the container only ever records the outcome of a render, so handing it
  // admin would widen the secret's reach for nothing.
  const service = request.headers.get('X-Dursel-Service');
  if (service) {
    if (!safeEqual(service, env.CLERK_SECRET_KEY)) return anonymous;

    return { userId: request.headers.get('X-Dursel-User'), role: Role.User };
  }

  const header = request.headers.get('Authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer ?? readCookie(request, '__session');
  if (!token) return anonymous;

  try {
    const claims = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });

    return { userId: claims.sub ?? null, role: roleFrom(claims) };
  } catch {
    // Expired or malformed tokens are the anonymous case, not a server fault.
    return anonymous;
  }
};

/**
 * The caller's role, as the session token carries it.
 *
 * Clerk owns who is an admin — it is a value on their user's public metadata — and this reads
 * the copy that rides in on the signed token. That is what makes the token itself the thing
 * authorising the admin dashboard: the check costs no database read and no Clerk API call, it
 * cannot be forged without the signing key, and revoking someone takes effect on their next
 * token refresh rather than needing a row updated here.
 *
 * It needs one setting in the Clerk dashboard, under Sessions → Customize session token:
 *
 *   { "metadata": "{{user.public_metadata}}" }
 *
 * Clerk does not put public metadata in a session token by default. Until that claim is
 * configured no token carries a role and nobody is an admin, which is the safe direction to
 * fail. A template that maps the value straight to a top-level `role` claim works too.
 *
 * Anything that is not exactly ADMIN is a plain user, so a malformed or unexpected claim
 * demotes rather than promotes.
 */
const roleFrom = (claims: Record<string, unknown>): Role => {
  const metadata = claims.metadata as { role?: unknown } | null | undefined;
  const role = metadata?.role ?? claims.role;

  return role === Role.Admin ? Role.Admin : Role.User;
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

/**
 * For the resolvers that read across users. Returns the admin's own id, so a caller can use this
 * in place of requireUser rather than calling both.
 *
 * FORBIDDEN rather than a silent empty list: unlike a single render — where absent and forbidden
 * are deliberately indistinguishable so an id cannot be probed — the dashboard is a whole screen,
 * and a signed-in non-admin needs to be told it is not theirs rather than shown nothing.
 */
export const requireAdmin = ({ userId, role }: Session): string => {
  const id = requireUser(userId);
  if (role !== Role.Admin) throw new GraphQLError('Not an admin', { extensions: { code: 'FORBIDDEN' } });

  return id;
};
