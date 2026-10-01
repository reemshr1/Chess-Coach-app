# Coach's Board — roadmap

Ideas agreed on but deliberately left for later. When picking up work on the
app, check here first.

## Done

- **Student app** and **parents' view (families)**: students and parents link
  their own claude.ai accounts with invite codes; parents see balance and
  payments and can request, cancel or move lessons.

## Next phase

- **Design pass** over the coach, student and parent screens together.

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
