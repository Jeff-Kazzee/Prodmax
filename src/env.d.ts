/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Set by src/middleware.ts for /api/* routes with a valid session. */
    ctx?: {
      user: {
        id: string;
        email: string;
        name: string;
        avatarSeed: string;
        createdAt: number;
        updatedAt: number;
      };
      session: {
        id: string;
        userId: string;
        createdAt: number;
        expiresAt: number;
      };
    };
  }
}
