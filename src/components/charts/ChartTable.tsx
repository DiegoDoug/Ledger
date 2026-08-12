/**
 * A chart is an image to assistive technology. Every chart renders this
 * visually-hidden table alongside it so the same figures are readable in a
 * screen reader, and copyable, without a second data model.
 */
export function VisuallyHiddenTable({
  caption,
  headers,
  rows,
}: {
  caption: string
  headers: string[]
  rows: string[][]
}) {
  return (
    <table className="sr-only absolute h-px w-px overflow-hidden">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
