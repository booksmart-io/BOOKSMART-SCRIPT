# BookSmart Backup Retention and Deletion Policy

**Status:** Deferred by the project owner for development on September 9, 2026.
Production backup controls remain required before launch.

**Date:** September 8, 2026

## Purpose

This policy prevents a database restoration from silently reactivating customer data that BookSmart previously deleted. It also records the limits of Supabase database backups and the evidence required before production approval.

## Supabase backup behavior

Supabase currently documents the following managed daily-backup windows:

| Project plan | Managed daily backup availability |
|---|---:|
| Free | No downloadable managed database backup; BookSmart must create and protect its own off-site logical backups if backups are required |
| Pro | Last 7 days |
| Team | Last 14 days |
| Enterprise | Up to 30 days |

Point-in-Time Recovery replaces daily backups when enabled. Its configured recovery window can be 7, 14, or 28 days.

Database backups contain the PostgreSQL database, including Auth records and Storage metadata. They do not contain the actual objects stored through the Supabase Storage API. Restoring a database backup therefore does not restore a storage object deleted after the backup.

Deleting an entire Supabase project permanently removes its database, Storage objects, Auth data, automated backups, and point-in-time recovery snapshots. Project deletion is not BookSmart's normal customer-account deletion mechanism.

Sources:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery
- https://supabase.com/docs/guides/platform/delete-project

## BookSmart customer-deletion behavior

The BookSmart owner-deletion workflow removes live database records, private Storage objects, integration credentials, billing identity, and the Supabase Auth identity. Hosted disposable-account acceptance confirmed those live-system removals and denial of the old session.

An older database backup can still contain database rows and Auth records that existed at its restore point. Those copies remain recoverable until the provider's configured backup window expires. Storage objects are outside the database backup and are not recreated by a database restore.

## Required restoration safeguard

Before any production restore, the operator must preserve an external deletion ledger that is newer than the selected restore point. The ledger must contain only the minimum identifiers needed to reapply deletions, protected independently from the database being restored.

After a restore and before reopening BookSmart traffic, the operator must:

1. Keep the application in maintenance mode.
2. Compare the external deletion ledger with the selected restore timestamp.
3. Reapply every customer deletion completed after that timestamp.
4. Remove any restored Auth identity, database record, integration credential, billing identity, and Storage metadata associated with those deletions.
5. Confirm that private Storage objects remain absent.
6. Deny and rotate restored integration credentials where provider revocation status is uncertain.
7. Run tenant-isolation and disabled-session smoke tests.
8. Record the restoration, deletion reconciliation, operator, timestamps, and results outside the restored database.
9. Reopen traffic only after all checks pass.

Without an independent deletion ledger, a restore must not be used for production recovery because BookSmart could not prove that post-backup deletions remained deleted.

## Confirmed target-project configuration

The project owner confirmed on September 8, 2026 that the target project uses the Supabase Free plan. Supabase does not provide downloadable managed database backups for Free-plan projects. There is therefore no customer-accessible managed backup retention window or restore history to certify for this project.

This closes the question of the project's current backup tier. It does not provide an acceptable production recovery control.

## Required Free-plan controls

Before BookSmart stores live customer financial data, choose one of these recovery controls:

1. Upgrade the production project to a paid plan with managed daily backups or Point-in-Time Recovery and record the configured window; or
2. Create encrypted off-site logical database backups on an approved schedule, restrict access, monitor failures, test restoration, and apply a documented retention and deletion schedule.

Any off-site backup must exclude secrets from job output, encrypt data in transit and at rest, use a destination outside the Supabase project, and record successful and failed runs. The retention window must be approved before collection begins.

## Current verification result

The project owner confirmed the Free plan. The application deletion implementation remains passed for the live system. The unresolved production item is selecting and testing a recovery mechanism with a documented retention window and deletion-aware restoration.

The project owner explicitly deferred this item on September 9, 2026 so remaining
development acceptance could continue. This is a temporary development disposition;
it does not satisfy production recovery or final launch approval.

## Acceptance decision

This item passes when all of the following are true:

- A paid managed-backup configuration or approved encrypted off-site backup process is active.
- Its backup type, schedule, destination, and retention window are recorded.
- The approved customer privacy policy states that deleted database data can remain recoverable only for that documented backup window.
- An external deletion ledger exists outside the restored database.
- The restore runbook requires deletion reconciliation before traffic resumes.
- A tabletop or non-production restore exercise proves the reconciliation procedure.
