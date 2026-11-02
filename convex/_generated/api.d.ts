/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as demo from "../demo.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_hmac from "../lib/hmac.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_validate from "../lib/validate.js";
import type * as lib_verify from "../lib/verify.js";
import type * as loans from "../loans.js";
import type * as n8n from "../n8n.js";
import type * as reminders from "../reminders.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  demo: typeof demo;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/hmac": typeof lib_hmac;
  "lib/limits": typeof lib_limits;
  "lib/notify": typeof lib_notify;
  "lib/validate": typeof lib_validate;
  "lib/verify": typeof lib_verify;
  loans: typeof loans;
  n8n: typeof n8n;
  reminders: typeof reminders;
  tools: typeof tools;
  users: typeof users;
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

export declare const components: {};
