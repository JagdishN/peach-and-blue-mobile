// Live test case for the LoginScreen "Send OTP" button's underlying call —
// imports the app's real requestOtp() (src/api/auth.ts -> src/api/client.ts)
// and calls it against the real production backend, exactly as the button's
// handleSendOtp() does. Not part of the normal CI/unit suite (no test
// runner is configured in this project yet) — run directly with:
//   npx tsx src/api/__tests__/requestOtp.live.test.ts +91XXXXXXXXXX
// This sends a REAL OTP via the live backend/MSG91 when the number exists.
const phoneNumber = process.argv[2];
if (!phoneNumber) {
  console.error('Usage: npx tsx src/api/__tests__/requestOtp.live.test.ts <phoneNumberWithCountryCode>');
  process.exit(1);
}

const run = async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://peachnblueapp.onrender.com';
  // RN/Metro global that client.ts checks; plain Node has no equivalent.
  // Dynamic import (not a static one) so this assignment runs first —
  // static imports are hoisted above all other code under ESM semantics.
  (globalThis as any).__DEV__ = false;
  const { requestOtp } = await import('../auth');
  const { ApiError } = await import('../client');

  const startedAt = Date.now();
  try {
    const result = await requestOtp(phoneNumber);
    console.log(`PASS (${Date.now() - startedAt}ms):`, result);
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    if (err instanceof ApiError) {
      console.error(`FAIL (${elapsed}ms): ApiError [${err.status}] ${err.message}`);
    } else {
      console.error(`FAIL (${elapsed}ms):`, err);
    }
    process.exit(1);
  }
};

run();
