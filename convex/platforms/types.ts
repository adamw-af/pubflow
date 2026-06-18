// ---------------------------------------------------------------------------
// Platform adapter registry — shared types (ADR 0006)
//
// Each Platform is one self-contained module exporting a `PlatformAdapter`.
// A single registry maps `id → adapter`; the schema union, OAuth callback,
// publisher, token refresh, and the connect/composer UI all derive from it.
// This file holds no platform-specific logic and no Convex-server or React
// imports, so it is safe to import from both the Convex backend and the
// browser frontend.
// ---------------------------------------------------------------------------

/** Declarative description of what a Platform accepts. Drives validation + UI. */
export type PlatformCapability = {
  /** Maximum caption length in characters. */
  maxCaptionLength: number;
  /** Whether at least one media item is required to publish. */
  mediaRequired: boolean;
  /** Whether the media must be a video. */
  videoRequired: boolean;
  /** Maximum video duration in seconds, when the Platform accepts video. */
  maxVideoDurationSec?: number;
  /** Allowed aspect ratios (e.g. "1:1", "9:16"); undefined = unrestricted. */
  allowedAspectRatios?: string[];
  /** Whether more than one image may be attached (carousel/gallery). */
  multiImage: boolean;
  /** Maximum number of media items per Post. */
  maxMediaCount: number;
  /** Whether a title is required (YouTube). */
  titleRequired: boolean;
  /** Whether a privacy/disclosure setting applies (TikTok). */
  privacyDisclosureApplies: boolean;
};

/** Everything an adapter needs to publish a single Post Variant. */
export type PublishPayload = {
  accessToken: string;
  caption: string;
  /** Public CDN URLs of media items. */
  mediaUrls: string[];
  /** The Platform's account id (Instagram business id, LinkedIn member, etc.). */
  platformAccountId: string;
};

/** Result of a publish attempt. ADR 0007 will add an in-progress shape. */
export type PublishResult =
  | { success: true; platformPostId: string }
  | { success: false; error: string };

/** Tokens + identity resolved from an OAuth code exchange. */
export type TokenResult = {
  platformAccountId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
};

/** Result of refreshing an access token. */
export type RefreshResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

export type AuthUrlArgs = {
  state: string;
  /** The platform's redirect_uri (this app's OAuth callback). */
  callbackUrl: string;
  /** PKCE challenge, for platforms that use PKCE (X). */
  codeChallenge?: string;
};

export type ExchangeArgs = {
  code: string;
  /** PKCE verifier, for platforms that use PKCE (X). */
  codeVerifier?: string;
  callbackUrl: string;
};

/** OAuth half of an adapter. */
export type OAuthAdapter = {
  /** Whether this Platform's authorization flow uses PKCE. */
  usesPKCE?: boolean;
  /** Build the authorization URL the user is redirected to. */
  authUrl: (args: AuthUrlArgs) => string;
  /** Exchange an authorization code for tokens + account identity. */
  exchangeCode: (args: ExchangeArgs) => Promise<TokenResult>;
  /** Refresh an access token. Throws if the Platform does not support it. */
  refreshToken: (refreshToken: string) => Promise<RefreshResult>;
};

/** A single Platform, defined in one module. */
export type PlatformAdapter = {
  /** Stable id used as the discriminant everywhere (schema, routes, lookups). */
  id: string;
  /** Human-facing name, e.g. "X (Twitter)". */
  displayName: string;
  /** Icon key the frontend maps to a component (keeps this descriptor pure data). */
  icon: string;
  /** Short tagline shown beside the platform in the connect UI. */
  description: string;
  capability: PlatformCapability;
  oauth: OAuthAdapter;
  publish: (payload: PublishPayload) => Promise<PublishResult>;
};
