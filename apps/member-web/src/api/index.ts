import { HttpMemberApi, type MemberApi } from "./client";
import { DemoMemberApi } from "./demo-client";

export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === "true" || import.meta.env.VITE_DEMO_MODE === "local";
export const isLocalDemoMode = import.meta.env.VITE_DEMO_MODE === "local";

const storedToken = window.localStorage.getItem("handshake.ownerToken");

export const memberApi: MemberApi = isLocalDemoMode
  ? new DemoMemberApi()
  : new HttpMemberApi(import.meta.env.VITE_API_BASE_URL ?? "/v1", storedToken);

if (isDemoMode && storedToken !== null) memberApi.setToken(storedToken);

export type { MemberApi } from "./client";
export { ApiError } from "./client";
export * from "./types";
