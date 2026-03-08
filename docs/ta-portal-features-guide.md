# TA Portal Operations Manual

This document is the operational source of truth for the TA portal. It is written for two audiences:

- TAs who need exact step-by-step instructions
- The in-portal help assistant, which should use this guide as its knowledge source

The guide is intentionally procedural. It focuses on what exists in the current portal, where to click, what order to do things in, what to verify before saving, and what to do when something goes wrong.

## Portal Map

### Main surfaces

- `Public Attendance` page at `/`
- `Authentication` page at `/auth`
- `TA Dashboard` at `/dashboard`

### TA dashboard modules

- `Zoom Processor`
- `Live Attendance`
- `Roster Management`
- `Consolidated View`
- `Session Management`
- `Rule Exceptions`
- `Late Days`
- `Issue Queue`
- `Export Data`
- `Lists & Settings`

### Important portal rules

- `Zoom Processor` and `Live Attendance` are a shared attendance workspace.
- The dashboard remembers the last open module during the current browser session.
- The test student with ERP `00000` is managed from `Lists & Settings`, not from `Roster Management`.
- The public attendance board excludes the test student.
- Some TA changes auto-sync public attendance data to the canonical Google Sheet.

## Core Operating Principle

For most attendance work, do not start with `Live Attendance`. Start by making sure the session exists, then process Zoom, then mark attendance, then correct penalties and sync if needed.

The normal order is:

1. Create or verify the session in `Session Management`
2. Verify the roster in `Roster Management`
3. Process the Zoom CSV in `Zoom Processor`
4. Copy absent ERPs from the Zoom results
5. Save the session attendance in `Live Attendance`
6. Review manual corrections such as status changes or naming penalties
7. Sync the public sheet if immediate downstream visibility is needed

---

## Runbook: First-Time TA Setup

### Goal

Prepare a TA account and make sure the portal is ready for operational use.

### Where to go

- Login page: `/auth`
- After login: `Lists & Settings`, `Roster Management`, `Session Management`

### Step-by-step

1. Open `/auth`.
2. Switch to `TA` mode.
3. Enter the TA email and password.
4. Sign in.
5. Open `Lists & Settings`.
6. In `My Account Password`, change the password if the current one is temporary or shared.
7. In `TA Management`, verify that the correct TA emails exist in the allowlist.
8. In `Global Settings`, confirm:
   - whether roster verification should be enabled
   - whether student ticketing should be enabled
   - whether the test student should be visible in TA modules
9. Open `Roster Management` and make sure the current class roster exists.
10. Open `Session Management` and make sure the upcoming sessions already exist.

### What to review before finishing

- You can sign in successfully as a TA.
- The roster exists and looks current.
- Sessions exist for the classes you are about to manage.
- Your password is something only you know.

### Common mistakes and recovery

- If TA login fails before sign-in completes:
  - the email may not be in the TA allowlist
  - fix it from `Lists & Settings` using another authorized TA account
- If roster-dependent modules look empty:
  - verify the roster was imported successfully
  - refresh the module or reopen it after roster import

---

## Runbook: Create a Session Before Any Attendance Work

### Goal

Create the session record that attendance will attach to.

### Where to go

- `TA Dashboard` -> `Session Management`

### When you must do this

Do this before Zoom processing or attendance marking if the target session is missing from the session dropdowns.

### Prerequisites

- You are signed in as a TA.
- You know the session number and intended class date.

### Step-by-step

1. Open `Session Management`.
2. Find the `Add Session` card.
3. Enter the `session number`.
4. Choose the `session date`.
5. Choose or enter the `day`.
6. Fill in any available time-related fields shown in the form.
7. Click the create/save button.
8. Wait for the success confirmation.
9. Check the `Sessions List`.
10. Confirm the new session appears with the correct number and date.

### What to review before leaving

- The session number is correct.
- The date matches the class you are about to process.
- The session appears in the sessions list.

### What to do next

- If the session was created for an upcoming Zoom class, go to `Zoom Processor`.
- If you only needed the session so you can mark attendance manually, go to `Live Attendance`.

### Common mistakes and recovery

- If the session is missing later in `Live Attendance`:
  - return to `Session Management`
  - confirm the session was saved
  - refresh the attendance module if needed
- If the date or day is wrong:
  - edit the session from `Sessions List`
  - save the correction
  - editing is intended to preserve attendance data

---

## Runbook: Process a Zoom CSV and Turn It Into Attendance

### Goal

Take a Zoom attendance file, review the matches and problems, then convert it into a reliable absent list for attendance marking.

### Where to go

- `TA Dashboard` -> `Zoom Processor`

### Prerequisites

- The target session already exists in `Session Management`
- The roster is current in `Roster Management`
- You have the Zoom CSV file for the class

### Full workflow

#### Part 1: Confirm setup before processing

1. Open `Session Management` in a separate check if you are unsure whether the session exists.
2. Verify the session exists.
3. Open `Roster Management` if you suspect the roster is outdated.
4. Confirm the roster includes the students you expect for this class.
5. Open `Zoom Processor`.

#### Part 2: Upload and process the Zoom file

1. In `Zoom Processor`, make sure `use saved roster` stays enabled unless you intentionally need to work without the current roster reference.
2. Upload the Zoom CSV file.
3. Start the processing step.
4. Wait for the review data to load.

#### Part 3: Review the review-stage tabs

Review these tabs in this order.

##### A. `Matches`

1. Open `Matches`.
2. Check that students appear to be matched to the correct ERP values and names.
3. Look for obvious mismatches such as:
   - the wrong student attached to a Zoom name
   - repeated ERP values
   - class mismatches

##### B. `Issues`

1. Open `Issues`.
2. Review rows that need human attention.
3. Pay special attention to:
   - bad name formatting
   - partial ERP extraction
   - records that look close to a valid student but were not safely matched

##### C. `Unidentified`

1. Open `Unidentified`.
2. Review anyone the processor could not confidently map.
3. If needed, use the copy action for unidentified rows so you can share the list with another TA.
4. Do not ignore this tab if the class had many attendees with unusual Zoom names.

##### D. `Raw Zoom Log`

1. Open `Raw Zoom Log` if any row seems suspicious.
2. Use it to inspect the original imported Zoom data.
3. Compare the raw row against the issue you are investigating.

#### Part 4: Review the final results

1. Continue to the final results view.
2. Open `Absent`.
3. Review the absent ERP list.
4. Open `Penalties`.
5. Review the naming penalty rows.
6. Confirm the final results are reasonable before you copy anything.

#### Part 5: Copy the data you need for attendance

1. Use `Copy Absent ERPs`.
2. Keep the copied list ready for `Live Attendance`.
3. If you need the unidentified summary, copy that too before leaving the module.

### What to review before leaving `Zoom Processor`

- The session exists and is the one you intend to mark.
- The roster reference is current.
- The absent list looks reasonable.
- The naming penalties look reasonable.
- You reviewed `Issues` and `Unidentified` instead of skipping them.

### What to do next

1. Switch to `Live Attendance` in the shared attendance workspace.
2. Select the same session.
3. Paste the absent ERP list.
4. Save attendance.

### Common mistakes and recovery

- If you process the Zoom CSV before creating the session:
  - create the session first in `Session Management`
  - then continue with `Live Attendance`
- If the absent list looks too large:
  - re-check `Issues` and `Unidentified`
  - confirm the roster is current
  - verify the correct Zoom CSV was uploaded
- If many known students are not matched:
  - verify Zoom names were formatted correctly
  - check whether the roster is outdated
- If you forgot to copy absent ERPs:
  - reopen the final results and use `Copy Absent ERPs`

---

## Runbook: Mark Attendance After Zoom Processing

### Goal

Save session attendance using the Zoom-derived absent ERP list, then review and correct anything that needs manual adjustment.

### Where to go

- `TA Dashboard` -> `Live Attendance`

### Prerequisites

- The session already exists
- You already processed the Zoom CSV
- You copied the absent ERP list from `Zoom Processor`

### Step-by-step

#### Part 1: Open the correct session

1. Open `Live Attendance`.
2. Select the target session from the session dropdown.
3. Confirm this is the same session you just processed in `Zoom Processor`.

#### Part 2: Paste the absent list and save

1. Paste the absent ERP list into the absent ERP field.
2. Click the main attendance save/mark button.
3. Wait for the save result.

#### Part 3: Handle overwrite if attendance already exists

1. If the portal warns that attendance already exists, stop and confirm whether you are editing the correct session.
2. If the existing attendance is outdated and should be replaced, confirm overwrite.
3. If you are not sure, cancel and verify the session number before proceeding.

#### Part 4: Review the generated attendance list

1. After save, review the `Attendance List`.
2. Confirm that:
   - absent students are marked absent
   - everyone else is present unless already adjusted
3. Use the search box to find individual students when needed.
4. Use the filters if you want to focus on:
   - present
   - absent
   - penalized

#### Part 5: Correct status and penalties manually

1. If a student should be present instead of absent, toggle the status.
2. If a student should be absent instead of present, toggle the status.
3. If a naming penalty should apply, toggle the naming penalty control for that student.
4. If a naming penalty should be removed, toggle it off.

#### Part 6: Sync downstream views if needed

1. If you need the public sheet updated immediately, click `Sync to Sheet`.
2. Wait for the sync success message.

### What to review before leaving

- The selected session is correct.
- The absent list was applied to the correct session.
- Manual corrections were made where needed.
- Naming penalties reflect the Zoom review.
- The public sync was run if immediate visibility matters.

### What to do next

- If students later dispute the attendance, handle those through `Issue Queue`.
- If a repeated attendance exception is approved, add it to `Rule Exceptions`.

### Common mistakes and recovery

- If you pasted the absent list into the wrong session:
  - reopen the correct session
  - overwrite only if necessary
  - verify manually before leaving
- If you forgot to review naming penalties:
  - return to `Zoom Processor` final results
  - review penalties
  - come back to `Live Attendance` and correct rows manually
- If the public board still looks old:
  - run `Sync to Sheet`
  - wait briefly for downstream refresh

---

## Runbook: Mark Attendance Without a Zoom File

### Goal

Save attendance manually when Zoom processing is not available or not needed.

### Where to go

- `TA Dashboard` -> `Live Attendance`

### Prerequisites

- The session already exists
- You know which ERPs should be marked absent

### Step-by-step

1. Open `Live Attendance`.
2. Select the correct session.
3. Paste the ERP values that should be absent.
4. Click the main attendance save/mark button.
5. Review the generated attendance list.
6. Search for any student that needs manual status correction.
7. Toggle naming penalties if required.
8. Use `Sync to Sheet` if immediate downstream update is needed.

### Common mistakes and recovery

- If you do not see the session:
  - create it first in `Session Management`
- If you accidentally saved incomplete absences:
  - paste the corrected list
  - overwrite only after confirming the session

---

## Runbook: Fix Attendance After It Was Already Saved

### Goal

Correct status or penalty mistakes for an already-marked session.

### Where to go

- `TA Dashboard` -> `Live Attendance`

### Step-by-step

1. Open `Live Attendance`.
2. Select the session that already has attendance.
3. Wait for the attendance list to load.
4. Search for the student you need to fix.
5. Toggle the attendance status if the student is marked incorrectly.
6. Toggle naming penalty on or off as needed.
7. Confirm the row now reflects the correct state.
8. Run `Sync to Sheet` if the correction must appear immediately elsewhere.

### Common mistakes and recovery

- If no attendance appears:
  - verify you selected the correct session
  - confirm attendance was actually saved for that session
- If a roster update added new students later:
  - the module may backfill missing roster students into marked sessions
  - verify those rows if the roster changed after attendance was first saved

---

## Runbook: Import or Correct the Roster

### Goal

Keep the roster accurate so Zoom matching, attendance, and ticket identity work correctly.

### Where to go

- `TA Dashboard` -> `Roster Management`

### When to use this

- Before the semester starts
- When students are added or removed
- When Zoom processing is matching poorly because the roster is stale

### Bulk import workflow

1. Open `Roster Management`.
2. Find the roster import area.
3. Paste the roster data.
4. Start the import.
5. If you are intentionally replacing the old roster, confirm the wipe-and-replace action.
6. Wait for the success message.
7. Review any warnings about skipped invalid lines.
8. Search a few known students to confirm the new roster loaded correctly.

### Single-student add workflow

1. Open `Roster Management`.
2. Click `Add Student`.
3. Enter:
   - ERP
   - student name
   - class number
4. Save the student.
5. Confirm the new row appears in the roster list.

### Edit workflow

1. Search the student.
2. Click edit on the row.
3. Correct the values.
4. Save the record.

### Delete workflow

1. Find the student row.
2. Click delete.
3. Confirm deletion.

### What to review before leaving

- The roster includes the students expected for the course.
- ERP, student name, and class number look consistent.
- No obvious duplicates remain.

### Common mistakes and recovery

- If a student cannot be edited here:
  - confirm it is not the test student `00000`
  - manage that student from `Lists & Settings`
- If Zoom matching still looks wrong after import:
  - confirm the imported roster values were actually correct
  - try processing the CSV again after the roster update

---

## Runbook: Review the Whole Course in Consolidated View

### Goal

Review course-wide attendance and penalty status across sessions.

### Where to go

- `TA Dashboard` -> `Consolidated View`

### Step-by-step

1. Open `Consolidated View`.
2. Review the full attendance sheet.
3. Look for:
   - unusual absence counts
   - unusual penalty counts
   - rows that suggest an earlier attendance mistake
4. If the external Google Sheet must reflect the latest data, click `Sync Sheet`.
5. Wait for the success confirmation.

### Common mistakes and recovery

- If the data looks out of date:
  - return to `Live Attendance`
  - confirm the attendance was saved correctly
  - run `Sync Sheet` again

---

## Runbook: Add and Use Rule Exceptions

### Goal

Record approved exceptions such as camera accommodations so TAs can handle repeated special cases consistently.

### Where to go

- `TA Dashboard` -> `Rule Exceptions`

### Add exception workflow

1. Open `Rule Exceptions`.
2. Search first to make sure the exception does not already exist.
3. Click `Add Exception`.
4. Enter the ERP.
5. Enter the exception details required by the form.
6. Save the exception.
7. Confirm it appears in the list.

### Remove exception workflow

1. Search for the exception.
2. Click the delete/remove control.
3. Confirm deletion.

### What to review before leaving

- The exception belongs to the correct ERP.
- The rule is clearly represented and not duplicated.

### Common mistakes and recovery

- If the ERP is not found easily:
  - verify the roster entry exists
  - search by student name or ERP again

---

## Runbook: Resolve a Ticket in Issue Queue

### Goal

Handle a student complaint or request from intake to closure.

### Where to go

- `TA Dashboard` -> `Issue Queue`

### Step-by-step

1. Open `Issue Queue`.
2. Narrow the list using:
   - search by ERP or name
   - status filter
   - category/group filter
3. Click `Inspect` on the ticket.
4. Read the ticket details carefully.
5. Decide what type of case it is:
   - class issue
   - grading query
   - penalty query
   - absence query
6. If you need to reply, enter a TA response in the response area.
7. Save the response.
8. Decide the next action:
   - leave as pending
   - mark as resolved
   - convert to rule exception
   - delete if invalid or duplicate
9. Apply the chosen action.
10. Confirm the main list updates.

### What to review before closing the ticket

- The ERP and student identity look correct.
- The response, if any, is saved.
- The status reflects the current state of the case.

### Common mistakes and recovery

- If the case should affect future attendance handling:
  - do not stop at resolving the ticket
  - also add it to `Rule Exceptions`
- If the ticket list looks stale:
  - wait briefly for realtime refresh
  - reopen the module if needed

---

## Runbook: Convert a Ticket into a Rule Exception

### Goal

Take a validated issue from `Issue Queue` and turn it into an operational exception.

### Where to go

- `TA Dashboard` -> `Issue Queue`

### Step-by-step

1. Open the relevant ticket in `Issue Queue`.
2. Confirm the ticket is valid and should affect future handling.
3. Use `Add to Rule Exceptions`.
4. Wait for the success confirmation.
5. Open `Rule Exceptions`.
6. Search for the ERP.
7. Confirm the exception now exists.

### Common mistakes and recovery

- If the exception does not appear:
  - retry from the ticket
  - check whether the ticket was missing enough information to create the exception

---

## Runbook: Manage Late Days

### Goal

Create late-day-enabled assignments, review student claims, and grant extra late days when approved.

### Where to go

- `TA Dashboard` -> `Late Days`

### Important rule

Students have a base allowance of `3` late days, plus any TA-granted adjustments.

### Create assignment workflow

1. Open `Late Days`.
2. In the assignment section, enter the assignment title.
3. Add a deadline if there is one.
4. Save the assignment.
5. Confirm the assignment appears in the list.

### Edit assignment workflow

1. Find the assignment row.
2. Click edit.
3. Change the title or deadline.
4. Save the changes.

### Archive assignment workflow

1. Find the assignment row.
2. Use the archive/delete-style control.
3. Confirm the archive action.

### Grant extra late days workflow

1. In `Student Roster Balances`, search for the student.
2. Click the add/grant late days action.
3. Enter the number of days.
4. Save the adjustment.
5. Confirm the student’s balance updates.

### Review claim workflow

1. In `Late Day Claims`, open the relevant claim breakdown.
2. Review the claim rows.
3. If a claim row is invalid, delete it carefully.
4. Confirm the balances now look correct.

### What to review before leaving

- The assignment title and deadline are correct.
- Student balances reflect approved adjustments.
- Invalid claims are cleaned up if necessary.

### Common mistakes and recovery

- If assignment creation/update complains about schema issues:
  - the database schema may be outdated for nullable deadlines
- If a student balance looks wrong:
  - check both granted adjustments and claim rows

---

## Runbook: Update Global Settings

### Goal

Change operational settings that affect student and TA behavior.

### Where to go

- `TA Dashboard` -> `Lists & Settings`

### Available global settings

- roster verification on/off
- student ticketing on/off
- test student visibility in TA modules on/off

### Step-by-step

1. Open `Lists & Settings`.
2. Find `Global Settings`.
3. Toggle the required setting.
4. Wait for the success message.
5. Re-check the affected workflow if the change is important.

### Examples

- Disable ticketing if complaints should temporarily stop.
- Hide the test student if TA operational views should remain clean.
- Enable roster verification if student access should be restricted to official roster entries.

---

## Runbook: Change Your TA Password

### Goal

Update the password for the signed-in TA account.

### Where to go

- `TA Dashboard` -> `Lists & Settings` -> `My Account Password`

### Step-by-step

1. Open `Lists & Settings`.
2. Find `My Account Password`.
3. Enter the new password.
4. Enter the same password in the confirmation field.
5. Save the update.
6. Wait for the success message.

### What to review before leaving

- The password update succeeded.
- The new password is something only you know.

---

## Runbook: Manage TA Access

### Goal

Add or remove TA emails from the allowlist.

### Where to go

- `TA Dashboard` -> `Lists & Settings` -> `TA Management`

### Add TA workflow

1. Open `Lists & Settings`.
2. Go to `TA Management`.
3. Enter the TA email.
4. Click `Add`.
5. Confirm the new TA appears in the list.

### Remove TA workflow

1. Find the TA row.
2. Click remove/delete.
3. Confirm the removal if prompted.

### Important note

The master admin account cannot be removed.

---

## Runbook: Manage Grading Submission Options

### Goal

Control the submission options available in student grading-query tickets.

### Where to go

- `TA Dashboard` -> `Lists & Settings` -> `Submission List`

### Step-by-step

1. Open `Lists & Settings`.
2. Go to `Submission List`.
3. Enter a new submission label.
4. Click `Add`.
5. Remove outdated labels when they should no longer appear in the student form.

---

## Runbook: Manage the Test Student

### Goal

Use the special test student for controlled testing without treating it like a normal roster entry.

### Where to go

- `TA Dashboard` -> `Lists & Settings` -> `Test Student (00000)`

### What you can change

- class number
- student name
- total absences
- total penalties
- session status JSON
- penalty entries JSON

### Step-by-step

1. Open `Lists & Settings`.
2. Find `Test Student (00000)`.
3. Update the plain fields as needed.
4. If required, update the JSON fields carefully.
5. Save test student overrides.

### What to review before saving

- JSON fields must be valid JSON.
- The values should be intentional because they affect TA-side testing behavior.

### Common mistakes and recovery

- If save fails:
  - verify the JSON fields are valid
  - confirm `session status` is an object
  - confirm `penalty entries` is an array

---

## Runbook: Export Attendance Data

### Goal

Download attendance data as a report file.

### Where to go

- `TA Dashboard` -> `Export Data`

### Step-by-step

1. Open `Export Data`.
2. Trigger the export.
3. Download the generated CSV file.
4. Use the file for reporting, audit, or external sharing as needed.

---

## End-to-End Workflow: Full Class-Day Attendance Operation

### Goal

Handle a normal class day from session setup to final attendance state.

### Exact sequence

1. Open `Session Management`.
2. Confirm the session exists.
3. If the session does not exist, create it before doing anything else.
4. Open `Roster Management`.
5. Confirm the roster is current.
6. If the roster is outdated, import or correct it now.
7. Open `Zoom Processor`.
8. Upload the Zoom CSV.
9. Process the file.
10. Review `Matches`.
11. Review `Issues`.
12. Review `Unidentified`.
13. Review `Raw Zoom Log` only if something looks suspicious.
14. Move to final results.
15. Review `Absent`.
16. Review `Penalties`.
17. Copy absent ERPs.
18. Switch to `Live Attendance`.
19. Select the same session.
20. Paste absent ERPs.
21. Save attendance.
22. If prompted, only overwrite after confirming the session and intention.
23. Review the attendance list.
24. Correct any wrong status.
25. Correct any wrong naming penalty.
26. Run `Sync to Sheet` if immediate downstream update is needed.
27. Later, handle any disputes in `Issue Queue`.
28. If a repeated exception is approved, add it to `Rule Exceptions`.

---

## Decision Guide: Which Module Should I Use?

### I need to create the class record before attendance exists

Use `Session Management`.

### I need to process a Zoom CSV

Use `Zoom Processor`.

### I need to save attendance for a session

Use `Live Attendance`.

### I need to fix a student marked absent/present incorrectly

Use `Live Attendance`.

### I need to apply or remove a naming penalty

Use `Live Attendance`, after reviewing `Zoom Processor` penalties if needed.

### I need to update the roster

Use `Roster Management`.

### I need to review course-wide attendance

Use `Consolidated View`.

### I need to handle an approved camera or attendance exception

Use `Rule Exceptions`.

### I need to respond to a student complaint

Use `Issue Queue`.

### I need to give extra late days

Use `Late Days`.

### I need to disable tickets or update TA settings

Use `Lists & Settings`.

### I need a download of attendance data

Use `Export Data`.

---

## Recovery Guide

### The session is missing in attendance or Zoom-related work

1. Open `Session Management`
2. Create the session
3. Return to the original module

### The Zoom result looks wrong

1. Verify the correct roster is loaded
2. Review `Issues` and `Unidentified`
3. Confirm the correct Zoom CSV was uploaded
4. Reprocess if necessary

### Attendance already exists but I need to replace it

1. Confirm the session is correct
2. Confirm you truly want to replace the old saved state
3. Use overwrite only after that confirmation

### The public board or sheet looks stale

1. Run `Sync to Sheet` from `Live Attendance` or `Consolidated View`
2. Wait briefly for downstream refresh

### A student’s issue should affect future attendance handling

1. Resolve or review the ticket in `Issue Queue`
2. Add it to `Rule Exceptions`
3. Verify the exception exists

### The bot gives a bad answer

1. Ask using a more concrete operational question
2. Mention the module and the task
3. Prefer asking for a step-by-step runbook

Example:

- good: `How do I mark attendance from a Zoom CSV for session 8?`
- weak: `attendance help`

---

## Button and Stage Reference

This section exists specifically so the help assistant can answer questions like:

- `what do i click now`
- `what do i press first`
- `which button should i use here`
- `i am on this screen, what is the next click`

When answering those questions, always use the current module and current stage first. Do not answer from another module unless the current screen is clearly blocked and the user must switch modules.

### Global navigation controls

#### `Back to Modules`

- Use this when the user wants to leave the current module and return to the TA dashboard tiles.
- Do not tell the user to click this if they are still in the middle of a workflow and only need the next step inside the current module.

#### `ZOOM` and `LIVE ATTENDANCE` inside `Attendance Workspace`

- If the user is working with a Zoom CSV, reviewing matches, copying absences, or checking penalties, tell them to click `ZOOM`.
- If the user is selecting a session, pasting absent ERPs, marking statuses, toggling penalties, or syncing attendance, tell them to click `LIVE ATTENDANCE`.
- If the user says they switched tabs and asks `what now`, answer from the currently active tab, not from the last attendance tab they used before switching.

---

## Module-by-Module Click Guide

### `Zoom Processor` -> upload step

#### What is visible on this step

- `SELECT CSV`
- `Use Saved` toggle in the roster area
- `Using Saved Roster` panel when the toggle is enabled
- manual roster upload area when `Use Saved` is disabled
- `Custom Duration (mins)` input
- `Namaz Break (mins)` input
- `CALCULATE ATTENDANCE`

#### What to tell the user to click first

- If they have not uploaded the Zoom file yet, tell them to click `SELECT CSV`.
- If they want to use the current roster already stored in the portal, leave `Use Saved` enabled and do not tell them to upload a roster manually.
- If they intentionally need a different roster file for this run, tell them to turn `Use Saved` off first, then upload the roster file in the manual roster area.

#### Exact click order for a normal run

1. Click `SELECT CSV`.
2. Choose the Zoom CSV from the file picker.
3. Leave `Use Saved` enabled unless there is a specific reason not to.
4. Adjust `Custom Duration (mins)` only if the class duration should override the automatic value.
5. Adjust `Namaz Break (mins)` only if the break must be subtracted from attendance logic.
6. Click `CALCULATE ATTENDANCE`.

#### When to tell them not to click `CALCULATE ATTENDANCE` yet

- Do not tell them to click `CALCULATE ATTENDANCE` before the Zoom CSV is selected.
- Do not tell them to click it if they turned `Use Saved` off but still have not uploaded a roster.
- Do not send them to `Create Session` from this screen unless the workflow is blocked because the session does not exist elsewhere.

#### Best answer pattern for `what do i click now` on this screen

- If no Zoom file is loaded: `Click SELECT CSV first.`
- If the Zoom file is loaded and the roster is ready: `Click CALCULATE ATTENDANCE next.`
- If `Use Saved` is off and there is no manual roster file loaded: `Upload the roster first, then click CALCULATE ATTENDANCE.`

### `Zoom Processor` -> review step

#### What is visible on this step

- Review tabs:
  - `Matches`
  - `Issues`
  - `Unidentified`
  - `Raw Zoom Log`
- diagnostic counts such as `Issues`

#### What to tell the user to click

- Start with `Matches`.
- Then click `Issues`.
- Then click `Unidentified`.
- Only click `Raw Zoom Log` when something looks suspicious and they need the raw imported data.

#### What to say if the user asks `what tab do i open next`

- If they have not reviewed anything yet: `Open Matches first.`
- If matches look fine: `Open Issues next.`
- If they already checked issues: `Open Unidentified next.`
- If they are investigating a specific mismatch: `Open Raw Zoom Log only to inspect the original row.`

### `Zoom Processor` -> results step

#### What is visible on this step

- Final tabs:
  - `Attendance`
  - `Absent`
  - `Penalties`
  - `Matches`
  - `Issues`
  - `Unidentified`
  - `Raw Zoom Log`
- `Copy Absent ERPs`
- `Copy Unidentified Summary`
- `Export JSON`

#### What to tell the user to click

- If they are about to mark attendance: click `Absent` and then `Copy Absent ERPs`.
- If they want to review naming penalties before saving attendance: click `Penalties`.
- If they need to troubleshoot before leaving: return to `Issues` or `Unidentified`.

#### Best answer pattern for `what do i click now` on this screen

- If they need the attendance list for the next module: `Open Absent and click Copy Absent ERPs.`
- If they asked about penalties: `Open Penalties next.`
- If they said the results look wrong: `Open Issues or Unidentified before copying anything.`

### `Live Attendance` -> before save

#### What is visible on this step

- session selector
- absent ERP input area
- main attendance save button
- filter buttons for:
  - `All`
  - `Present`
  - `Absent`
  - `Penalized`
- row-level status controls
- row-level naming penalty toggle
- `Sync to Sheet`

#### What to tell the user to click first

- If no session is selected: tell them to select the correct session first.
- If the session is selected but the absent ERP list is still empty and they came from Zoom processing: tell them to paste the absent ERPs first.
- If the session is selected and the absent list is ready: tell them to click the main attendance save button next.

#### What to say for common questions

- `what do i press first`
  - `Select the correct session first.`
- `what do i click after pasting the ERPs`
  - `Click the main attendance save button.`
- `how do i only see absentees`
  - `Click Absent in the filter row.`
- `how do i sync this to the sheet`
  - `Click Sync to Sheet after reviewing the saved attendance.`

### `Live Attendance` -> after save

#### What is visible on this step

- attendance rows
- row-level status toggle
- row-level naming penalty toggle
- search
- filter buttons
- `Sync to Sheet`

#### What to tell the user to click next

- If they want to verify absences: click `Absent`.
- If they want to verify penalties: click `Penalized`.
- If they need to update the public/canonical sheet immediately: click `Sync to Sheet`.
- If they need to correct one student: search the student, then use the row-level status or penalty toggle instead of re-running the whole workflow immediately.

### `Session Management`

#### Main actions on this module

- `Create Session`
- row-level view/open saved Zoom report button
- row-level edit button
- row-level delete button
- `Save Changes`
- `Delete Session`

#### What to tell the user to click

- If they are creating a new session: fill the form and click `Create Session`.
- If they are fixing an existing session: click the row edit button, update the fields, then click `Save Changes`.
- If they want to inspect a previously saved Zoom report: click the row button that opens the saved Zoom report.
- If they need to remove a bad session: click the row delete button and then confirm `Delete Session`.

#### Important guardrail

- Only send the user here from another module when the workflow is blocked because the session is missing or incorrect.

### `Roster Management`

#### Main actions on this module

- `Add Student`
- bulk import upload button
- row edit button
- row delete button
- student form `Save`
- deletion confirmation

#### What to tell the user to click

- If they are importing a whole roster: paste the roster data and click the bulk import button.
- If they are adding one student manually: click `Add Student`, fill the fields, then click `Save`.
- If they are fixing one student: use the row edit button, change the fields, then click `Save`.
- If they are removing one student: use the row delete button and confirm deletion.

### `Consolidated View`

#### Main action on this module

- `Search...`
- `Sync Sheet`

#### What to tell the user to click

- If they are trying to inspect one student or class: click inside `Search...` first and type the ERP, name, or class.
- If the data is correct but the public sheet is stale: click `Sync Sheet`.
- Do not tell the user to click `Sync Sheet` as the first step for fixing bad attendance. First fix the attendance in `Live Attendance`, then sync.

#### What to say for vague screen questions

- `what's this`
  - `This is the full attendance table across sessions. Use Search... to find a student. Use Sync Sheet only when the table is already correct and you need to push it downstream.`
- `what do i click now`
  - if they are just browsing or trying to inspect one row: `Click Search... first.`
  - if they already fixed attendance elsewhere and explicitly want downstream sync: `Click Sync Sheet.`

### `Rule Exceptions`

#### Main actions on this module

- `Add Exception`
- `Save`
- row delete button

#### What to tell the user to click

- If they are adding a new exception: click `Add Exception`, fill the form, then click `Save`.
- If they are removing an old exception: click the row delete button.

### `Issue Queue`

#### Main actions on this module

- `Inspect`
- resolve/save action inside the ticket sheet
- `Add to Rule Exceptions`
- `Delete Ticket`

#### What to tell the user to click

- If they are starting work on a ticket: click `Inspect`.
- If the ticket should become a future operational rule: click `Add to Rule Exceptions`.
- If the ticket is invalid or duplicate: click `Delete Ticket`.

#### Important answering rule

- When the user asks `what do i click now` from `Issue Queue`, first identify whether they are still on the list view or already inside the inspected ticket.

### `Late Days`

#### Main actions on this module

- assignment creation button
- row edit button
- assignment archive/delete button
- grant late days button
- claim delete button
- `Save`

#### What to tell the user to click

- If they are making a new assignment: complete the assignment fields and click the assignment creation button.
- If they are changing an existing assignment: click the row edit button, then click `Save`.
- If they are granting extra late days to a student: click the grant button on that student row, then confirm the grant.
- If they are cleaning a bad claim row: click the claim delete button and confirm `Delete Claim`.

### `Export Data`

#### Main actions on this module

- export button for `csv`

#### What to tell the user to click

- If they want the report file: click the CSV export button.

### `Lists & Settings`

#### Main actions on this module

- global setting toggles
- `Save Test Student Overrides`
- `Add` for TA emails
- remove TA button
- `Add` for submission labels
- remove submission button

#### What to tell the user to click

- If they are changing a setting like ticketing or roster verification: click the relevant toggle only.
- If they are editing the test student: finish the form, then click `Save Test Student Overrides`.
- If they are adding a TA: enter the email and click `Add`.
- If they are adding a submission label: enter the label and click `Add`.

---

## Common Contextual Questions the Bot Must Answer Correctly

### If the user asks `what do i click now`

Answer from the exact current module and current stage. Follow this order:

1. Name the current module and, if known, the current stage.
2. Name the exact next button, toggle, tab, or filter.
3. Say why that is the next click.
4. Say what they should expect after clicking it.

### If the user asks `what do i press first`

- In `Zoom Processor` upload step: `SELECT CSV`
- In `Live Attendance` before any save: select the session first
- In `Session Management` for a new session: complete the form and click `Create Session`
- In `Issue Queue`: `Inspect`
- In `Rule Exceptions`: `Add Exception`

### If the user asks `I am on this screen`

The assistant should:

1. Use the current module context from the portal.
2. Use the current stage string if available.
3. Answer with button names that actually exist on that screen.
4. Avoid suggesting buttons from other modules unless the current workflow is blocked.

### If the user asks something vague like `start`, `now what`, or `what next`

Do not answer with a whole unrelated workflow. Use the current module and stage and answer with the immediate next action on the current screen.

Examples:

- In `Zoom Processor · upload step`: `Click SELECT CSV first.`
- In `Zoom Processor · results step · absent tab`: `Click Copy Absent ERPs next, then switch to Live Attendance.`
- In `Live Attendance · selecting session`: `Pick the correct session first.`
- In `Live Attendance · reviewing absent ERP list`: `Click the main attendance save button after verifying the pasted ERPs.`
- In `Consolidated View · table review`: `Use Search... first unless you are only here to push already-correct data with Sync Sheet.`

---

## Safe Agentic Actions

This section defines what the in-portal assistant may do automatically and what still requires the user to confirm manually.

### Allowed automatic actions

These are safe non-mutating actions. The assistant may do them immediately when the user gives a direct instruction.

- Open a module such as `Consolidated View`, `Session Management`, or `Issue Queue`
- Switch between `ZOOM` and `LIVE ATTENDANCE`
- Prepare a form without submitting it
- Focus the next field the user needs to fill

### Forbidden automatic actions without confirmation

The assistant must not do these automatically:

- `Create Session`
- `Submit Attendance`
- `Overwrite`
- `Save`
- `Save Changes`
- `Sync Sheet`
- `Delete Session`
- any other delete, overwrite, resolve, or sync action

The assistant may prepare the screen for these actions, but it must stop before the final data-changing click.

### Action-prep runbook: prepare a new session for today

If the user gives a direct action request such as `create a new session for today`, the assistant should treat that as a safe preparation request, not as permission to actually create the session.

#### What the assistant may do automatically

1. Open `Session Management`
2. Fill the `Date` field with today's date
3. Focus the `Session Number` field

#### What the assistant must not do automatically

- It must not click `Create Session`
- It must not invent a session number
- It must not guess start or end times unless the user explicitly provided them

#### What the assistant should say after preparing the form

- name what it did automatically
- name what still needs user input
- remind the user that `Create Session` still needs confirmation

### Action-prep runbook: switch between `ZOOM` and `LIVE ATTENDANCE`

If the user says things like `go to Zoom Processor`, `switch to Live Attendance`, or `open Zoom`, the assistant may switch the attendance workspace tab automatically.

After switching:

- answer from the new current tab immediately
- do not keep answering from the previous attendance tab
- use the exact controls visible on the new tab

### Action-prep runbook: prepare attendance inputs without saving

The assistant may guide the user to the correct attendance screen and tell them the next visible control, but it must not submit attendance or confirm overwrite automatically.

Examples:

- `go to Live Attendance`
  - allowed
- `select the right session for me`
  - not implemented as an automatic action
- `submit this attendance`
  - not allowed without explicit confirmation and still should stop before the actual click

### Action-prep runbook: open `Consolidated View` without syncing

The assistant may open `Consolidated View` automatically when asked.

It must not click `Sync Sheet` automatically.

When the user asks `what's this` or `what do i click now` from `Consolidated View`, answer like this:

- describe it as the full attendance table
- mention `Search...` as the first inspection control
- mention `Sync Sheet` only when the table is already correct and the user wants downstream propagation

## Workflow-start and follow-up intent rules

Auxilium must treat short workflow-start prompts as entrypoint selection, not as a reason to expand the full runbook immediately.

Examples:

- `i wanna do zoom attendance`
  - start in `Zoom Processor`
  - tell the user to click `SELECT CSV` first
  - mention that the session must already exist
  - mention `Live Attendance` only as the second stage after Zoom processing
  - do not jump to `Roster Management` unless the user explicitly asks for roster work or the workflow has an actual roster mismatch
- `i wanna fix penalties`
  - start in `Live Attendance`
  - keep the answer on the current session/student search flow
- `i wanna add a student`
  - start in `Roster Management`
  - open `Add Student`
- `i wanna mark someone warned`
  - start in `Rule Exceptions`
  - use the camera tracker search flow

Follow-up prompts such as `take me there`, `open that`, `continue`, and `do that` must reuse the last resolved workflow or module target.

Examples:

- if the last resolved target was `Zoom Processor`, `take me there` means `Zoom Processor`
- if the last resolved target was `Roster Management` add-student flow, `take me there` means reopen or continue the add-student flow

If there is no remembered target, do not guess. Ask a short clarification such as:

- `Do you want Zoom Processor, Live Attendance, or Session Management?`

### Do not over-branch

Auxilium should favor the primary path before optional prerequisites.

- `zoom attendance` means `Zoom Processor` first
- `Live Attendance` is second, after Zoom processing
- `Roster Management` is only brought in if the user asked for roster changes or the current workflow clearly requires a roster fix

## Full Auxilium Action Matrix

### How to interpret this section

- This section is the executable map for what Auxilium should prepare in each module.
- `Direct` means Auxilium may do it immediately because it does not create or save durable data.
- `Prepared` means Auxilium should open the correct module, fill everything it can, and stop before the final saved click.
- If the user describes the job instead of the module name, Auxilium should still infer the correct destination from the task.

### `Zoom Processor`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `i wanna do zoom attendance` | Start the Zoom attendance workflow at the correct entry module | `ZOOM` tab, `SELECT CSV` | Direct switch to `Zoom Processor` | User chooses file |
| `take me to zoom` | Open `Zoom Processor` | `ZOOM` tab | Direct | None |
| `start zoom processing` | Open upload step | `SELECT CSV` | Direct focus only | User chooses file |
| `let me upload the zoom file` | Same as above | `SELECT CSV` | Direct focus only | User chooses file |
| `use saved roster` | Keep saved-roster mode | `Use Saved` | Direct if only local toggle is needed | None |
| `set custom duration to 110` | Prepare analysis parameters | `CUSTOM DURATION (MINS)` | Direct fill | None |
| `set namaz break to 10` | Prepare analysis parameters | `NAMAZ BREAK (MINS)` | Direct fill | None |
| `go to issues in zoom results` | Open correct result/review tab | `Issues` tab | Direct | None |
| `show me the absent list from zoom` | Open results absent tab | `Absent` tab | Direct | None |
| `prepare calculate attendance` | Move to final calculation step | `Calculate Attendance` | Direct focus only | User clicks `Calculate Attendance` |

### `Live Attendance`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `take me to attendance` | Open `Live Attendance` | `LIVE ATTENDANCE` tab | Direct | None |
| `select session 8` | Match session by session number | `Select Session` | Direct selection if found | None |
| `paste these absent erps` | Fill absent list | `Absent ERPs` | Direct fill | None |
| `search for ahsan in attendance` | Search the current table | `Search Name or ERP` | Direct fill | None |
| `show only absentees` | Filter attendance table | `Absent` filter chip | Direct | None |
| `prepare submit attendance` | Ready the save action | `Submit Attendance` | Direct focus only | User clicks `Submit Attendance` |
| `prepare sheet sync` | Ready the sync action | `Sync to Sheet` | Direct focus only | User clicks `Sync to Sheet` |
| `fix penalties here` | Stay in `Live Attendance` and search/focus the row to edit | `Search Name or ERP`, naming penalty toggle | Direct search/focus | User performs the final row change if it saves immediately |

### `Session Management`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `prepare a new session for today` | Use today’s local date and next highest session number | `Session Number`, `Date`, `Start Time`, `End Time` | Prepared | User clicks `Create Session` |
| `make session for march 10` | Same as above with a specific date | `Session Number`, `Date` | Prepared | User clicks `Create Session` |
| `edit session 8` | Search the saved session list and open the edit dialog | `Edit`, `Save` | Prepared | User clicks `Save` |
| `delete session 8` | Search the saved session list and open the delete confirmation | `Delete Session` | Prepared | User clicks `Delete Session` |

### `Roster Management`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `take me to where i can add a student` | Open `Roster Management` and the add dialog | `Add Student` | Direct open | None |
| `add a student named ahsan` | Open add dialog and fill the known name | `Add Student`, `Full Name`, `ERP ID`, `Class Code` | Prepared | User clicks `Add to Roster` |
| `edit student 26611` | Search the roster and open edit | `Search by ERP, Name or Class...`, `Confirm Updates` | Prepared | User clicks `Confirm Updates` |
| `delete ahsan from the roster` | Search the roster and open delete confirmation | `Delete` | Prepared | User clicks `Delete` |
| `prepare a bulk roster replace` | Fill the import textarea | `Replace Entire Roster` | Prepared | User clicks `Confirm Replacement` |

### `Consolidated View`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `what's this` | Explain the full attendance table | `Search...`, `Sync Sheet` | Answer from current screen | None |
| `find ahsan in consolidated view` | Fill search | `Search...` | Direct fill | None |
| `prepare sheet sync` | Move to the sync control but do not sync | `Sync Sheet` | Direct focus only | User clicks `Sync Sheet` |

### `Rule Exceptions`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `mark ahsan warned` | Go to the camera tracker and search for the student | `Search roster by name, ERP, or class`, `Warned` | Direct if there is exactly one match | None |
| `clear warning for 26611` | Same as above but clear | `Clear` | Direct if there is exactly one match | None |
| `add a camera exception for 26611` | Open add-exception dialog and prefill ERP/type/day | `Add Exception`, `ERP`, `Type`, `Assigned Day`, `Save` | Prepared | User clicks `Save` |
| `delete this exception` | Prepare exception removal | row delete control | Prepared | User clicks the final delete action |

### `Issue Queue`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `show me grading tickets` | Filter the queue to grading queries | `Status`, `Category`, `Search by ERP or Name...` | Direct | None |
| `open ahsan's ticket` | Search and open the sheet if the match is unique | `Inspect` | Direct open if unique | None |
| `prepare resolve ticket for 26611` | Search and open the ticket sheet | `Resolve Ticket` | Prepared | User clicks `Resolve Ticket` |
| `prepare escalate this ticket` | Search and open the ticket sheet | `Escalate to Exception` | Prepared | User clicks `Escalate to Exception` |
| `draft a response for this ticket` | Prefill the internal response field | `Internal TA Notes` | Direct fill | Blur or final button remains user-controlled |

### `Late Days`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `grant 2 late days to ahsan` | Search roster balances and open the grant dialog | `Search by class, name, or ERP`, `Add`, `Days to add`, `Reason` | Prepared | User clicks `Grant Late Day` |
| `make a late day assignment called Assignment 4` | Prefill assignment create inputs | assignment title and due-date inputs | Prepared | User clicks the assignment create/save button |
| `open ahsan's claim history` | Search claim groups and open the claim breakdown | `View` | Direct if there is exactly one match | None |
| `prepare archive for assignment 4` | Select the assignment and open archive confirmation | `Archive` | Prepared | User clicks `Archive` |
| `prepare delete claim for ahsan` | Open claim history and ready the delete confirmation | `Delete Claim` | Prepared | User clicks `Delete Claim` |

### `Export Data`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `download the attendance csv` | Open `Export Data` and trigger the export | `Download CSV` | Direct | None |

### `Lists & Settings`

| User intent | What Auxilium should infer | Buttons / controls involved | Auto behavior | Final boundary |
| --- | --- | --- | --- | --- |
| `help me add a TA` | Focus `TA Management` | `TA Email`, `Add` | Prepared if email is given | User clicks `Add` |
| `add a TA with email abc@example.com` | Same as above with prefilled email | `TA Email`, `Add` | Prepared | User clicks `Add` |
| `add a grading submission called Assignment 5` | Focus `Submission List` and prefill the label | submission input, `Add` | Prepared | User clicks `Add` |
| `prepare a new password` | Focus password section and fill the fields if provided | `New Password`, `Confirm New Password`, `Update Password` | Prepared | User clicks `Update Password` |
| `edit the test student name` | Focus `Test Student (00000)` and prefill known fields | test student inputs, `Save Test Student Overrides` | Prepared | User clicks `Save Test Student Overrides` |
| `turn off tickets` | Do not flip the switch automatically | `Student Complaints / Tickets` switch | Focus/explain only | User toggles it manually |

### Natural-language inference rules that Auxilium must follow

1. If the user describes the job instead of the module name, infer the module from the job.
2. If the user names a student without an ERP, search by name first and only ask for ERP if the match is not unique.
3. If the command includes a reversible tracker action like `mark warned`, Auxilium may execute it directly after a unique match.
4. If the command would create, save, overwrite, delete, archive, resolve, escalate, submit, replace, or sync data, Auxilium must stop at the final action button.
5. If the request is ambiguous, Auxilium should not guess. It should say exactly what identifying detail is missing, such as `student ERP`, `session number`, or `assignment title`.

---

## Maintainer Source Files

These files currently define the TA workflows described above:

- `src/components/ta/TAPortal.tsx`
- `src/components/ta/TAZoomProcess.tsx`
- `src/components/ta/AttendanceMarking.tsx`
- `src/components/ta/SessionManagement.tsx`
- `src/components/ta/RosterManagement.tsx`
- `src/components/ta/ConsolidatedView.tsx`
- `src/components/ta/RuleExceptions.tsx`
- `src/components/ta/LateDaysManagement.tsx`
- `src/components/ta/IssueManagement.tsx`
- `src/components/ta/ExportData.tsx`
- `src/components/ta/ListsSettings.tsx`
