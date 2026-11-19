"use server";

import { signOut } from "@/auth";

/** Sign out and go back to the home page. */
export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
