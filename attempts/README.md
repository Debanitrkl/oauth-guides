# Recorded walkthroughs

One file per provider, `attempts/<slug>.json`, holding an array of `Attempt` records (see `lib/schema.ts`). The library loader merges them into the guide with the same slug, and claims that cite an attempt get the Tested label.

A walkthrough is recorded by a person with a real account. The agent never signs in, accepts terms, pays, uploads documents, or submits a review, so these files are written by hand after the fact, with the date and what was observed.
