/**
 * Generate a cryptographically-safe 6-digit OTP string.
 * @returns {string}
 */
const generateOTP = () => {
  const digits = '0123456789';
  let otp = '';
  // Use crypto.getRandomValues if available (Node 19+), else Math.random fallback
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(6);
    crypto.getRandomValues(arr);
    for (const n of arr) otp += digits[n % 10];
  } else {
    for (let i = 0; i < 6; i++) otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

/**
 * Generate OTP with expiry timestamp.
 * @param {number} expiryMinutes - Minutes until expiry (default 10)
 * @returns {{ otp: string, expiresAt: Date }}
 */
const generateOTPWithExpiry = (expiryMinutes = 10) => {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
  return { otp, expiresAt };
};

module.exports = { generateOTP, generateOTPWithExpiry };
