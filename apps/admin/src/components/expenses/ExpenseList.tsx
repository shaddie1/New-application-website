import type { ExpenseDto } from '@onyxhawk/types';
import { lineDetailText } from '../../lib/expenseLine';
import { money } from '../../lib/money';
import { CATEGORY_LABELS } from './ExpenseForm';

/**
 * What an expense's amount is made of and its receipt number, each on a line
 * of its own, for an expense that has them. Nothing for one typed as an amount.
 */
function ExpenseDetail({ expense }: { expense: ExpenseDto }) {
  const detail = lineDetailText(expense);
  return (
    <>
      {detail && <span className="block text-xs tabular-nums">{detail}</span>}
      {expense.receiptRef && <span className="block break-all text-xs">Receipt: {expense.receiptRef}</span>}
    </>
  );
}

/**
 * A job's expenses: a table from tablet width up, and on a phone one block for
 * each expense, because five columns do not fit a phone and the amount was the
 * one cut off. `dense` is the smaller table inside a waiting report. With
 * `onDelete` each expense gets a Delete button.
 */
export function ExpenseList({
  expenses, dense, onDelete, deletingId,
}: {
  expenses: ExpenseDto[];
  dense?: boolean;
  onDelete?: (expense: ExpenseDto) => void;
  deletingId?: string | null;
}) {
  const cell = dense ? 'px-3 py-1.5' : 'px-5 py-2';
  const deleteButton = (ex: ExpenseDto) => onDelete && (
    <button
      onClick={() => onDelete(ex)}
      disabled={deletingId === ex.id}
      className="text-danger text-xs hover:underline disabled:opacity-40"
    >
      {deletingId === ex.id ? '…' : 'Delete'}
    </button>
  );
  return (
    <>
      <ul className={`divide-y divide-border sm:hidden ${dense ? 'text-xs' : 'text-sm'}`}>
        {expenses.map((ex) => (
          <li key={ex.id} className={`flex items-start justify-between gap-3 ${cell}`}>
            <div className="min-w-0 text-text-muted">
              <span className="block break-words text-text">{ex.description || CATEGORY_LABELS[ex.category]}</span>
              <ExpenseDetail expense={ex} />
              <span className="block text-xs">
                {ex.description ? `${CATEGORY_LABELS[ex.category]} · ` : ''}{ex.date}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <span className="block font-medium tabular-nums">{money(ex.amountCents)}</span>
              {deleteButton(ex)}
            </div>
          </li>
        ))}
      </ul>
      <table className={`hidden w-full sm:table ${dense ? 'text-xs' : 'text-sm'}`}>
        <thead>
          <tr className={`text-text-muted uppercase tracking-widest border-b border-border ${dense ? 'bg-bg-muted/40' : 'text-xs'}`}>
            <th className={`${cell} text-left font-normal`}>Date</th>
            <th className={`${cell} text-left font-normal`}>Category</th>
            <th className={`${cell} text-left font-normal`}>Item</th>
            <th className={`${cell} text-right font-normal`}>Amount</th>
            {onDelete && <th className={cell} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {expenses.map((ex) => (
            <tr key={ex.id} className={onDelete ? 'hover:bg-bg-muted/40' : undefined}>
              <td className={`${cell} text-text-muted ${dense ? '' : 'text-xs'}`}>{ex.date}</td>
              <td className={cell}>{CATEGORY_LABELS[ex.category]}</td>
              <td className={`${cell} text-text-muted`}>
                <span className="break-words">{ex.description || '—'}</span>
                <ExpenseDetail expense={ex} />
              </td>
              <td className={`${cell} text-right font-medium`}>{money(ex.amountCents)}</td>
              {onDelete && <td className={`${cell} text-right`}>{deleteButton(ex)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
