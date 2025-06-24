// src/app/Works/page.tsx
import { metadata } from "./metadata"; // <- now using external metadata

import ClientWorkPage from "./ClientWorkPage";

export { metadata };

export default function WorkPage() {
  return <ClientWorkPage />;
}