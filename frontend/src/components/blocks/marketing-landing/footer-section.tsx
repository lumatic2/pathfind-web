type FooterColumn = {
  heading: string
  links: string[]
}

type FooterSectionProps = {
  product: string
  tagline: string
  columns: FooterColumn[]
  legal: string
}

/** Closing footer: product identity left, link columns right, legal line under a divider. */
export function FooterSection({ product, tagline, columns, legal }: FooterSectionProps) {
  return (
    <footer className="border-t">
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-14 md:grid-cols-[2fr_repeat(3,1fr)]">
        <div>
          <p className="text-sm font-semibold text-foreground">{product}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{tagline}</p>
        </div>
        {columns.map((column) => (
          <nav aria-label={column.heading} key={column.heading}>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">{column.heading}</p>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link}>
                  <a className="text-sm text-foreground/80 transition-colors hover:text-foreground" href="#">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <p className="mx-auto w-full max-w-5xl px-6 py-6 text-xs text-muted-foreground">{legal}</p>
      </div>
    </footer>
  )
}
