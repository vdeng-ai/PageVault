export async function copyText(value: string): Promise<void> {
  // Write during the click's user activation; missing APIs also reject for UI feedback.
  await navigator.clipboard.writeText(value);
}
