// Bring-your-own-auth adapter for the asset manager.
// Replace this function with your provider's server-side session lookup.
// Return any truthy session object to allow the protected request, or null to deny it.
export async function getAssetManagerSession(options: {
  headers: Headers;
}): Promise<unknown | null> {
  void options;
  return null;
}
