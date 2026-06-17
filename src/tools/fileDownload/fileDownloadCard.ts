/**
 * Build an Adaptive Card that shows the user a download link for a
 * generated file. The card uses `Action.OpenUrl` so it works in 1:1
 * chats, group chats, and channels alike — clicking opens the URL in
 * the user's browser, which then streams the file from the bot.
 */
export function createFileDownloadCard(opts: {
  filename: string;
  downloadUrl: string;
  description?: string;
  previewBody?: any[];
}) {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      {
        type: "TextBlock",
        text: `📄 ${opts.filename}`,
        weight: "Bolder",
        size: "Medium",
        wrap: true
      },
      ...(opts.description
        ? [
            {
              type: "TextBlock",
              text: opts.description,
              wrap: true,
              isSubtle: true
            }
          ]
        : []),
      ...(opts.previewBody && opts.previewBody.length > 0
        ? [
            {
              type: "Container",
              separator: true,
              spacing: "Medium",
              style: "emphasis",
              items: [
                {
                  type: "TextBlock",
                  text: "Forhåndsvisning",
                  weight: "Bolder",
                  size: "Medium",
                  wrap: true
                },
                ...opts.previewBody
              ]
            }
          ]
        : [])
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "Last ned",
        url: opts.downloadUrl
      }
    ]
  };
}
