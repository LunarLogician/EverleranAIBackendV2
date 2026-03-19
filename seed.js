const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Subscription = require('./models/Subscription');
const Usage = require('./models/Usage');

async function seedTestUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if test user exists
    let user = await User.findOne({ email: 'test@example.com' });
    
    if (user) {
      console.log('Test user already exists');
      await mongoose.disconnect();
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);

    // Create test user
    user = new User({
      name: 'Test Student',
      email: 'test@example.com',
      password: hashedPassword,
    });

    await user.save();
    console.log('✅ Test user created:', user.email);

    // Create subscription
    const subscription = new Subscription({
      userId: user._id,
      plan: 'free',
      tokenLimit: 10000,
    });
    await subscription.save();

    // Create usage tracker
    const usage = new Usage({
      userId: user._id,
      tokenLimit: 10000,
    });
    await usage.save();

    // Update user
    user.subscription = subscription._id;
    user.usage = usage._id;
    await user.save();

    console.log('\n📝 Test Credentials:');
    console.log('Email: test@example.com');
    console.log('Password: password123');

    await mongoose.disconnect();
    console.log('\n✅ Seeding complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedTestUser();
