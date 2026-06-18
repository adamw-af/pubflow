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
  /** Whether video is accepted at all. Undefined = accepted (the v1 default). */
  videoSupported?: boolean;
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

/** Redirect-OAuth authentication (LinkedIn, Instagram, X). */
export type OAuthAdapter = {
  /** Discriminant: this Platform connects via a redirect OAuth flow. */
  kind: "oauth";
  /** Whether this Platform's authorization flow uses PKCE. */
  usesPKCE?: boolean;
  /** Build the authorization URL the user is redirected to. */
  authUrl: (args: AuthUrlArgs) => string;
  /** Exchange an authorization code for tokens + account identity. */
  exchangeCode: (args: ExchangeArgs) => Promise<TokenResult>;
  /** Refresh an access token. Throws if the Platform does not support it. */
  refreshToken: (refreshToken: string) => Promise<RefreshResult>;
};

/** One credential field the connect UI should prompt for. */
export type CredentialField = {
  /** Key the value is submitted under (e.g. "identifier", "appPassword"). */
  name: string;
  /** Human-facing label shown in the connect form. */
  label: string;
  /** Input type — `password` masks the value. */
  type: "text" | "password";
  /** Optional placeholder/hint shown in the field. */
  placeholder?: string;
};

export type CredentialConnectArgs = {
  /** The submitted credential values, keyed by `CredentialField.name`. */
  credentials: Record<string, string>;
};

/**
 * Credential authentication (Bluesky / AT Protocol app passwords). There is no
 * redirect: the user submits credentials directly and the adapter exchanges
 * them for tokens + account identity in one call.
 */
export type CredentialsAdapter = {
  /** Discriminant: this Platform connects via submitted credentials. */
  kind: "credentials";
  /** Fields the connect UI prompts for. */
  fields: CredentialField[];
  /** Exchange submitted credentials for tokens + account identity. */
  connect: (args: CredentialConnectArgs) => Promise<TokenResult>;
  /** Refresh an access token. Throws if the Platform does not support it. */
  refreshToken: (refreshToken: string) => Promise<RefreshResult>;
};

/**
 * The authentication half of an adapter — a Platform connects either via a
 * redirect OAuth flow or via submitted credentials. Both expose `refreshToken`
 * so token refresh stays uniform across the registry (ADR 0006).
 */
export type AuthAdapter = OAuthAdapter | CredentialsAdapter;

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
  auth: AuthAdapter;
  publish: (payload: PublishPayload) => Promise<PublishResult>;
};
