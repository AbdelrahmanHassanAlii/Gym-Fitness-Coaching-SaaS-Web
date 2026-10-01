import "server-only";

import { createServerEnv } from "./env.shared";

export const serverEnv = createServerEnv({
  APP_ENV: process.env.APP_ENV,
  NODE_ENV: process.env.NODE_ENV,
});
