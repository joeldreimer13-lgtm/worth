# Standalone Worth

This is the public, data-free app repository. Never add real financial records, account balances, backup files, tokens, secrets, old server bundles, or old provider seeds. The original private archive is a separate repository and must remain private.

GitHub Pages serves main /docs. No OpenAI hosting, sign-in, tools, or APIs are needed to run this app. Financial data stays in the user's browser IndexedDB. Each device has its own records; backups move data between them.

Update the app by editing src, running npm run build and npm test, and committing the generated docs output. Do not embed financial data as a convenient deployment shortcut. Before publishing, inspect the exact uploaded files. Preserve all touch interactions, theme support, atomic local writes, merge/revision checks, backups, and first-use restoration.

For data updates, prepare a private JSON/CSV import or a full Worth backup for the user. Do not commit it to this repository. The app's Add data and Import full backup interfaces are the update entrypoints. No code change or deployment is needed for new records.
