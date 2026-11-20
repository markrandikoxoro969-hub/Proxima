import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_UPDATED } from "@/lib/legal";
import { LIMITS } from "@/lib/limits";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `What ${site.name} stores, why, and how to download or delete your data.`,
  alternates: { canonical: "/privacy" },
};

/*
 * Plain-language privacy policy that matches what the code actually does.
 * If you change what is stored or which services are used, update this page
 * and LEGAL_UPDATED.privacy in src/lib/legal.ts.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={LEGAL_UPDATED.privacy}
      summary={
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted">
          <li>We store your Google name, email and picture, the profile you enter, and your chats.</li>
          <li>
            Your messages are sent to the PROXIMA AI engine to get a reply. Your name and email are not.
          </li>
          <li>No ads, no tracking or analytics cookies, and we never sell your data.</li>
          <li>Memory is off unless you turn it on after seeing a consent card; temporary chats are not saved.</li>
          <li>
            You can download or delete your chats, or delete your whole account, any time in{" "}
            <Link href="/settings" className="font-bold text-fg underline underline-offset-2">
              Settings
            </Link>
            .
          </li>
        </ul>
      }
    >
      <h2>Who we are</h2>
      <p>
        {site.name} (“Proxima”, “we”) is an AI assistant made by {site.developer}. Questions about this policy
        or your data? Contact the developer on{" "}
        <a href={site.links.facebook} target="_blank" rel="noopener noreferrer">
          Facebook
        </a>
        .
      </p>

      <h2>What we collect</h2>
      <h3>When you sign in with Google</h3>
      <ul>
        <li>
          Your <strong>name, email address and profile picture</strong>, shared by Google. We never see your
          Google password.
        </li>
        <li>A link between your Google account and your Proxima account, so you can sign in again.</li>
      </ul>
      <h3>What you give us</h3>
      <ul>
        <li>
          Your <strong>profile</strong>: the name Proxima calls you, your age, and your theme and background
          settings.
        </li>
        <li>
          Your <strong>chats</strong>: your messages, Proxima&apos;s replies, chat titles, how long each reply
          took, and the text of files you attach (up to {LIMITS.attachmentsMax} small text files per message).
        </li>
      </ul>
      <h3>Optional memory</h3>
      <p>
        Memory is <strong>off by default</strong>. If you choose to turn it on, PROXIMA can save short notes
        about durable facts, preferences, goals and routines, then retrieve a few relevant notes for a later
        reply. You can review, correct, export or delete every note at <Link href="/settings/memory">Settings → Memory</Link>,
        and turning memory off stops both reading and writing. Temporary chat does not save the chat or use
        memory. We do not store passwords, API keys, card or ID numbers, exact addresses, health diagnoses, or
        details about other people unless you explicitly ask PROXIMA to remember that detail.
      </p>
      <h3>The demo on the home page</h3>
      <p>
        If you try the live demo without signing in, your messages are sent to the AI engine to get a reply
        but are <strong>not saved</strong> in our database.
      </p>
      <h3>Spoken replies</h3>
      <p>
        If you choose <strong>Natural</strong> voice, the answer text is sent from your browser to our server
        and then to the voice service configured for the site (Microsoft Edge voices, OpenAI, or Pollinations
        / ElevenLabs) only so it can be turned into audio. We do not save the audio, and we do not use that
        text for anything else. The generated audio is kept in the browser tab only. Choosing{" "}
        <strong>Device</strong> voice keeps speech in your browser (some phones may use a voice supplied by
        the browser maker).
      </p>

      <h3>To prevent abuse</h3>
      <p>
        To limit how many messages can be sent per minute, we keep a counter linked to your account or to a{" "}
        <strong>scrambled (one-way hashed) version of your IP address</strong>. We never store raw IP
        addresses ourselves, and these counters are deleted automatically after about 10 minutes. Our hosting
        provider may keep standard technical logs (such as IP address and browser type) for security and
        troubleshooting.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>
          To run Proxima: answer your messages, keep your chat history and settings, and sync them to your
          devices.
        </li>
        <li>To keep the service safe and working: rate limits, security and fixing errors.</li>
      </ul>
      <p>
        We <strong>do not</strong> sell your data, show ads, or use your data for advertising.
      </p>

      <h2>The AI engine</h2>
      <p>
        To create a reply, our server sends your message (with the text of any attached files) and a random
        chat ID to the PROXIMA Core AI engine. Your name, email and picture are <strong>not</strong> sent.
        Please don&apos;t put passwords or other highly sensitive information in your messages.
      </p>

      <h2>Services we use</h2>
      <p>These companies process data for us, only to run Proxima:</p>
      <ul>
        <li>
          <strong>Google</strong>: signing in.
        </li>
        <li>
          <strong>Vercel</strong>: hosting the website and server.
        </li>
        <li>
          <strong>Neon</strong>: the database where accounts and chats are stored.
        </li>
        <li>
          <strong>Render</strong>: hosting the PROXIMA Core AI engine.
        </li>
      </ul>
      <p>Their servers may be in a different country from you.</p>

      <h2>Cookies and storage on your device</h2>
      <ul>
        <li>
          <strong>Login cookie</strong>: an encrypted cookie that keeps you signed in (up to 30 days), plus
          short-lived security cookies used while signing in.
        </li>
        <li>
          <strong>Theme</strong>: your dark/light choice is remembered in your browser so pages don&apos;t
          flash on load.
        </li>
      </ul>
      <p>We don&apos;t use advertising, analytics or tracking cookies.</p>

      <h2>How long we keep it</h2>
      <p>
        Your profile, chats and any optional memory notes are kept until you delete them. Memory notes remain
        until you remove them or they expire; deleting a chat does not remove a separate memory note. Deleting
        your account removes the memories through the database cascade. When you delete a chat or your account, it is
        removed from our database right away. Copies may remain in our database provider&apos;s backups for a
        short time before they are erased.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <strong>See and change</strong> your profile and memory choice in <Link href="/settings">Settings</Link>.
        </li>
        <li>
          <strong>Download</strong> all your chats (Markdown or JSON) in Settings, or one chat from the chat
          screen.
        </li>
        <li>
          <strong>Delete</strong> one chat, all chats, individual memory notes, all memories, or your whole account in Settings.
        </li>
        <li>
          Remove Proxima&apos;s access in your Google account under <em>Security</em>, then{" "}
          <em>Third-party connections</em>.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        Signing in needs a Google account, which in most countries requires you to be at least 13. If you are
        younger than the age of digital consent where you live, please use Proxima only with permission from a
        parent or guardian.
      </p>

      <h2>Security</h2>
      <p>
        The site uses HTTPS, login cookies are encrypted, the AI engine is called only from our server, and
        every request checks that you can only see your own chats. No system is perfectly secure, but we work
        to protect your data.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy, we&apos;ll update the date at the top of this page. Important changes will
        be announced in the app.
      </p>
    </LegalPage>
  );
}
