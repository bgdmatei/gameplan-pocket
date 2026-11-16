# Domain docs

One context: the game logbook. Two places hold its language and its decisions.

- **`CONTEXT.md`** (repo root): the glossary. The words the code, specs and issues use, with what each means here. When a new term appears in a spec or a review settles what a word means, add it.
- **`docs/adr/`**: architecture decision records, numbered `NNNN-kebab-title.md`. One decision each: context, options weighed, the choice and its consequences. A decision revisited gets a new ADR that supersedes the old one, which stays.

Read `CONTEXT.md` before naming anything new. Use its words exactly in code, issues and commits; if a word doesn't fit, raise it rather than inventing a synonym.
