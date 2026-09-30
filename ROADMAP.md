# Coach's Board — roadmap

Ideas agreed on but deliberately left for later. When picking up work on the
app, check here first.

## Next phase

- **Parents' view.** The student app is built (each student links their own
  claude.ai account with an invite code). Parents come next, separately:
  the same linking, plus payments and the balance, which students never see.

## Later

- **"Open in Lichess" button** in the game viewer: open the game on Lichess's
  analysis board (engine) at the move being viewed.
- **Payment reminders:** a button on a student who owes money that writes a
  polite reminder with the amount and opens WhatsApp, like the lesson
  summary does (`contactParts` and the summary window already do the
  WhatsApp part).
- **Safe editing on two devices:** each student is saved as a whole, so two
  devices editing the same student at nearly the same moment can overwrite
  each other (last save wins). Detect a newer stored version before saving
  and merge or warn.
- **Lesson packages:** prepaid packs of lessons (e.g. 10), showing how many
  are left and warning when a package runs out.

## Decided against (for now)

- Skill levels per student (the stored `skills` data is unused).
- A "cancelled but charged" status for late cancellations.
