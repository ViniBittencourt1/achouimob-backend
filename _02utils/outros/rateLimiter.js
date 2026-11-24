export async function rateLimit(ms = 2500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}