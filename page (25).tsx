import { MaterialsView } from "../materials/view";

export default function PastQuestionsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  return <MaterialsView kind="past_question" searchParams={searchParams} />;
}
