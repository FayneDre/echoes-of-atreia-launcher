import { Fragment } from 'react'

/**
 * The little Markdown the release notes use: headings, paragraphs, lists (an item may wrap onto indented lines), bold, code and rules. Built as
 * React elements, never as HTML: the notes come from a download.
 */
export function Markdown({ text, testId }: { text: string; testId?: string }): React.JSX.Element {
  return (
    <div className="markdown" data-testid={testId}>
      {blocks(text).map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return <h4 key={index}>{inline(block.text)}</h4>
          case 'rule':
            return <hr key={index} />
          case 'list':
            return (
              <ul key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{inline(item)}</li>
                ))}
              </ul>
            )
          default:
            return <p key={index}>{inline(block.text)}</p>
        }
      })}
    </div>
  )
}

type Block = { kind: 'heading' | 'paragraph'; text: string } | { kind: 'rule' } | { kind: 'list'; items: string[] }

function blocks(text: string): Block[] {
  const result: Block[] = []
  let paragraph: string[] = []
  let list: string[] | null = null
  const flush = (): void => {
    if (paragraph.length) {
      result.push({ kind: 'paragraph', text: paragraph.join(' ') })
      paragraph = []
    }
    if (list) {
      result.push({ kind: 'list', items: list })
      list = null
    }
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
    } else if (/^#{1,6} /.test(line)) {
      flush()
      result.push({ kind: 'heading', text: line.replace(/^#+ /, '') })
    } else if (/^-{3,}$/.test(line.trim())) {
      flush()
      result.push({ kind: 'rule' })
    } else if (/^[-*] /.test(line)) {
      if (paragraph.length) {
        flush()
      }
      list ??= []
      list.push(line.slice(2).trim())
    } else if (list && /^\s+/.test(line)) {
      list[list.length - 1] += ` ${line.trim()}`
    } else {
      if (list) {
        flush()
      }
      paragraph.push(line.trim())
    }
  }
  flush()
  return result
}

/** Bold and code inside a line; everything else is text. */
function inline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}
