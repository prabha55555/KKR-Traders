/**
 * One colour per kind of status, everywhere in the app (badges, chips, status cards):
 *  success (green)  completed · paid · settled · received · done · in stock
 *  warning (yellow) pending · partial / part paid · waiting · low stock · returned / refunded
 *  danger  (red)    rejected · failed · cancelled · unpaid · overdue · due · out of stock · oversold
 *  info    (blue)   processing · in progress · at dyeing / combing · sent
 *  neutral (grey)   anything else
 * Pass the status text (or a key such as 'AT_DYEING'); the first matching rule wins, checked in the order below so
 * "Unpaid" is red and "Partially paid" yellow before "paid" is seen.
 */
export const STATUS_TONES = ['success', 'warning', 'danger', 'info', 'neutral'];

const RULES = [
  ['success', /\b(no (due|balance)|nothing due|fully paid)\b/i],
  [
    'danger',
    /\b(un ?paid|not paid|overdue|fail(ed|ure)?|reject(ed)?|cancel(l?ed)?|out of stock|over ?sold|negative|error|due)\b/i,
  ],
  [
    'warning',
    /\b(pending|partial(ly)?|part paid|waiting|coming|low( stock)?|draft|on hold|hold|return(s|ed)?|refund(s|ed)?)\b/i,
  ],
  ['success', /\b(paid|settled|complete(d)?|done|received|in stock|restored|cleared|closed|success|ok)\b/i],
  [
    'info',
    /\b(process(ing|ed)?|in progress|progress|in dyeing|in combing|at[ _]dyeing|at[ _]combing|sent|transit|open)\b/i,
  ],
];

/** 'success' | 'warning' | 'danger' | 'info' | 'neutral' for a status text / key. */
export function statusTone(status) {
  const text = String(status ?? '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!text) return 'neutral';
  for (const [tone, re] of RULES) if (re.test(text)) return tone;
  return 'neutral';
}
