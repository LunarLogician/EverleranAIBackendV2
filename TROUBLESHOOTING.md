# StudentApp - Troubleshooting Guide

## Issues Fixed

### ✅ 500 Error on `GET /api/chat/history`
**Problem:** Frontend was calling `/chat/history` but backend didn't have this endpoint.

**Solution:** 
- Added new `getHistory` endpoint in `chatController.js`
- Updated `chatRoutes.js` to register the endpoint at `GET /chat/history`
- **Important:** Route ordering was fixed - `/history` comes BEFORE `/:chatId` to prevent route conflicts

### ✅ Response Data Structure Mismatch
**Problem:** Frontend wasn't properly extracting response data from axios responses.

**Solution:**
- Updated `Chat.jsx` to properly handle axios response structure
- Fixed `loadChatHistory()`, `loadDocuments()`, `handleSendMessage()`, and `handleFileUpload()`
- All endpoints now handle `response.data` correctly

### ✅ Login 401 Error - Causes & Solutions

#### Possible Causes:
1. **User not registered** - Account doesn't exist in database
2. **Wrong password** - Entered password doesn't match hashed password
3. **Wrong email** - Email doesn't exist in database

#### Solution Steps:

**Step 1: Verify Database Connection**
```bash
# Check if MongoDB is running
npm run start  # This should connect to MongoDB
```

**Step 2: Check Server Logs**
Look at console output when login attempt fails. You should see:
```
⚠️ Login attempt failed: User not found for email: user@example.com
```
or
```
⚠️ Login attempt failed: Invalid password for email: user@example.com
```

**Step 3: Register a New User First**
1. Go to Register page
2. Fill in:
   - Name: `Test User`
   - Email: `test@example.com`
   - Password: `password123`
3. Click Register

**Step 4: Login with Registered Credentials**
1. Use the EXACT email and password from registration
2. If error persists, check the server logs

---

## Required Environment Setup

### Backend (.env file)
Create a `.env` file in the project root:
```env
# Database
MONGODB_URI=mongodb://localhost:27017/studentapp
DATABASE_NAME=studentapp

# JWT
JWT_SECRET=your_secret_key_here
JWT_EXPIRE=7d

# Cloudinary (for file uploads)
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Frontend
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000

# Claude API
CLAUDE_API_KEY=your_claude_api_key

# Server
PORT=5000
NODE_ENV=development
```

### Frontend (.env file)
The frontend connects to the backend at `http://localhost:5000` - this is hardcoded in [src/services/api.js](StudentApp-Frontend/src/services/api.js)

---

## Testing Checklist

### 1. **Backend Server**
```bash
cd /home/zubair/Downloads/StudentApp
npm install
npm start
# Expected: Server running on http://localhost:5000
# Check: GET http://localhost:5000/health returns { status: 'OK' }
```

### 2. **Frontend Server**
```bash
cd /home/zubair/Downloads/StudentApp/StudentApp-Frontend
npm install
npm run dev
# Expected: Frontend running on http://localhost:3000
```

### 3. **Test Registration Flow**
```
1. Navigate to http://localhost:3000
2. Click "Register"
3. Fill in form with unique email and password
4. Click "Register" button
5. Check browser console for Success message
```

### 4. **Test Login Flow**
```
1. Navigate to http://localhost:3000
2. Click "Login"
3. Use credentials from step 3
4. Check browser console for Success message
5. Verify redirected to Dashboard
```

### 5. **Test Chat History**
```
1. After login, go to Chat page
2. Check browser console for any errors
3. You should see empty chat history initially (no error)
4. Send a test message
5. Message should appear in chat
```

---

## Common Error Messages & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized on login` | Invalid credentials | Verify email/password, check if user is registered |
| `500 Internal Server Error on /chat/history` | Endpoint not found | Apply the fixes above |
| `Cannot read property 'data' of undefined` | Response structure mismatch | Already fixed in Chat.jsx |
| `CORS error` | Frontend/Backend CORS mismatch | Check CORS_ORIGIN in .env |
| `JWT error: invalid token` | Token expired or malformed | Clear localStorage and login again |

---

## Debugging Tips

### 1. **Check Server Logs**
The backend logs detailed information:
```
✅ Login successful for user: test@example.com
🔵 [directChat] Request received
📄 [directChat] Document ID provided: ...
```

### 2. **Browser DevTools**
- **Network Tab:** Check request/response for each API call
- **Console Tab:** Look for JavaScript errors
- **Application Tab:** Check localStorage for token

### 3. **Clear Browser Cache & LocalStorage**
```javascript
// Run in browser console
localStorage.clear();
location.reload();
```

### 4. **Test API Directly**
```bash
# Test health endpoint
curl http://localhost:5000/health

# Test register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"pass123"}'

# Test login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass123"}'
```

---

## Next Steps

1. **Ensure MongoDB is running:**
   ```bash
   # Check MongoDB status
   systemctl status mongod
   # Or start it
   mongod
   ```

2. **Ensure all environment variables are set in `.env`**

3. **Clear browser localStorage and try again:**
   - Open DevTools → Application → localStorage
   - Delete all items
   - Refresh page

4. **Check API endpoints are working:**
   - Use `INSOMNIA` or `Postman` to test endpoints
   - See [API_TESTING.md](API_TESTING.md)

---

## Files Modified in This Fix

- ✅ [controllers/chatController.js](controllers/chatController.js) - Added `getHistory` function
- ✅ [routes/chatRoutes.js](routes/chatRoutes.js) - Added `/history` endpoint
- ✅ [controllers/authController.js](controllers/authController.js) - Improved error logging
- ✅ [StudentApp-Frontend/src/pages/Chat.jsx](StudentApp-Frontend/src/pages/Chat.jsx) - Fixed response handling

---

**Last Updated:** March 16, 2026
