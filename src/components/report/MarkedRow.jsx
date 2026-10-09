/**
 * One row of the reviewed sheet and its mark (a score, a tick or a "Fix"
 * flag). On a wide sheet the mark sits in the margin column, level with the
 * row's first line; on a narrow one, at the row's right end.
 */
function MarkedRow({ mark, children }) {
  return (
    <li className="marked-row">
      <div className="marked-row-body">{children}</div>
      <div className="marked-row-mark">{mark}</div>
    </li>
  );
}

export default MarkedRow;
