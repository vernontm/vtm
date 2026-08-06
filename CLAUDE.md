# VTM

Vernon Tech & Media's main site and eCRM (vernontm.com). CRM client changes require running `bash build-crm.sh` and committing the `New/admin/` bundle, or the deploy ships a stale admin app.

## How sessions must finish

Any session that changes code in this repo finishes the job itself before ending:
1. Commit all work on a claude/* branch.
2. Push the branch explicitly (git push -u origin claude/<slug>).
3. Create the PR yourself with gh pr create and put the PR URL in your final reply.

Never end by pointing at a GitHub compare page or telling Ray to click a Create PR button. If you made no changes, say "no changes, nothing to ship" explicitly instead of offering a PR. (Ray himself pushes to main directly in local interactive sessions; the branch-and-PR finishing rule is for cloud and Slack sessions.)

No em dashes anywhere: code comments, commits, PR bodies, UI copy.
