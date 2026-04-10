const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Usage = require('../models/Usage');
const generateToken = require('../utils/generateToken');
const { sendEmail, emailVerificationTemplate, passwordResetTemplate } = require('../utils/emailService');
const { generateOTPWithExpiry } = require('../utils/otpService');

// Register user — sends email verification OTP, does NOT log in immediately
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Inline input validation — no external middleware needed
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.emailVerified) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const { otp, expiresAt } = generateOTPWithExpiry(10);

    let user;
    if (existingUser && !existingUser.emailVerified) {
      // Unverified account — refresh OTP and optionally update name/password
      existingUser.name = name;
      existingUser.password = password; // pre-save hook re-hashes
      existingUser.verificationOtp = otp;
      existingUser.verificationOtpExpires = expiresAt;
      user = existingUser;
    } else {
      // Create new user (not yet verified; subscription created after OTP confirmed)
      user = new User({
        name,
        email,
        password,          // pre-save hook hashes it
        emailVerified: false,
        verificationOtp: otp,
        verificationOtpExpires: expiresAt,
      });
    }
    await user.save();

    // Send verification email (non-blocking — don't fail registration if email fails)
    try {
      await sendEmail(email, '📧 Verify your StudentApp Email', emailVerificationTemplate(name, otp));
    } catch (emailErr) {
      console.error('⚠️  Verification email failed to send:', emailErr.message);
    }

    res.status(201).json({
      success: true,
      requiresVerification: true,
      message: 'Account created. Check your email for the verification code.',
      email,
    });
  } catch (error) {
    next(error);
  }
};

// Verify email with OTP — creates subscription/usage and logs the user in
exports.verifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.emailVerified) return res.status(400).json({ message: 'Email already verified' });
    if (!user.verificationOtp || user.verificationOtp !== otp) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }
    if (new Date() > user.verificationOtpExpires) {
      return res.status(400).json({ message: 'Verification code expired' });
    }

    // Mark as verified and clear OTP
    user.emailVerified = true;
    user.verificationOtp = null;
    user.verificationOtpExpires = null;

    // Create free subscription
    const subscription = new Subscription({ userId: user._id, plan: 'free', tokenLimit: 100 });
    await subscription.save();

    // Create usage tracker
    const usage = new Usage({ userId: user._id, tokenLimit: 100 });
    await usage.save();

    user.subscription = subscription._id;
    user.usage = usage._id;
    await user.save();

    const token = generateToken(user._id);
    console.log(`✅ Email verified for: ${email}`);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    next(error);
  }
};

// Resend email verification OTP
exports.resendVerificationOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.emailVerified) return res.status(400).json({ message: 'Email already verified' });

    const { otp, expiresAt } = generateOTPWithExpiry(10);
    user.verificationOtp = otp;
    user.verificationOtpExpires = expiresAt;
    await user.save();

    await sendEmail(email, '📧 New Verification Code - StudentApp', emailVerificationTemplate(user.name, otp));

    res.status(200).json({ success: true, message: 'New verification code sent to your email' });
  } catch (error) {
    next(error);
  }
};

// Initiate password reset — sends OTP to registered email
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    // Always return success to avoid email enumeration
    const user = await User.findOne({ email });
    if (user) {
      const { otp, expiresAt } = generateOTPWithExpiry(10);
      user.resetOtp = otp;
      user.resetOtpExpires = expiresAt;
      await user.save();
      try {
        await sendEmail(email, '🔐 Reset Your Password - StudentApp', passwordResetTemplate(user.name, otp));
      } catch (emailErr) {
        console.error('⚠️  Password reset email failed:', emailErr.message);
      }
    }
    res.status(200).json({ success: true, message: 'If that email is registered, a reset code has been sent.' });
  } catch (error) {
    next(error);
  }
};

// Reset password using OTP
exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP, and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (!user.resetOtp || user.resetOtp !== otp) {
      return res.status(400).json({ message: 'Invalid reset code' });
    }
    if (new Date() > user.resetOtpExpires) {
      return res.status(400).json({ message: 'Reset code has expired' });
    }

    // Setting plain text password — pre-save hook re-hashes it
    user.password = newPassword;
    user.resetOtp = null;
    user.resetOtpExpires = null;
    await user.save();

    console.log(`✅ Password reset for: ${email}`);
    res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    next(error);
  }
};

// Login user (local authentication)
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      console.log(`⚠️ Login attempt failed: User not found for email: ${email}`);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await user.matchPassword(password);
    
    if (!isPasswordValid) {
      console.log(`⚠️ Login attempt failed: Invalid password for email: ${email}`);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Ensure Usage record exists (fallback for users who didn't get one during registration)
    let usage = await Usage.findOne({ userId: user._id });
    if (!usage) {
      usage = new Usage({ 
        userId: user._id, 
        tokenLimit: 200 
      });
      await usage.save();
      console.log(`📊 Created missing Usage record for user: ${email}`);
    }

    // Ensure Subscription exists if missing
    let subscription = await Subscription.findOne({ userId: user._id });
    if (!subscription) {
      subscription = new Subscription({
        userId: user._id,
        plan: 'free',
        tokenLimit: 200,
      });
      await subscription.save();
      console.log(`📋 Created missing Subscription record for user: ${email}`);
    }

    console.log(`✅ Login successful for user: ${email}`);
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    next(error);
  }
};

// Google OAuth callback (placeholder - will be wired with actual Google strategy)
exports.googleAuthCallback = async (req, res, next) => {
  try {
    const { id, displayName, emails, photos } = req.user;

    let user = await User.findOne({ googleId: id });

    if (!user) {
      user = new User({
        googleId: id,
        name: displayName,
        email: emails[0].value,
        avatar: photos[0]?.value,
      });

      await user.save();

      // Create subscription and usage for new Google OAuth user
      const subscription = new Subscription({
        userId: user._id,
        plan: 'free',
        tokenLimit: 200,
      });

      await subscription.save();

      const usage = new Usage({
        userId: user._id,
        tokenLimit: 200,
      });

      await usage.save();

      user.subscription = subscription._id;
      user.usage = usage._id;
      await user.save();
    }

    const token = generateToken(user._id);

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    next(error);
  }
};

// Update streak — call once per day on login/mount
exports.updateStreak = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (!user.lastActiveDate) {
      // First ever activity
      user.streak = 1;
      user.lastActiveDate = todayUTC;
    } else {
      const lastUTC = new Date(Date.UTC(
        user.lastActiveDate.getUTCFullYear(),
        user.lastActiveDate.getUTCMonth(),
        user.lastActiveDate.getUTCDate()
      ));
      const diffDays = Math.round((todayUTC - lastUTC) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // Already updated today — return current streak without changes
        return res.status(200).json({ success: true, streak: user.streak, lastActiveDate: user.lastActiveDate });
      } else if (diffDays === 1) {
        // Consecutive day
        user.streak += 1;
        user.lastActiveDate = todayUTC;
      } else {
        // Streak broken
        user.streak = 1;
        user.lastActiveDate = todayUTC;
      }
    }

    await user.save();
    res.status(200).json({ success: true, streak: user.streak, lastActiveDate: user.lastActiveDate });
  } catch (error) {
    next(error);
  }
};

// Get current user
exports.getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('subscription');
    const usage = await Usage.findOne({ userId: req.user._id });

    res.status(200).json({
      success: true,
      user: {
        ...user.toObject(),
        streak: user.streak ?? 0,
        lastActiveDate: user.lastActiveDate ?? null,
      },
      usage: {
        totalTokens: usage?.totalTokens || 0,
        tokenLimit: usage?.tokenLimit || 200,
        remainingTokens: (usage?.tokenLimit || 200) - (usage?.totalTokens || 0),
      },
    });
  } catch (error) {
    next(error);
  }
};
