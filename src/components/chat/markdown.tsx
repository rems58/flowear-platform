'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Rendu Markdown des réponses. Aucun HTML brut n'est interprété (pas de rehype-raw) :
 * une balise dans une réponse s'affiche comme du texte.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-flowear">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
