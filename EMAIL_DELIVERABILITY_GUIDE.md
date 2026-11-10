# Email Deliverability Guide - Avoid Spam

## ✅ Code behavior

1. **Plain text plus HTML** — every send includes both parts, and link URLs are kept in the plain-text part.
2. **Working unsubscribe** — `{{unsubscribe_link}}` becomes SendGrid's subscription tag. If `SENDGRID_ASM_GROUP_ID` is set, the message also sends `asm.group_id` so the one-click ASM link resolves. A missing group id used to leave the raw tag in the body.
3. **Click tracking only with link branding** — links stay on your domain until SendGrid link branding is valid for that domain (or `SENDGRID_LINK_BRANDING=true`).
4. **Authenticated From only** — free mailboxes are rejected, and the From domain must be authenticated in SendGrid and have a DMARC record.
5. **Slower sends** — 500ms between messages in a batch, and 1.5s between batches.

---

## 🔧 REQUIRED: SendGrid Configuration (YOU MUST DO THIS)

### 1. **Domain Authentication (CRITICAL)**

**Why:** Without this, your emails will likely go to spam.

**Steps:**
1. Go to SendGrid Dashboard → Settings → Sender Authentication
2. Click "Authenticate Your Domain"
3. Add your domain (e.g., `deeptalent.in` or `yourdomain.com`)
4. Add the DNS records (CNAME, TXT) to your domain registrar
5. Wait for verification (15 minutes to 24 hours)

**DNS Records to Add:**
- SPF record: Proves you're authorized to send from this domain
- DKIM record: Cryptographic signature to verify email authenticity
- DMARC record: Policy for handling failed authentication

### 2. **Set Up Unsubscribe Groups**

**Steps:**
1. Go to SendGrid → Email API → Suppressions → Unsubscribe Groups
2. Create a group: "Marketing Emails" or "Recruitment Updates"
3. Note the Group ID
4. Set `SENDGRID_ASM_GROUP_ID` to that id in the server environment
5. Set `SENDGRID_POSTAL_ADDRESS` to the company street address so it is appended on every send

### 3. **Warm Up Your IP/Domain**

**Important:** Don't send 500 emails immediately!

**Recommended Schedule:**
- Day 1-2: Send 20-50 emails
- Day 3-4: Send 50-100 emails  
- Day 5-7: Send 100-200 emails
- Week 2: Send 200-500 emails
- Week 3+: Full capacity

### 4. **Configure Email Content Settings**

Go to SendGrid → Settings → Mail Settings:

✅ Enable:
- Event Webhook (track bounces, spam reports)
- Link Branding (required before click tracking helps; the app leaves click tracking off until branding is valid)
- Open Tracking

❌ Disable:
- Click Tracking in the SendGrid UI until Link Branding shows valid. The send API turns it off itself when branding is missing.
- Plain Content (the app already sends a plain-text part)
- Legacy Email Templates

---

## 📝 Best Practices for Email Content

### ✅ DO:

1. **Personalize emails**
   - Use {{name}} and {{university}}
   - Make content relevant

2. **Include clear sender info**
   - Use your real company name
   - Use a recognizable "From" email (e.g., `recruiting@deeptalent.in`)

3. **Add physical address**
   - Required by CAN-SPAM
   - Set `SENDGRID_POSTAL_ADDRESS` so the send API appends it on every message

4. **Clear unsubscribe link**
   - Use: `{{unsubscribe_link}}` in your templates
   - Make it visible (footer is fine)

5. **Good subject lines**
   - Avoid: "FREE!!!", "ACT NOW", "URGENT!!!"
   - Use: Professional, clear, personalized

6. **Optimize send times**
   - Best: Tuesday-Thursday, 10 AM - 2 PM
   - Avoid: Weekends, late nights

### ❌ DON'T:

1. **Spam trigger words**
   - Avoid: Free, Winner, Click here, Act now, Limited time
   - Avoid: Excessive punctuation!!!!
   - Avoid: ALL CAPS SUBJECT LINES

2. **Poor HTML**
   - Don't use only images (include text)
   - Don't use suspicious links
   - Don't use URL shorteners

3. **Bad practices**
   - Don't buy email lists
   - Don't send to unverified emails
   - Don't send the same content repeatedly

---

## 🔍 Monitor Your Sender Reputation

### Check Your Reputation:
1. **SendGrid Reputation**: Settings → Sender Authentication
2. **External Tools**:
   - https://www.mail-tester.com/
   - https://mxtoolbox.com/blacklists.aspx
   - https://www.senderscore.org/

### Key Metrics to Watch:
- **Bounce Rate**: Should be < 5%
- **Spam Complaint Rate**: Should be < 0.1%
- **Open Rate**: Should be > 15%
- **Unsubscribe Rate**: Should be < 2%

---

## 🚨 If Emails Still Go to Spam

### Immediate Actions:

1. **Test Your Email First**
   ```
   Send to: mail-tester.com
   Get a score (should be 8+/10)
   ```

2. **Check Blacklists**
   - Your domain might be blacklisted
   - Use: https://mxtoolbox.com/blacklists.aspx

3. **Verify SendGrid Settings**
   - Domain authenticated? ✅
   - SPF/DKIM passing? ✅
   - Dedicated IP warmed up? ✅

4. **Review Content**
   - Remove spam words
   - Add more text, less images
   - Include working unsubscribe link

5. **Start with High-Engagement Users**
   - Send to people likely to open/click first
   - This improves sender reputation

---

## 📧 Example Email Footer (Add This)

```html
<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #666;">
  <p>
    <strong>Deep Talent</strong><br>
    Your Company Address Here<br>
    City, State, ZIP
  </p>
  <p>
    You received this email because you signed up for recruitment updates.<br>
    <a href="{{unsubscribe_link}}" style="color: #0066cc;">Unsubscribe</a> | 
    <a href="https://deeptalent.in" style="color: #0066cc;">Visit our website</a>
  </p>
</div>
```

---

## 🎯 Quick Checklist Before Sending

- [ ] Domain authenticated on SendGrid
- [ ] SPF/DKIM records verified
- [ ] Unsubscribe link working
- [ ] Physical address in footer
- [ ] Content checked for spam words
- [ ] Tested on mail-tester.com (score 8+)
- [ ] Sender reputation good
- [ ] Not sending to purchased lists
- [ ] Starting with small batches (if new domain)
- [ ] Personalization working ({{name}}, etc.)

---

## 📞 Support

If emails still go to spam after following this guide:
1. Check SendGrid support docs
2. Contact SendGrid support
3. Consider dedicated IP (if sending >100k/month)
4. Review sender reputation tools

**Remember:** Building email reputation takes time. Be patient and follow best practices!
