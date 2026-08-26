# Gmail receipt integration — local setup

The Gmail integration is disabled by default. With no Google Cloud project,
BookSmart continues to run normally and the callback redirects to Settings with
`setup_required` instead of attempting mailbox access.

## Safe defaults

```text
GMAIL_INTEGRATION_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_GMAIL_REDIRECT_URI=http://localhost:8080/api/integrations/gmail/callback
GMAIL_STATE_SECRET=
GMAIL_TOKEN_ENCRYPTION_KEY=
```

Do not commit real values. Gmail requests only
`https://www.googleapis.com/auth/gmail.readonly`. The integration cannot send,
delete, label, move, archive, or mark messages read. Gmail evidence must never
create or modify a BookSmart transaction.

## When Google Cloud is ready

1. Enable the Gmail API.
2. Configure the OAuth consent screen and add the developer account as a test user.
3. Create a Web application OAuth client.
4. Register the exact redirect URI shown above.
5. Generate independent high-entropy values for the two Gmail secrets.
6. Apply `20260908_gmail_receipt_connections.sql` to the local Supabase database.
7. Set `GMAIL_INTEGRATION_ENABLED=true` and restart the API.

The callback URL is not opened directly. Google calls it with one-time `code`
and `state` parameters after the user approves access.
