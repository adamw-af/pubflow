import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const sendPublicationFailureEmail = internalAction({
  args: {
    toEmail: v.string(),
    workspaceName: v.string(),
    platform: v.string(),
    platformUsername: v.string(),
    errorMessage: v.string(),
    postId: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL ?? "noreply@pubflow.com";

    if (!apiKey) {
      console.warn("RESEND_API_KEY not set — skipping failure notification email");
      return;
    }

    const platformLabel: Record<string, string> = {
      linkedin: "LinkedIn",
      instagram: "Instagram",
      x: "X (Twitter)",
    };

    const html = `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 8px;">A post failed to publish</h2>
        <p style="color: #666; margin: 0 0 24px;">
          One of your scheduled posts in <strong>${args.workspaceName}</strong>
          failed to publish to ${platformLabel[args.platform] ?? args.platform}.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 40%;">Platform</td>
            <td style="padding: 8px 0; font-weight: 500;">${platformLabel[args.platform] ?? args.platform}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Account</td>
            <td style="padding: 8px 0; font-weight: 500;">@${args.platformUsername}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Error</td>
            <td style="padding: 8px 0; color: #dc2626;">${args.errorMessage}</td>
          </tr>
        </table>
        <a href="${process.env.FRONTEND_URL}/dashboard/queue"
           style="display: inline-block; background: #000; color: #fff; text-decoration: none;
                  padding: 10px 20px; border-radius: 6px; font-weight: 500;">
          View in PubFlow
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">
          You can turn off these emails in
          <a href="${process.env.FRONTEND_URL}/dashboard/settings" style="color: #999;">Settings</a>.
        </p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: args.toEmail,
        subject: `Failed to post to ${platformLabel[args.platform] ?? args.platform} — PubFlow`,
        html,
      }),
    });

    if (!res.ok) {
      console.error("Resend email failed:", await res.text());
    }
  },
});
