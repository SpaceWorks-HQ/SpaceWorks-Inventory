/** Why self-checkout is unavailable in a space, for the page a member opens; null when it is on. */
export function selfCheckoutOff(space: { lendingEnabled: boolean; selfCheckoutEnabled: boolean }): { title: string; body: string; catalogue: boolean } | null {
  if (!space.lendingEnabled) {
    return { title: "Lending is switched off", body: "This space isn't lending tools or parts right now. Ask the desk when lending opens again.", catalogue: false };
  }
  if (!space.selfCheckoutEnabled) {
    return { title: "Self-checkout is switched off", body: "In this space everything is handed over at the desk. Request what you need from the catalogue and collect it there.", catalogue: true };
  }
  return null;
}
