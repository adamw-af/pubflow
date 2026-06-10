/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as lib_recurrence from "../lib/recurrence.js";
import type * as media from "../media.js";
import type * as notifications from "../notifications.js";
import type * as oauth from "../oauth.js";
import type * as posts from "../posts.js";
import type * as publisher from "../publisher.js";
import type * as publishing_index from "../publishing/index.js";
import type * as publishing_instagram from "../publishing/instagram.js";
import type * as publishing_linkedin from "../publishing/linkedin.js";
import type * as publishing_types from "../publishing/types.js";
import type * as publishing_x from "../publishing/x.js";
import type * as socialAccounts from "../socialAccounts.js";
import type * as subscriptions from "../subscriptions.js";
import type * as tokenRefresh from "../tokenRefresh.js";
import type * as users from "../users.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  crons: typeof crons;
  dashboard: typeof dashboard;
  http: typeof http;
  "lib/encryption": typeof lib_encryption;
  "lib/r2": typeof lib_r2;
  "lib/recurrence": typeof lib_recurrence;
  media: typeof media;
  notifications: typeof notifications;
  oauth: typeof oauth;
  posts: typeof posts;
  publisher: typeof publisher;
  "publishing/index": typeof publishing_index;
  "publishing/instagram": typeof publishing_instagram;
  "publishing/linkedin": typeof publishing_linkedin;
  "publishing/types": typeof publishing_types;
  "publishing/x": typeof publishing_x;
  socialAccounts: typeof socialAccounts;
  subscriptions: typeof subscriptions;
  tokenRefresh: typeof tokenRefresh;
  users: typeof users;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
};
