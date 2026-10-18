import { LotsView } from './LotsView';

/** Lots received back: final rolls / kg, weight loss, cost per kg, and what is still owed to the units. */
export default function CompletedLotsPage() {
  return <LotsView mode="completed" />;
}
