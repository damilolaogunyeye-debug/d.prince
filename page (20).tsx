import { MaterialsView } from "./view";

export default function MaterialsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  return <MaterialsView kind="handout" searchParams={searchParams} />;
}
