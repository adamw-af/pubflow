# PubFlow

A social media post scheduling SaaS. Users connect social accounts across multiple platforms and schedule content for automated publishing.

## Language

**User**:
A person authenticated via Clerk who has a PubFlow account and belongs to a Workspace.
_Avoid_: Customer, member, account

**Workspace**:
The top-level billing and ownership unit. Holds a subscription tier, timezone, and owns Social Accounts. Can have multiple Users on Premium tier. Has an IANA timezone string used to interpret scheduled times.
_Avoid_: Organization, team, account

**Workspace Member**:
A User with access to a Workspace. Has a role: `owner` (full access including billing and Social Account management) or `member` (can create, edit, and schedule Posts only). The owner is the User who created the Workspace.
_Avoid_: Team member, collaborator, user

**Social Account**:
A connected profile on a specific social platform (e.g. `@adam` on Twitter). Belongs to a Workspace. The subscription tier caps how many a Workspace may have.
_Avoid_: Channel, profile, connection

**Platform**:
A supported social network. v1 supports LinkedIn, Instagram, and X (Twitter). Future platforms: Facebook, TikTok, YouTube, Bluesky, Threads, Pinterest.
_Avoid_: Network, channel, integration

**Post**:
A unit of content created by a User, with a scheduled time and one or more target Social Accounts. A Post holds the canonical intent — what to publish, when, and where.
_Avoid_: Update, item, content

**Post Variant**:
The platform-specific version of a Post's content for a single Social Account. A Post has one Variant per target Social Account, allowing different captions, media, and formatting to suit each platform's constraints and best practices.
_Avoid_: Version, override, adaptation

**Publication**:
A single attempt to publish a Post Variant to its target Social Account. Has a lifecycle status: `scheduled`, `publishing`, `published`, `failed`. A Post has one Publication per target Social Account. Failed Publications are surfaced to the user for manual retry — no silent auto-retry.
_Avoid_: Job, task, delivery

**Post Status**:
The derived state of a Post: `draft` (being composed), `scheduled` (locked in, awaiting publish time), `published` (all Publications succeeded), `failed` (all Publications failed), `partial` (some Publications succeeded, some failed).

**Post Template**:
A recurring content blueprint owned by a Workspace. Holds a recurrence rule, target Social Accounts, and per-platform content. Generates one Post at a time (rolling): when a Post publishes, the next occurrence is created from the Template. Editing a Template only affects future Posts.
_Avoid_: Campaign, series, recurring post

**Hashtag Set**:
A named, reusable collection of hashtags owned by a Workspace. Users insert a Hashtag Set into a Post Variant caption with one click.
_Avoid_: Hashtag group, tag library, saved hashtags

**Recurrence Rule**:
The schedule definition on a Post Template. Supports `daily`, `weekly` (specific days of week), and `monthly` (specific day of month), plus a time-of-day and optional end date. Stored as a structured value, not a cron string.

**Media Item**:
An image or video file uploaded by a User to Cloudflare R2 and stored in the Workspace media library. Uploaded directly from the browser via a presigned URL. Referenced by Post Variants by ID — never duplicated on reuse.
_Avoid_: Asset, attachment, file, media
