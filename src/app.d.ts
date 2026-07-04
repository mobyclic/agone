/// <reference types="@sveltejs/kit" />
/// <reference types="svelte" />

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: 'DB_DOWN' | 'FORBIDDEN' | string;
    }
    interface Locals {
      /** Utilisateur connecté (session), ou null. */
      user: {
        id: string;
        email: string;
        first_name?: string;
        last_name?: string;
        full_name?: string;
        slug?: string;
        avatar_url?: string;
        role: import('$lib/roles').Role;
        email_verified: boolean;
      } | null;
    }
    interface PageData {
      user?: App.Locals['user'];
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
