# Moving Proxima to a new repository

A clean source snapshot contains the application and migration files but no Git
history, dependency folders, build outputs, or local environment files. Extract
`Proxima-clean-source.tar.gz` into an empty directory, review the files, and run:

```sh
tar -xzf Proxima-clean-source.tar.gz -C path/to/empty-directory
cd path/to/empty-directory
git init
npm ci
npm run lint
npm run typecheck
npm test
npm run build
git add .
git commit -m "Initial Proxima snapshot"
```

Create your new private or public repository in GitHub, then follow its
instructions to add the new remote and push. Review the staged files first; never
commit credentials, `.env.local`, database exports, or Vercel's project folder.
The archive preserves developer guidance and app features; it is not a database
backup and does not contain existing chats, accounts, uploaded images or secrets.

## Vercel and database

- Create/import the new GitHub repository into a Vercel project. Configure its
  environment variables separately: the archive does not contain them. See
  `.env.example` and [DEPLOY.md](DEPLOY.md). `POLLINATIONS_API_KEY` must be the
  secret `sk_` key; use `IMAGE_PROVIDER=pollinations` for Pollinations only or
  `auto` to retain the documented fallback order. Do not paste keys into Git.
- To retain existing data, point the deployment at the existing database only
  after backing it up and confirming access. To start with an empty database,
  configure a new one. Deploy migrations using the documented deployment setup;
  do not reset an existing production database. Image bytes and chat history
  reside in the database, not the source archive.
- Review the public site URL and update OAuth provider callback URLs and email
  sign-in settings for the new Vercel domain. Redeploy after setting variables.
  Verify login, database, chat, image creation and editing on the new deployment.
- Pollinations usage is subject to key permissions, model availability and credits.
  This repository snapshot cannot verify your Vercel environment or account.
