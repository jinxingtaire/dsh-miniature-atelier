# Creation and revision workflow

[简体中文](WORKFLOW.md) · **English**

## Mechanical motion, exploded views, and production lines

Choose a workflow on the Create tab and describe the subject and intended effect. Review the suggested parameters or enter your own. Examples provide starter descriptions. You can specify motion relationships, style, lighting, controls, reference images, and constraints. **在 DSH 制作** (Create in DSH) saves a snapshot and sends the task to a native DSH session. After the session makes and checks the HTML, find it in Works, import it, and open it to continue revising.

**先编辑完整制作稿** (Edit full task first) opens an independent text draft. Subsequent sends, copies, and downloads use that edited draft. Returning to the form keeps the draft. Each of the three workflows has separate saved requirements. Switching to an example backs up a different set of existing inputs, even if those inputs have yet to pass validation.

- **Mechanical motion.** Describe the movement and constraints for any mechanism. Set the starting speed and choose controls such as cutaway view, pause, and speed adjustment. Linked parts share the same timing and geometry model. Display engineering quantities only when they have been computed.
- **Exploded views.** Describe the parts and the order of assembly. Choose an assembled, cutaway, or exploded starting view. Pause mechanism motion while the parts are separated, resume it after reassembly, and check that repeated cycles return parts to the same positions.
- **Production lines.** Set the name, cycle time, and equipment count for each of 2–12 workstations. Cycle times and arrival intervals can span 0.1–3600 seconds. Each station supports 1–12 parallel units, and buffers hold 1–50 items. The task calls for full queues to block upstream stations, for live counts to track the actual simulation state, and for item counts to balance. Parameters are demonstration assumptions by default.

DSH creates the actual visuals and simulation from the task. Review each generated model to verify its behavior and presentation.

## Guided design

Supply a description, a reference image, or both. Uploading an image starts analysis and generates an editable creative intent. You can clear or rerun that intent. Choose one of the three proposed directions, adjust structure, colors, lighting, details, and camera, then review the plan. You can refine the prompt, save a full-text draft, or send the task to a native session. Find or import the finished HTML from Works, then preview or download it.

Copy, download, and send use the current plan as written. Prompt refinement runs when explicitly requested.

## Free editing

Start with an example, an editable template, a copy of a guided plan, or an existing work's prompt. Full-text drafts save locally. You can keep and restore up to 10 manually saved versions. Restoring a version first saves the current state. Choosing a new example creates a separate draft.

The target file and output directory are editable. Relative paths resolve against the DSH session workspace. An output directory controls where the file is saved. Use the session workspace selector to change the workspace itself.

## Revising a work

Open an existing work and give the original HTML path, requested edits, and details to preserve. **在 DSH 修改** (Revise in DSH) saves a separate task and sends it to a new session. The task asks DSH to copy the original, revise the copy, and verify the new HTML. Refresh Works to find and import it. Use **先编辑修改稿** (Edit revision draft first) to review the task before sending it.

## Discovering and importing works

Works scans the latest 30 sessions visible to the host, with an option to check older sessions. It looks for relevant prompts and finished HTML files, filters out assembly templates, and ranks likely results. Search applies to both saved and discovered works. Completed sessions appear after a refresh. Discovery reads session records locally and reserves HTML import for the user's explicit action. Import rechecks the file before saving it.

After importing, the work can open while the plugin tries to capture a cover in the background for up to eight seconds. If the capture fails, the work keeps its text placeholder and the saved HTML.

## Compatibility and verification

Existing templates, custom styles, works, and historical jobs remain accessible. Supported entry points are guided design, free editing, and native DSH sessions. Review the session's actual output path and browser checks. Creating or sending a task marks the start of production. A finished work requires the saved HTML and a preview that exercises its intended interactions.
