import { redirect } from 'next/navigation';
import { DEMO_FIELD_ID } from '@rice/contracts';

/** Landing "ดูตัวอย่างรายงาน" → /fields/demo → the seeded public demo field. */
export default function DemoFieldPage() {
  redirect(`/fields/${DEMO_FIELD_ID}`);
}
