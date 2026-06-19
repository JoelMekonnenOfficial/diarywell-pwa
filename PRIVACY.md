# DiaryWell — Privacy Policy

**Effective date:** 2026-06-02 _(initial release — update if you ship a materially different build)_

**Contact:** privacy+diarywell@joelmekonnen.com

---

## The short version

DiaryWell is a private, offline journal for tracking how your body and mind are doing. We — the developer of DiaryWell — do not collect, see, transmit, sell, share, or back up your health information. Everything you log lives on your device in your browser's local storage (IndexedDB). There are no accounts, no servers, no ads, and no third-party analytics.

If you ever want to move your journal to another device, you can export it as a JSON file. That export is created on your device and saved or shared only where you choose to put it.

---

## What data we collect

**None.** DiaryWell does not collect any personal data, health data, device identifiers, advertising identifiers, IP addresses, location, contacts, photos, microphone audio, or anything else.

We literally cannot. The app has no backend.

### What lives on your device (and only on your device)

When you use DiaryWell, your browser stores the following inside an IndexedDB database named `diarywell`:

- The daily entries you create: mood, pain level, energy level, sleep hours and quality, symptoms, triggers, medications, free-text notes, dates.
- The custom symptom, trigger, and medication tags you create in Settings.
- Your preferences: theme, reminder time, default chart range, sleep units, larger-text setting.
- An optional cryptographic hash of your 4-digit PIN, plus a random salt (see "Security" below). We do not store the PIN itself.
- A flag noting that you completed first-launch onboarding so it does not repeat.

This data never leaves the device unless you explicitly:

- Export a JSON backup, or
- Share or print a PDF / text report.

We have no ability to read it.

---

## Cookies, tracking, and analytics

**None.** DiaryWell uses no cookies, no analytics SDK, no telemetry, no crash reporters, no advertising frameworks, no tag managers, no remote configuration, and no A/B testing. The service worker caches the app's own files (HTML, CSS, JavaScript, icons) so the app works offline; it does not communicate with any remote server.

---

## Third parties

**None.** DiaryWell does not embed any third-party code, fonts, libraries fetched from a CDN, or external resources at runtime. There are no partners, processors, sub-processors, or analytics vendors.

Your device's operating system (Apple iOS / iPadOS, Google Android, etc.) and your browser may collect their own diagnostics independently of DiaryWell, governed by their own privacy policies.

---

## HIPAA / health-data regulations

DiaryWell is a personal-use, self-tracking tool. It is **not** a HIPAA Covered Entity, Business Associate, or Service Provider, because we never receive or process your data on any server. We do not sign Business Associate Agreements (BAAs), because there is no data flow that would require one.

If you are a healthcare provider using DiaryWell on a personal device to track information about people in your care, your own professional compliance obligations (HIPAA in the US, PIPEDA in Canada, NHS DPA in the UK, etc.) apply to how _you_ handle that data. DiaryWell does not, by itself, satisfy any of those obligations.

DiaryWell is not a medical device under FDA, EU MDR, MHRA, or TGA definitions. It does not diagnose, treat, cure, or prevent any disease. Always discuss patterns and treatment decisions with a qualified clinician.

---

## Backups you create

If you use **Export JSON** from Settings, DiaryWell writes a `.json` file using your browser's standard save mechanism (the File System Access API where available, or a download otherwise). That file contains a complete copy of your entries, tags, and preferences in plain text.

- Once the file exists on your device or in a cloud folder you've connected, its privacy is governed by your device, your storage, and (if applicable) your cloud provider's terms.
- We strongly recommend keeping backups in a location you trust. If you share or sync the backup file, anyone with the file can read it.
- We do not transmit, receive, or have any visibility into backup files.

---

## Data retention

Your journal lives on your device until you delete it. Deletion happens when you:

- Use **Clear all data** in Settings (a two-step confirmation; cannot be undone), or
- Uninstall the app, or
- Clear your browser's site data for the domain DiaryWell is served from.

We do not retain anything anywhere because we never receive anything.

---

## Security

- **Local storage.** IndexedDB is sandboxed by your browser to DiaryWell's origin; other websites cannot read it.
- **Optional PIN.** You may set a 4-digit PIN in Settings. The PIN is combined with a random per-installation salt and hashed with SHA-256 via the Web Crypto API (`crypto.subtle.digest`) before being stored. The PIN itself is never stored. We cannot recover a forgotten PIN — if you forget it, you will need to clear data and start again.
- **No transport security needed for app data,** because no app data is transported. The app shell itself should be served over HTTPS for general web security.
- **Service worker** caches only the app's own static files for offline use.

No security measure is absolute. If someone has physical access to an unlocked device, they have access to anything in that browser. The PIN lock raises the bar but is not a substitute for device-level security (lock screen, biometric unlock, full-disk encryption).

---

## Your rights

Because we do not hold any of your personal information, requests under GDPR (EU/UK), CCPA / CPRA (California), PIPEDA (Canada), the LGPD (Brazil), or similar frameworks for **access, correction, deletion, restriction, portability, or objection** can be fulfilled directly by you, inside the app:

- **Access / portability:** Use **Export JSON** in Settings. You receive a complete, machine-readable copy of everything DiaryWell stores about you.
- **Correction:** Edit any past day by opening it from the calendar heatmap, or add updated entries.
- **Deletion:** Use **Clear all data** in Settings, or delete individual entries by opening them and clearing the fields, or uninstall the app.
- **Restriction / objection:** Stop using the app or revoke the notification permission in your device settings.

If you have a question we have not addressed, you may email privacy+diarywell@joelmekonnen.com. We may not be able to confirm or deny whether you have used the app, because — again — we have no record of any user.

---

## Children's privacy

DiaryWell is not directed at children under 13. We do not knowingly collect data from children (or anyone). The app is rated 12+ on Apple and Teen on Google Play because of references to medical and mental-health topics; parents and guardians should make their own judgment about whether the app is appropriate for a particular child.

---

## Mental health and crisis resources

DiaryWell is a self-tracking tool, not a substitute for medical care or crisis support. If you are in immediate distress, please reach out:

- **United States:** Call or text **988** (Suicide & Crisis Lifeline). Spanish line available.
- **United Kingdom & Ireland:** Call **116 123** (Samaritans).
- **Canada:** Call or text **988**.
- **Australia:** Call **13 11 14** (Lifeline).
- **Worldwide:** Visit **findahelpline.com** for crisis lines in most countries, or contact your local emergency number.

If you are concerned about someone else, the same lines can advise you.

---

## Changes to this policy

If we change this policy, we will update the **Effective date** above and post the change with the next app update. Because DiaryWell does not collect contact information, we cannot email you about changes — the in-app About section and the published policy at the URL above are the authoritative copy.

If a future change ever involves any kind of data collection or transmission, we will treat that as a material change and ask for fresh, informed consent inside the app before any data leaves your device.

---

## Contact

Questions, corrections, accessibility concerns, or feedback:

privacy+diarywell@joelmekonnen.com

(If this address is not yet configured as a forwarder on joelmekonnen.com,
either set up the forwarder before publishing OR replace this line with your
preferred public contact.)

We read every message. We may take a while to reply.
