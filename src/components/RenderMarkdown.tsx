import React, { Fragment } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Kept at module level so the component types stay the same across renders:
// new ones would remount the text, and React throws when it removes text
// nodes that a browser translator has replaced with its own.
const components: Components = {
  // rel guards against reverse tabnabbing — without it, the linked
  // page can navigate `window.opener` of the original tab. noreferrer
  // also strips the Referer header for privacy.
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

const inlineComponents: Components = {
  ...components,
  p: ({ children }) => <Fragment>{children}</Fragment>,
};

export default function RenderMarkdown({
  content,
  noClosingTag = true,
}: {
  content: string;
  noClosingTag?: boolean;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={noClosingTag ? inlineComponents : components}
    >
      {content}
    </ReactMarkdown>
  );
}
