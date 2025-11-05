# ThinkReview - Cross-Browser OAuth Testing Checklist

## Before Testing
- [ ] Code updated to latest
- [ ] Cloud function online: https://us-central1-thinkgpt.cloudfunctions.net/exchangeGoogleCode
- [ ] OAuth callback online: https://thinkgpt.web.app/auth/callback

## Expected Behavior (ALL Browsers)
✅ Click "Sign in with Google"  
✅ OAuth popup opens (500x600)  
✅ User signs in with Google  
✅ Popup auto-closes  
✅ User profile displays  

## Test on Chrome
1. [ ] `chrome://extensions/` → Developer mode ON
2. [ ] "Load unpacked" → select `gitlab-MR-Reviews` folder
3. [ ] Go to a GitLab merge request
4. [ ] Click extension icon or sign in
5. [ ] OAuth popup opens
6. [ ] Sign in with Google
7. [ ] Popup closes, profile shows
8. [ ] Click "Review this code"
9. [ ] AI review generates successfully
10. [ ] Review count increments
11. [ ] Sign out works

## Test on Microsoft Edge ⭐ PRIMARY
1. [ ] `edge://extensions/` → Developer mode ON
2. [ ] "Load unpacked" → select `gitlab-MR-Reviews` folder
3. [ ] Go to GitLab merge request
4. [ ] Click sign in
5. [ ] **Verify**: OAuth popup opens (500x600)
6. [ ] Sign in with Google
7. [ ] **Verify**: Popup auto-closes
8. [ ] **Verify**: Profile displays (name, email, picture)
9. [ ] Click "Review this code"
10. [ ] **Verify**: AI review works
11. [ ] **Verify**: Review count tracks correctly
12. [ ] Close and reopen → still logged in ✅
13. [ ] Sign out → logged out ✅

## Test on Brave (Optional)
1. [ ] `brave://extensions/` → same as Edge
2. [ ] Verify OAuth popup works
3. [ ] Verify AI review works

## Test on Opera (Optional)
1. [ ] `opera://extensions/` → same as Edge
2. [ ] Verify OAuth popup works
3. [ ] Verify AI review works

## Feature Testing

### ✅ Authentication
- [ ] Sign in via OAuth popup
- [ ] Profile displays correctly
- [ ] Sign out clears session
- [ ] Session persists after closing extension

### ✅ AI Code Review
- [ ] Can trigger code review
- [ ] Review generates correctly
- [ ] Review count increments
- [ ] Review history preserved

### ✅ Subscription Status
- [ ] Free plan shows correctly
- [ ] Premium plan shows correctly (if applicable)
- [ ] Review limits enforced correctly

### ✅ GitLab Integration
- [ ] Works on gitlab.com
- [ ] Works on custom GitLab domains (if configured)
- [ ] Patch viewer works
- [ ] Review prompt displays correctly

## Troubleshooting

### Popup blocked?
- Click popup blocker icon
- Allow popups for extension

### OAuth timeout?
```bash
# Check cloud function
curl https://us-central1-thinkgpt.cloudfunctions.net/exchangeGoogleCode

# Check logs
nvm use 18
firebase functions:log -n 50 exchangeGoogleCode
```

### Can't see background logs?
1. Go to extensions page
2. Find ThinkReview
3. Click "Inspect views: service worker"
4. Watch console during sign in

## Success Criteria

✅ **Chrome**: OAuth popup works, login succeeds  
✅ **Edge**: OAuth popup works, login succeeds ⭐  
✅ **Profile**: Name, email, picture display  
✅ **AI Review**: Code review works  
✅ **Review Count**: Tracks correctly  
✅ **Persistence**: Stays logged in  
✅ **Sign Out**: Works correctly  

## Quick Debug Commands

### Check stored data:
```javascript
chrome.storage.local.get(['oauth_user', 'oauth_token', 'user', 'userData'], console.log)
```

### Clear data (reset):
```javascript
chrome.storage.local.remove(['oauth_user', 'oauth_token', 'user', 'userData'], () => console.log('Cleared'))
```

### Test OAuth URL manually:
```
https://accounts.google.com/o/oauth2/v2/auth?client_id=201038166512-5mvrq96lgdqvtb7dr6clrpd8ckc856un.apps.googleusercontent.com&redirect_uri=https://thinkgpt.web.app/auth/callback&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent
```

## Expected Console Logs

**Background script:**
```
[background] Received code to exchange: ...
[background] Calling Cloud Function for token exchange
[background] Token exchange response: {success: true}
```

**Sign-in component:**
```
[GoogleSignIn] Starting universal web OAuth login
[GoogleSignIn] Opening OAuth popup
[GoogleSignIn] OAuth code received
[GoogleSignIn] Signed in with Google via web OAuth
```

## Testing Time

- **Chrome**: ~5 minutes
- **Edge**: ~10 minutes ⭐ (test thoroughly!)
- **Others**: ~5 minutes each (optional)

**Total**: 15-20 minutes for Chrome + Edge

---

**Priority**: Test on Microsoft Edge first - that's the main issue!  
**Goal**: Verify OAuth login works on all Chromium browsers, not just Chrome

