import type { UserId } from "@/contracts/common/ids";

export const authClientTypes = ["WEB", "MOBILE", "API"] as const;
export type AuthClientType = (typeof authClientTypes)[number];

export const webRefreshCookieName = "__Secure-gym_refresh";
export const webRefreshCookiePath = "/api/v1/auth";

export interface SafeAuthUserDto {
  id: UserId;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface LoginRequestDto {
  identifier: string;
  password: string;
  clientType: "WEB";
}

export interface AuthTokenResponseDto {
  accessToken: string;
  refreshToken?: string;
  user: SafeAuthUserDto;
  restrictedUntilVerified: boolean;
}

export const mfaFactorTypes = ["TOTP", "RECOVERY_CODE"] as const;
export type MfaFactorType = (typeof mfaFactorTypes)[number];

export interface MfaRequiredResponseDto {
  status: "MFA_REQUIRED";
  mfaChallengeToken: string;
  availableMethods: MfaFactorType[];
}

export type LoginResponseDto = AuthTokenResponseDto | MfaRequiredResponseDto;

export interface MfaLoginVerifyRequestDto {
  mfaChallengeToken: string;
  factorType: MfaFactorType;
  credential: string;
}

export interface WebRefreshRequestDto {
  clientType: "WEB";
}

export interface AuthSuccessDto {
  success: true;
  accessToken?: string;
  recoveryCodes?: string[];
}

const authClientTypeSet = new Set<string>(authClientTypes);

export function isAuthClientType(
  value: string | null | undefined,
): value is AuthClientType {
  return typeof value === "string" && authClientTypeSet.has(value);
}
