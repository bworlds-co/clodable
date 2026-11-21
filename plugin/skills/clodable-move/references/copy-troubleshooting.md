# Copy troubleshooting

| What they see | Why | Way forward |
|---|---|---|
| Pages empty on the copy; the API says "Could not find the table … in the schema cache" | The copy runs with database hooks off, so the API's list of tables wasn't refreshed | `move diagnose --fix` |
| Sign-up says "Check your email", then nothing works | New Supabase projects want email confirmation, and their links go to `localhost:3000` | `move diagnose --fix` (lets the preview sign people in) |
| "2 free projects running, the most it allows" | Supabase counts free projects per person, across all their organizations | Pause one in Supabase (Project settings → Pause project), or pick an organization on a paid plan (about $10 a month) |
| Lovable says the database is too large to export | Lovable refused this export; the actual size and cause have not been checked | The builder resolves the export with Lovable before copying can continue |
| The export has 0 people | This export contains no people; that alone does not explain why | Compare its date and the expected sign-ins with the builder before accepting it or requesting another export |
| `role "sandbox_exec" does not exist` among the copy's notes | A role of Lovable's own | Harmless |
| Private files waiting | Reading them needs Lovable Cloud's service key | The panel explains how to get it and takes it |
| A feature is empty on the copy (a greeting, AI summaries) | Its server code reads `process.env.X`: those values live in the host's settings, not in Supabase | They paste each value in the panel once the site is on Netlify |
| "That export was made before the pause" | The zip in Downloads is the old one, or the pause SQL didn't run | Check the pause ran in Lovable (its SQL editor says so), export again, download the new zip |
| Domain stays "waiting for its records" | DNS not there yet, or entered differently | Compare each record at their provider with the panel's; give it an hour |
| AI features | They call Lovable's AI (`ai.gateway.lovable.dev`, `LOVABLE_API_KEY`) | The services step: their own provider's key, then you point the code at it |
| Sign-ups fail during the pause with "This app is moving to a new home" | The pause's guard, on purpose | It goes with the final copy (never copied); undo it in Lovable only if they're not switching after all |
