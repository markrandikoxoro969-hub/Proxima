# Final phone test checklist

Do this on a **real phone** after deploying (docs/DEPLOY.md), ideally one Android (Chrome) and one
iPhone (Safari). It takes about 15 minutes. Tick each box; if something fails, note the phone,
browser and what happened.

Open your live address, e.g. `https://proxima.vercel.app`.

## 1. Landing page

- [ ] The page appears quickly (under ~2–3 seconds on mobile data), with no blank white flash.
- [ ] The headline goes from blurry to sharp, word by word. Stars drift in the background.
- [ ] Nothing sticks out sideways: swipe left/right on the page, and it shouldn't move.
- [ ] The top bar stays visible while scrolling and doesn't cover text after tapping a section.
- [ ] Scrolling feels like normal phone scrolling (no lag, no "floaty" feeling).
- [ ] Sections fade in as you scroll; none stay invisible.
- [ ] **Slides:** swipe left/right → they change; the **← →** buttons work; the counter shows `02 / 05` etc.
- [ ] **Live demo:** tap a suggestion → the reply streams in word by word. Type your own question → **Send**.
- [ ] **Stop** while it's answering → it stops. **New demo** clears it.
- [ ] **FAQ:** tap a question → it opens; tap another → the first closes.
- [ ] The sun/moon button switches light/dark. Both look right (readable text, no invisible buttons).
- [ ] Pinch-zoom works (the old file blocked it).

## 2. Sign in and chat

- [ ] **Open app** → Google sign-in → you come back to `/app`.
- [ ] First time: the onboarding shows (typing logo → name → age → loading).
- [ ] Type a message: the **keyboard doesn't cover** the message box, and the page doesn't jump around.
- [ ] The reply streams smoothly. While it streams you can scroll up to read, and it doesn't drag you back down.
- [ ] Ask for code (e.g. “Write a Python hello world”) → the code block is coloured → **Copy** → paste somewhere → it works.
- [ ] **Microphone** button → allow microphone → speak → your words appear in the box.
      _(iPhone: Safari supports this on recent iOS versions. If the button is missing, that browser doesn't support voice input.)_
- [ ] **Attach** a small `.txt` or `.py` file → send → Proxima talks about its content.
- [ ] Try a file over 100 KB or an image → a friendly message explains why it's refused.
- [ ] **☰ menu** → sidebar opens → chats listed → open an older chat → **rename** it → **delete** another.
- [ ] **New chat** works. **Export** (top right) downloads Markdown/JSON.
- [ ] Turn on **airplane mode** → send → a clear “offline” message. Turn it off → **Try again** works.
- [ ] Close the browser, open the site again → you're still signed in and your chats are there.

## 3. Settings and other pages

- [ ] `/settings`: change name, theme and particles → **Save changes** → “Settings saved.”
- [ ] **Download all (Markdown)** saves a file you can open.
- [ ] `/privacy` and `/terms` are easy to read and links work.
- [ ] Open a wrong address like `/hello` → the **404 “Lost in space”** page with working buttons.

## 4. Install as an app

- [ ] **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app** → the black PROXIMA
      planet icon appears → opening it starts at the chat, full screen, without the browser bar.
- [ ] **iPhone (Safari):** Share button → **Add to Home Screen** → icon appears → opens full screen.
- [ ] In the installed app, the top (notch/status bar) and bottom (home bar) don't cover any buttons.
- [ ] Turn on airplane mode → open the installed app → **“You're offline”** page with **Try again**.

## 5. Phone settings that change the site

- [ ] **Larger text** (phone Settings → Display → Font size → bigger) → text grows and nothing overlaps.
- [ ] **Reduce motion** (iPhone: Settings → Accessibility → Motion → Reduce Motion;
      Android: Settings → Accessibility → Remove animations) → the site still works, without animations.
- [ ] **Screen reader** quick test (iPhone VoiceOver / Android TalkBack): swipe through the home page
      → buttons and links are read with sensible names.
- [ ] Rotate the phone to landscape → the layout still works.

## 6. Speed score (optional, on a computer)

Open **https://pagespeed.web.dev** → paste your address → **Analyze** → look at the **Mobile** tab.
Goals: **Performance 90+**, **LCP under 2.5 s**, **CLS under 0.1**, **INP under 200 ms**.
(Scores vary a little each run. Run it 2–3 times. The first run after a deploy can be slower.)
