import "server-only";

import sanitizeHtml from "sanitize-html";

export function sanitizeLegalHtml(input: unknown) {
  return sanitizeHtml(String(input || ""), {
    allowedTags: [
      "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li", "blockquote", "a", "table", "thead", "tbody", "tr",
      "th", "td", "hr", "sup", "sub", "code",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      th: ["scope", "colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: "a",
        attribs: {
          ...attrs,
          rel: "noopener noreferrer nofollow",
          ...(attrs.target === "_blank" ? { target: "_blank" } : {}),
        },
      }),
    },
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}

